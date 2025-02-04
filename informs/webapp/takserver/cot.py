# from django.conf import settings

from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import aidrequest_location
from .models import TakServer

import asyncio
import pytak
from configparser import ConfigParser
import xml.etree.ElementTree as ET
import ast

# import time
from icecream import ic


class CotSender(pytak.QueueWorker):
    """
    Defines how you process or generate your Cursor on Target Events.
    From there it adds the CoT Events to a queue for TX to a COT_URL.
    """
    async def handle_data(self, data):
        try:
            result = await self.put_queue(data)
            ic(result)
            return result
        except Exception as e:
            ic(e)
            return None

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

        location_status, location = aidrequest_location(aid_locations)
        try:
            data = make_cot(
                message_type=message_type,
                uuid=f'AR{aid_request.pk}',
                name=f'AidRequest.{aid_request.pk}',
                lat=location.latitude,
                lon=location.longitude,
                remarks=f'{aid_request.aid_type}. Location Status: {location_status}'
            )
        except Exception as e:
            ic('failed to make data for cot')
            ic(e)
        # ic(data)
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
        return result
    except Exception as e:
        ic(e)


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


def make_cot(message_type="update", lat=0.0, lon=0.0, uuid="test101", name="name101",
             updates=None, poll_interval="3600", remarks=None):
    # ic(remarks)
    event_uuid = uuid
    root = ET.Element("event")

    root.set("version", "2.0")
    root.set("type", "a-u-G")
    root.set("uid", event_uuid)
    root.set("how", "h-g-i-g-o")
    root.set("time", pytak.cot_time())
    root.set("start", pytak.cot_time())
    root.set("stale", pytak.cot_time(int(poll_interval)))
    root.set("access", "Undefined")

    point = ET.SubElement(root, 'point')
    point.set('lat', str(lat))
    point.set('lon', str(lon))
    point.set('hae', '250')
    point.set('ce', '9999999.0')
    point.set('le', '9999999.0')

    detail = ET.SubElement(root, 'detail')

    contact = ET.SubElement(detail, "contact")
    contact.set("callsign", name)

    status = ET.SubElement(detail, 'status')
    status.set('readiness', 'true')

    ET.SubElement(detail, 'archive')

    precisionlocation = ET.SubElement(detail, "precisionlocation")
    precisionlocation.set("altsrc", "DTED0")
    # remarks = ET.SubElement(detail, 'remarks')
    if remarks:
        remarks_element = ET.SubElement(detail, 'remarks')
        remarks_element.text = remarks
    # if hasattr(updates, '__iter__'):
    #     remarks.text = '\n'.join(updates)
    color = ET.SubElement(detail, 'color')
    color.set('argb', "-1")
    usericon = ET.SubElement(detail, 'usericon')
    usericon.set('iconsetpath', 'COT_MAPPING_2525B/a-u/a-u-G')
    # is this a remove message ?
    if message_type == "remove":
        usericon = ET.SubElement(detail, '_forcedelete')
    result = ET.tostring(root)
    return result
