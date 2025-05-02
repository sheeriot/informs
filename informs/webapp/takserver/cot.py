# from django.conf import settings

from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import aidrequest_location, make_cot
from .models import TakServer

import asyncio
import pytak
from configparser import ConfigParser


# import time
from icecream import ic


class CotSender(pytak.QueueWorker):
    """
    Defines how you process or generate your Cursor on Target Events.
    From there it adds the CoT Events to a queue for TX to a COT_URL.
    """
    def __init__(self, queue, config):
        super().__init__(queue, config)
        self._connection_active = False
        self._cleanup_complete = False

    async def handle_data(self, data):
        try:
            self._connection_active = True
            await self.put_queue(data)
        except Exception as e:
            raise RuntimeError(f"Could not put_queue: {e}")

    async def verify_connection_state(self):
        """Verify the connection is truly closed by attempting a test connection."""
        try:
            if hasattr(self, 'writer') and self.writer:
                # If we can still write, connection isn't fully closed
                try:
                    self.writer.write(b'')
                    ic("WARNING: Connection still writable after cleanup")
                    return False
                except Exception:
                    # Expected - connection should be closed
                    pass
            return True
        except Exception as e:
            ic("Error verifying connection state:", e)
            return False

    async def cleanup(self):
        """
        Primary cleanup method following the proper TCP connection termination sequence.
        Any deviation from the expected cleanup path is logged for investigation.
        """
        if self._cleanup_complete:
            ic("WARNING: Cleanup called multiple times")
            return

        try:
            if self._connection_active:
                # 1. Stop accepting new data
                self._connection_active = False

                # 2. Drain the queue (with timeout)
                if hasattr(self, 'queue') and not self.queue.empty():
                    try:
                        async with asyncio.timeout(5):
                            while not self.queue.empty():
                                await asyncio.sleep(0.1)
                    except asyncio.TimeoutError:
                        ic("ERROR: Queue failed to drain in expected time - investigate queue handling")

                # 3. Proper TCP connection termination sequence
                if hasattr(self, 'writer') and self.writer:
                    try:
                        # Signal end of data
                        self.writer.write_eof()
                        await self.writer.drain()

                        # Close the writer
                        self.writer.close()
                        await self.writer.wait_closed()

                        # Brief pause for FIN-ACK sequence
                        await asyncio.sleep(0.5)
                    except Exception as e:
                        ic("ERROR: Failed to properly close writer - investigate connection handling:", e)
                        raise

                # 4. Verify connection state
                if not await self.verify_connection_state():
                    ic("ERROR: Connection verification failed - investigate cleanup sequence")

            # 5. Call parent cleanup as final step
            if hasattr(super(), 'cleanup'):
                await super().cleanup()

            self._cleanup_complete = True

        except Exception as e:
            ic("CRITICAL: Unexpected error during cleanup - requires immediate investigation:", e)
            raise

    async def run(self):
        try:
            cot_info = self.config['COTINFO']
            message_type = cot_info[0]
            fieldop_id = cot_info[1]
            aidrequest_csv = cot_info[2]
            aidrequest_list = list(map(int, aidrequest_csv.split(','))) if aidrequest_csv else []
            results = [len(aidrequest_list)]

            field_op = await FieldOp.objects.select_related('tak_server').aget(pk=fieldop_id)
            ic(field_op)

            # get a field op marker in the queue
            try:
                data = make_cot(
                    message_type=message_type,
                    cot_icon='blob_dot_yellow',
                    name=f'{field_op.slug.upper()}',
                    uuid=f'FieldOp.{field_op.slug.upper()}',
                    lat=field_op.latitude,
                    lon=field_op.longitude,
                    remarks=f'Field Op:\n{field_op.name}',
                )
            except Exception as e:
                ic('failed to make_cot for FieldOp', e)
                raise RuntimeError(f"Could not FieldOp make_cot: {e}")
            # next, handle the Field Op COT
            try:
                await self.handle_data(data)
            except Exception as e:
                ic(e)
                return e

            for aid_request_id in aidrequest_list:
                # ic('Building COT for', aid_request_id)
                try:
                    aid_request = await AidRequest.objects.select_related('aid_type', 'field_op').aget(pk=aid_request_id)
                    aid_locations = [
                        location async for location in AidLocation.objects.filter(aid_request=aid_request_id).all()
                    ]
                except Exception as e:
                    ic('failed to get AidRequest or AidLocations')
                    ic(e)
                    raise RuntimeError(f"Failed to get AidRequest or AidLocations: {e}")

                aid_type = aid_request.aid_type

                contact_details = (
                    f'Requestor: {aid_request.requestor_first_name} {aid_request.requestor_last_name}\n'
                    f'Email: {aid_request.requestor_email}\n'
                    f'Phone: {aid_request.requestor_phone}\n'
                )
                if aid_request.aid_contact:
                    contact_details += '--> Aid Contact <--\n'
                    if aid_request.aid_first_name or aid_request.last_name:
                        contact_details += f'Aid Name: {aid_request.aid_first_name} {aid_request.aid_last_name}\n'
                    if aid_request.aid_phone:
                        contact_details += f'Aid Phone: {aid_request.aid_phone}\n'
                    if aid_request.aid_email:
                        contact_details += f'Aid Email: {aid_request.aid_email}\n'
                if aid_request.contact_methods:
                    contact_details += '--> Contact Methods <--\n'
                    contact_details += f'{aid_request.contact_methods}\n'
                location_status, location = aidrequest_location(aid_locations)

                aid_details = (
                    f'Aid Type: {aid_type}\n'
                    f'Priority: {aid_request.priority}\n'
                    f'Status: {aid_request.status}\n'
                    f'Location Status: {location_status}\n'
                    '------\n'
                    f'{contact_details}'
                    '------\n'
                    f'Group Size: {aid_request.group_size}\n'
                    f'Description: {aid_request.aid_description}\n'
                    '------\n'
                    f'Street Address: {aid_request.street_address}\n'
                    f'City: {aid_request.city}\n'
                    f'State: {aid_request.state}\n'
                    f'Zip Code: {aid_request.zip_code}\n'
                    f'Country: {aid_request.country}\n'
                    '------\n')
                if location:
                    aid_details += (
                        f'Best Location ID: {location.pk} ({location.status})\n'
                        f'Address Searched: {location.address_searched}\n'
                        f'Address Found: {location.address_found}\n'
                        f'Distance: {location.distance}\n'
                        f'Location Note:\n{location.note}\n'
                        )

                additional_info = '--- Additional Info ---\n'
                if aid_request.medical_needs:
                    additional_info += f'Medical Needs: {aid_request.medical_needs}\n'
                if aid_request.supplies_needed:
                    additional_info += f'Supplies Needed: {aid_request.supplies_needed}\n'
                if aid_request.welfare_check_info:
                    additional_info += f'Welfare Check Info: {aid_request.welfare_check_info}\n'
                if aid_request.additional_info:
                    additional_info += f'Additional Info: {aid_request.additional_info}\n'

                aid_details += additional_info

                cot_icon = aid_type.cot_icon

                # is this a bit late to be checking for Location?
                if location:
                    # first, make the COT
                    try:
                        data = make_cot(
                            message_type=message_type,
                            cot_icon=cot_icon,
                            name=f'{aid_request.aid_type.slug}.{aid_request.pk}',
                            uuid=f'AidRequest.{aid_request.pk}',
                            lat=location.latitude,
                            lon=location.longitude,
                            remarks=aid_details,
                            parent_name=f'{field_op.slug.upper()}',
                            parent_uuid=f'FieldOp.{field_op.slug.upper()}',
                        )
                    except Exception as e:
                        ic('failed to make data for cot', e)
                        raise RuntimeError(f"Could not make_cot: {e}")

                    # next, handle the COT
                    try:
                        result = await self.handle_data(data)
                    except Exception as e:
                        ic(e)
                        return e

                else:
                    result = f'No Location for Aid Request {aid_request.pk}'
                results.append(result)

            return results
        finally:
            # Final cleanup when run() completes
            await self.cleanup()


async def asend_cot(fieldop_id=None, aidrequest_list=None, message_type=None):
    cot_queues = None
    try:
        cot_config, cot_queues = await setup_cotqueues(
                                    fieldop_id=fieldop_id,
                                    aidrequest_list=aidrequest_list,
                                    message_type=message_type)
        cot_queues.add_tasks(set([CotSender(cot_queues.tx_queue, cot_config)]))
        result = await cot_queues.run()
        return result
    except Exception as e:
        ic(e)
        return f'Exception in cot_queues.run(): {e}'
    finally:
        if cot_queues:
            try:
                # First wait for any pending messages to be sent (with timeout)
                if hasattr(cot_queues, 'tx_queue'):
                    try:
                        async with asyncio.timeout(5):  # 5 second timeout for queue drain
                            while not cot_queues.tx_queue.empty():
                                await asyncio.sleep(0.1)
                    except asyncio.TimeoutError:
                        ic("WARNING: Queue drain timed out - some messages may not have been sent")

                # Cancel all tasks first
                if hasattr(cot_queues, '_tasks'):
                    for task in cot_queues._tasks:
                        if not task.done():
                            task.cancel()
                            try:
                                async with asyncio.timeout(2):  # 2 second timeout for task cancellation
                                    await task
                            except (asyncio.CancelledError, asyncio.TimeoutError):
                                pass

                # Close the workers in sequence
                if hasattr(cot_queues, 'tx_worker') and cot_queues.tx_worker:
                    if hasattr(cot_queues.tx_worker, 'writer') and cot_queues.tx_worker.writer:
                        try:
                            async with asyncio.timeout(3):  # 3 second timeout for writer cleanup
                                # Signal end of data
                                cot_queues.tx_worker.writer.write_eof()
                                await cot_queues.tx_worker.writer.drain()
                                # Close the writer
                                cot_queues.tx_worker.writer.close()
                                await cot_queues.tx_worker.writer.wait_closed()
                        except asyncio.TimeoutError:
                            ic("WARNING: Writer cleanup timed out")
                        except Exception as e:
                            ic("ERROR: Writer cleanup failed:", e)

                if hasattr(cot_queues, 'rx_worker') and cot_queues.rx_worker:
                    if hasattr(cot_queues.rx_worker, 'reader') and cot_queues.rx_worker.reader:
                        try:
                            cot_queues.rx_worker.reader.feed_eof()
                        except Exception as e:
                            ic("ERROR: Reader cleanup failed:", e)

                # Final cot_queues cleanup
                try:
                    async with asyncio.timeout(2):  # 2 second timeout for final cleanup
                        if hasattr(cot_queues, 'close'):
                            await cot_queues.close()
                except asyncio.TimeoutError:
                    ic("WARNING: Final cleanup timed out")
                except Exception as e:
                    ic("ERROR: Final cleanup failed:", e)

            except Exception as cleanup_error:
                ic('Error during cleanup:', cleanup_error)
                if not result:
                    result = f'Cleanup error: {cleanup_error}'


def send_cots(fieldop_id=None, aidrequest_list=[], message_type=None):
    try:
        result = asyncio.run(asend_cot(
                                fieldop_id=fieldop_id,
                                aidrequest_list=aidrequest_list,
                                message_type=message_type
                                )
                             )
    except Exception as e:
        ic('asyncio.run exception:', e)
        return e

    return result


async def setup_cotqueues(fieldop_id=None, aidrequest_list=[], message_type=None):
    cot_queues = None
    try:
        aidrequest_csv = ",".join(map(str, aidrequest_list))
        COTINFO = [message_type,
                   fieldop_id,
                   aidrequest_csv
                   ]

        try:
            fieldop = await FieldOp.objects.aget(pk=fieldop_id)
        except Exception as e:
            ic('fieldop.get exception', e)
            raise RuntimeError(f"Failed to get FieldOp: {e}")

        try:
            tak_server = await TakServer.objects.aget(pk=fieldop.tak_server_id)
        except Exception as e:
            ic('takserver get exception', e)
            raise RuntimeError(f"Failed to get TakServer: {e}")

        COT_URL = f'tls://{tak_server.dns_name}:8089'
        cert_private_path = tak_server.cert_private.path
        cert_trust_path = tak_server.cert_trust.path
        cot_config = {
            "COT_URL": COT_URL,
            "PYTAK_TLS_CLIENT_CERT": cert_private_path,
            "PYTAK_TLS_CLIENT_CAFILE": cert_trust_path,
            "COTINFO":  COTINFO,
            "PYTAK_TLS_DONT_CHECK_HOSTNAME": True
        }

        # Create and setup the queues
        cot_queues = pytak.CLITool(cot_config)
        await cot_queues.setup()

        return cot_config, cot_queues

    except Exception as e:
        # If setup fails, ensure we cleanup any partially initialized resources
        if cot_queues is not None:
            try:
                if hasattr(cot_queues, 'close'):
                    await cot_queues.close()
                elif hasattr(cot_queues, 'cleanup'):
                    await cot_queues.cleanup()
            except Exception as cleanup_error:
                ic('Error during cleanup after setup failure:', cleanup_error)
        raise RuntimeError(f"Failed to setup COT queues: {e}")


def send_fieldop_cot(fieldop_id, message_type='update'):
    """Send a COT message for a field op marker only."""
    try:
        result = asyncio.run(asend_cot(
            fieldop_id=fieldop_id,
            aidrequest_list=[],  # Empty list means only send field op marker
            message_type=message_type
        ))
    except Exception as e:
        ic('asyncio.run exception:', e)
        return e

    return result
