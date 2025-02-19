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
    async def handle_data(self, data):
        try:
            await self.put_queue(data)
        except Exception as e:
            raise RuntimeError(f"Could not put_queue: {e}")

    async def run(self):
        cot_info = self.config['COTINFO']
        message_type = cot_info[0]

        aidrequest_csv = cot_info[2]
        aidrequest_list = list(map(int, aidrequest_csv.split(',')))
        results = [len(aidrequest_list)]

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
                f'Aid Type: {aid_request.aid_type}\n'
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

            if location:
                try:
                    data = make_cot(
                        message_type=message_type,
                        name=f'{aid_request.aid_type.slug}.{aid_request.pk}',
                        uuid=f'AidRequest.{aid_request.pk}',
                        lat=location.latitude,
                        lon=location.longitude,
                        remarks=aid_details
                    )
                except Exception as e:
                    ic('failed to make data for cot', e)
                    raise RuntimeError(f"Could not make_cot: {e}")

                try:
                    result = await self.handle_data(data)

                except Exception as e:
                    ic(e)
                    return e
                finally:
                    while not self.queue.empty():
                        await asyncio.sleep(1)
            else:
                result = f'No Location for Aid Request {aid_request.pk}'
            results.append(result)
        return results


def send_cots(fieldop_id=None, aidrequest_list=[], message_type='update', **kwargs):

    try:
        result = asyncio.run(
                        asend_cot(
                            fieldop_id=fieldop_id,
                            aidrequest_list=aidrequest_list,
                            message_type=message_type
                            )
                        )
    except Exception as e:
        ic('asyncio.run exception:', e)
        return e

    return result


async def asend_cot(fieldop_id=None, aidrequest_list=None, message_type=None, **kwargs):
    # ic('asend_cot:', fieldop_id, message_type, aidrequest_list)

    cot_config, cot_queues = await setup_cotqueues(
                                    fieldop_id=fieldop_id,
                                    aidrequest_list=aidrequest_list,
                                    message_type=message_type)
    cot_queues.add_tasks(set([CotSender(cot_queues.tx_queue, cot_config)]))
    try:
        result = await cot_queues.run()
    except Exception as e:
        ic(e)
        return f'Exception in cot_queues.run(): {e}'

    return result


async def setup_cotqueues(fieldop_id=None, aidrequest_list=[], message_type=None, **kwargs):
    # ic('setup queues')
    aidrequest_csv = ",".join(map(str, aidrequest_list))
    COTINFO = [message_type,
               fieldop_id,
               aidrequest_csv
               ]
    # ic(COTINFO)

    try:
        fieldop = await FieldOp.objects.aget(pk=fieldop_id)
    except Exception as e:
        ic('fieldop get exception', e)
        return e
    try:
        tak_server = await TakServer.objects.aget(pk=fieldop.tak_server_id)
    except Exception as e:
        ic('takserver get exception', e)
        return e

    COT_URL = f'tls://{tak_server.dns_name}:8089'
    cot_config = ConfigParser()
    cert_private_path = tak_server.cert_private.path
    cert_trust_path = tak_server.cert_trust.path
    cot_config = {
        "COT_URL": COT_URL,
        "PYTAK_TLS_CLIENT_CERT": cert_private_path,
        "PYTAK_TLS_CLIENT_CAFILE": cert_trust_path,
        "COTINFO":  COTINFO,
        "PYTAK_TLS_DONT_CHECK_HOSTNAME": True
    }
    cot_queues = pytak.CLITool(cot_config)
    await cot_queues.setup()
    return cot_config, cot_queues
