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
from .signals2 import tak_activityReport

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
        finally:
            data = tak_activityReport(
                uuid=f'AidLocation.{aid_location_id}',
                name=f'AidRequest.{aid_location.aid_request.pk}',
                lat=aid_location.latitude,
                lon=aid_location.longitude
            )

        try:
            await self.handle_data(data)
        except Exception as e:
            ic(e)
        finally:
            # ic('notice handled')
            while not self.queue.empty():
                await asyncio.sleep(1)

    async def handle_data(self, event):
        # ic(event)
        try:
            await self.put_queue(event)
        except Exception as e:
            ic(e)
        finally:
            # ic('data in queue')
            pass


@receiver(post_save, sender=AidLocation)
def aid_location_post_save(sender, instance, created, **kwargs):
    if created:
        try:
            ic('created record, send TAK notify')
            asyncio.run(send_cot(instance))
        except Exception as e:
            ic(e)


async def send_cot(instance=None):
    # Get the cot_config and cot_queues
    cot_config, cot_queues = await setup_cotqueues(instance)
    cot_queues.add_tasks(set([CotSender(cot_queues.tx_queue, cot_config)]))
    try:
        # ic('queues setup, run the worker')
        await cot_queues.run()
    except Exception as e:
        ic(e)


async def setup_cotqueues(instance=None):
    COT_URL = f'tls://{settings.TAKSERVER_DNS}:8089'
    NOTICE = ["created", instance.pk]
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


# def generate_cot_event(action, aid_location):
#     cot_event = pytak.Event(
#         type="a-f-G-U-C",
#         how="m-g",
#         lat=aid_location.latitude,
#         lon=aid_location.longitude,
#         ce="0.0",
#         le="0.0",
#         hae="0.0",
#         uid='973aa331-cd08-4eb9-a635-8871629a38f2',
#     )
#     return cot_event

def generate_cot_event():
    cot_event = pytak.COTEvent(
        cot_type="a-f-G-U-C",
        lat="40.781789",
        lon="-73.968698",
        ce="0.0",
        le="0.0",
        hae="0.0",
        uid='generate-cot-event-tester',
    )
    return cot_event


def gen_cot2(action, aid_location):
    cot_event = pytak.SimpleCOTEvent(
        lat=aid_location.latitude,
        lon=aid_location.longitude,
        # uid='973aa331-cd08-4eb9-a635-8871629a38f2',
        uid=f"aid-location-{aid_location.id}",
        stale=3600,
        cot_type="a-f-G-U-C",
    )
    return cot_event


# def gen_cot2():
#     """Generate CoT Event."""
#     root = ET.Element("event")
#     root.set("version", "2.0")
#     root.set("type", "a-f-G-U-C")
#     root.set("uid", "informs-mark2")
#     root.set("how", "m-g")
#     root.set("time", pytak.cot_time())
#     root.set("start", pytak.cot_time())
#     root.set("stale", pytak.cot_time(3600))
#     pt_attr = {
#         "lat": "30.42333",
#         "lon": "-97.93248",
#         "hae": "0",
#         "ce": "10",
#         "le": "10",
#     }

    # ET.SubElement(root, "point", attrib=pt_attr)

    # return ET.tostring(root, encoding='unicode')


def gen_cot(action, aid_location):
    """Generate CoT Event."""
    root = ET.Element("event")
    root.set("version", "2.0")
    root.set("type", "a-f-G-U-C")  # insert your type of marker
    root.set("uid", str(f"aid-location-{aid_location.pk}"))
    root.set("how", "m-g")
    root.set("time", pytak.cot_time())
    root.set("start", pytak.cot_time())
    root.set("stale", pytak.cot_time(86400))

    pt_attr = {
        "lat": str(aid_location.latitude),
        "lon": str(aid_location.longitude),
        "hae": "0",
        "ce": "10",
        "le": "10",
    }
    ET.SubElement(root, "point", attrib=pt_attr)

    return ET.tostring(root)


def gen_cot0():
    """Generate CoT Event."""
    root = ET.Element("event")
    root.set("version", "2.0")
    root.set("type", "a-h-A-M-A")  # insert your type of marker
    root.set("uid", "name_your_marker")
    root.set("how", "m-g")
    root.set("time", pytak.cot_time())
    root.set("start", pytak.cot_time())
    root.set(
        "stale", pytak.cot_time(60)
    )  # time difference in seconds from 'start' when stale initiates

    pt_attr = {
        "lat": "40.781789",  # set your lat (this loc points to Central Park NY)
        "lon": "-73.968698",  # set your long (this loc points to Central Park NY)
        "hae": "0",
        "ce": "10",
        "le": "10",
    }

    ET.SubElement(root, "point", attrib=pt_attr)

    return ET.tostring(root)
