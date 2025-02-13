# from django.conf import settings

from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import aidrequest_location, make_cot
from .models import TakServer

import asyncio
import pytak
import ast
from configparser import ConfigParser


# import time
from icecream import ic


class CotSender(pytak.QueueWorker):
    """
    Defines how you process or generate your Cursor on Target Events.
    From there it adds the CoT Events to a queue for TX to a COT_URL.
    """
    async def handle_data(self, data):
        ic('sending COT:', data)
        try:
            await self.put_queue(data)
        except Exception as e:
            ic(e)
            raise RuntimeError(f"Could not put_queue: {e}")

    async def run(self):
        cot_info = ast.literal_eval(self.config['COTINFO'])
        message_type = cot_info[0]
        aid_request_id = cot_info[1]
        try:
            aid_request = await AidRequest.objects.select_related('aid_type', 'field_op').aget(pk=aid_request_id)
            aid_locations = [
                location async for location in AidLocation.objects.filter(aid_request=aid_request_id).all()
            ]
        except Exception as e:
            ic('failed to get AidRequest or AidLocations')
            ic(e)
            raise RuntimeError(f"Failed to get AidRequest or AidLocations: {e}")

        location_status, location = aidrequest_location(aid_locations)
        aid_details = (
            f'Aid Type: {aid_request.aid_type}\n'
            f'Priority: {aid_request.priority}\n'
            f'Status: {aid_request.status}\n'
            f'Location Status: {location_status}\n'
            '------\n'
            f'Group Size: {aid_request.group_size}\n'
            f'Description: {aid_request.aid_description}\n'
            '------\n'
            f'Street Address: {aid_request.street_address}\n'
            f'City: {aid_request.city}\n'
            f'State: {aid_request.state}\n'
            f'Zip Code: {aid_request.zip_code}\n'
            f'Country: {aid_request.country}\n'
            '------\n'
            f'Best Location ID: {location.pk} ({location.status})\n'
            f'Address Searched: {location.address_searched}\n'
            f'Address Found: {location.address_found}\n'
            f'Distance: {location.distance}\n'
            '------\n'
            f'{location.note}\n'
        )

        try:
            data = make_cot(
                message_type=message_type,
                uuid=f'AR{aid_request.pk}',
                name=f'AidRequest.{aid_request.pk}',
                lat=location.latitude,
                lon=location.longitude,
                remarks=aid_details
            )
        except Exception as e:
            ic('failed to make data for cot')
            ic(e)
            raise RuntimeError(f"Could not make_cot: {e}")

        try:
            result = await self.handle_data(data)
            # ic(result)
            return result
        except Exception as e:
            ic(e)
        finally:
            while not self.queue.empty():
                await asyncio.sleep(1)
        try:
            await aid_request.logs.acreate(
                log_entry=f"CoT event sent for AidRequest {aid_request.pk}"
            )
        except Exception as e:
            ic(e)


def send_cot(aid_request=None, **kwargs):
    # only sends first confirmed or first new location associated with Aid Request
    # ic(kwargs)
    message_type = kwargs.get('message_type', 'update')
    try:
        result = asyncio.run(asend_cot(aid_request, message_type=message_type))
        # ic(result)
        return result
    except Exception as e:
        ic(e)


async def asend_cot(aid_request=None, **kwargs):
    cot_config, cot_queues = await setup_cotqueues(aid_request, message_type=kwargs['message_type'])
    cot_queues.add_tasks(set([CotSender(cot_queues.tx_queue, cot_config)]))
    try:
        result = await cot_queues.run()
    except Exception as e:
        ic(e)
    ic(cot_queues.running_tasks)
    return result


async def setup_cotqueues(aid_request=None, **kwargs):
    COTINFO = [kwargs['message_type'], aid_request.pk]
    field_op = await FieldOp.objects.aget(pk=aid_request.field_op_id)
    tak_server = await TakServer.objects.aget(pk=field_op.tak_server_id)
    COT_URL = f'tls://{tak_server.dns_name}:8089'
    cot_config = ConfigParser()
    cert_private_path = tak_server.cert_private.path
    cert_trust_path = tak_server.cert_trust.path
    cot_config["takserver"] = {
        "COT_URL": COT_URL,
        "PYTAK_TLS_CLIENT_CERT": cert_private_path,
        "PYTAK_TLS_CLIENT_CAFILE": cert_trust_path,
        "COTINFO":  COTINFO,
        "PYTAK_TLS_DONT_CHECK_HOSTNAME": True
    }
    cot_config = cot_config["takserver"]
    cot_queues = pytak.CLITool(cot_config)
    await cot_queues.setup()
    return cot_config, cot_queues
