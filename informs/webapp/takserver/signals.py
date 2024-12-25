# from django.shortcuts import render
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings

import pytak
import asyncio
import xml.etree.ElementTree as ET
import ast
from configparser import ConfigParser

from aidrequests.models import AidLocation
# from takserver.signals2 import tak_activityReport

from icecream import ic


class CotSender(pytak.QueueWorker):
    """
    Defines how you process or generate your Cursor on Target Events.
    From there it adds the CoT Events to a queue for TX to a COT_URL.
    """
    async def run(self):
        notice = ast.literal_eval(self.config['NOTICE'])
        aid_location_id = notice[1]
        try:
            aid_location = await AidLocation.objects.select_related('aid_request').aget(pk=aid_location_id)
        except Exception as e:
            ic(e)
        aid_request = aid_location.aid_request
        try:
            data = make_cot(
                            uuid=aid_location.uid,
                            name=f'AidRequest.{aid_request.pk}',
                            lat=aid_location.latitude,
                            lon=aid_location.longitude,
                            remarks=f'{aid_request.assistance_type}'
                            )
        except Exception as e:
            ic(e)

        try:
            await self.handle_data(data)
        except Exception as e:
            ic(e)
        finally:
            while not self.queue.empty():
                await asyncio.sleep(1)
        ic('cot sent, create log entry')

        try:
            await aid_request.logs.acreate(
                log_entry=f"CoT event sent for AidRequest {aid_request.pk}; location: {aid_location_id}"
            )
        except Exception as e:
            ic(e)

    async def handle_data(self, event):
        try:
            # ic(event)
            await self.put_queue(event)
        except Exception as e:
            ic(e)



@receiver(post_save, sender=AidLocation)
def aid_location_post_save(sender, instance, created, **kwargs):
    update_fields = kwargs.get('update_fields', False)
    if update_fields:
        if 'status' in update_fields and instance.status == 'confirmed':
            try:
                asyncio.run(send_cot(instance))
            except Exception as e:
                ic(e)


async def send_cot(instance=None):
    cot_config, cot_queues = await setup_cotqueues(instance)
    cot_queues.add_tasks(set([CotSender(cot_queues.tx_queue, cot_config)]))
    try:
        await cot_queues.run()
    except Exception as e:
        ic(e)


async def setup_cotqueues(instance=None):
    COT_URL = f'tls://{settings.TAKSERVER_DNS}:8089'
    NOTICE = ["confirmed", instance.pk]
    cot_config = ConfigParser()

    cot_config["civtakdev"] = {
        "DEBUG": True,
        "COT_URL": COT_URL,
        "PYTAK_TLS_CLIENT_CERT": str(settings.PYTAK_TLS_CLIENT_CERT),
        "PYTAK_TLS_CLIENT_PASSWORD": str(settings.PYTAK_TLS_CLIENT_PASSWORD),
        "PYTAK_TLS_CLIENT_CAFILE": str(settings.PYTAK_TLS_CLIENT_CAFILE),
        "NOTICE":  NOTICE
    }
    cot_config = cot_config["civtakdev"]
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
