from django.conf import settings

import pytak
import asyncio
import time
import xml.etree.ElementTree as ET
import ast
from configparser import ConfigParser

from aidrequests.models import AidRequest, AidLocation
from .cot_helper import aidrequest_location

# from takserver.signals2 import tak_activityReport

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
            ic(e)

    async def run(self):
        notice = ast.literal_eval(self.config['NOTICE'])
        aid_request_id = notice[1]
        try:
            aid_request = await AidRequest.objects.select_related('aid_type', 'field_op').aget(pk=aid_request_id)
            aid_locations = [location async for location in AidLocation.objects.filter(aid_request=aid_request_id).all()]
        except Exception as e:
            ic('failed to get AidRequest or AidLocations')
            ic(e)

        location_status, location = aidrequest_location(aid_locations)
        try:
            data = make_cot(
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
            await self.handle_data(data)
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


def send_cot(aid_request=None):
    # only sends first confirmed or first new location associated with Aid Request
    try:
        asyncio.run(asend_cot(aid_request))
    except Exception as e:
        ic(e)

async def asend_cot(aid_request=None):
    cot_config, cot_queues = await setup_cotqueues(aid_request)
    cot_queues.add_tasks(set([CotSender(cot_queues.tx_queue, cot_config)]))
    try:
        await cot_queues.run()
    except Exception as e:
        ic(e)

async def setup_cotqueues(aid_request=None):
    COT_URL = f'tls://{settings.TAKSERVER_DNS}:8089'
    NOTICE = ["confirmed", aid_request.pk]
    cot_config = ConfigParser()

    # ic(str(settings.PYTAK_TLS_CLIENT_CERT))
    cot_config["takserver"] = {
        "COT_URL": COT_URL,
        "PYTAK_TLS_CLIENT_CERT": str(settings.PYTAK_TLS_CLIENT_CERT),
        "PYTAK_TLS_CLIENT_PASSWORD": str(settings.PYTAK_TLS_CLIENT_PASSWORD),
        "PYTAK_TLS_CLIENT_CAFILE": str(settings.PYTAK_TLS_CLIENT_CAFILE),
        "NOTICE":  NOTICE,
        "PYTAK_TLS_DONT_CHECK_HOSTNAME": True
    }
    cot_config = cot_config["takserver"]
    cot_queues = pytak.CLITool(cot_config)
    await cot_queues.setup()
    return cot_config, cot_queues


def make_cot(lat=0.0, lon=0.0, uuid="test101", name="name101",
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
    result = ET.tostring(root)
    return result
