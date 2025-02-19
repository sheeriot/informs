# import asyncio
from django.conf import settings

# from aidrequests.models import AidRequest, AidLocation

import xml.etree.ElementTree as ET
import pytak
# from icecream import ic


def aidrequest_location(locations=None):
    status = aidrequest_locationstatus(locations)
    if status == 'confirmed':
        location = next((location for location in locations if location.status == 'confirmed'), None)
        # location = locations.filter(status='confirmed').first()
    elif status == 'new':
        location = next((location for location in locations if location.status == 'new'), None)
    else:
        location = None
    return status, location


def aidrequest_locationstatus(locations=None):
    for status in ['confirmed', 'new']:
        if any(location.status == status for location in locations):
            return status
    return None


def make_cot(cot_type=None, message_type='update',
             lat=0.0, lon=0.0,
             uuid=None, name=None,
             remarks=None,
             poll_interval="3600"):

    red_diamond = 'a-h-G'
    # green_square = 'a-f-G'
    green_square_x = 'a-n-G-U-C-I'
    # yellow_blob = 'a-n-G'
    # cot_type = 'a-n-X-i-s'

    if settings.ENV_NAME == 'prod':
        event_uuid = uuid
    else:
        event_uuid = f"{uuid}.{settings.ENV_NAME}"
        name = f"{name}.{settings.ENV_NAME}"

    if message_type == "remove":
        remarks = f"**** REMOVED ****\n{remarks}"
        cot_type = green_square_x
        # cot_type = 'a-n-G-U-C'
        # cot_icon = 'a-n-G-U-C-I'
    else:
        cot_type = red_diamond
        # cot_icon = 'a-n-G'

    # build the xml root element as event
    event = ET.Element("event")
    event.set("version", "2.0")
    event.set("type", cot_type)
    event.set("uid", event_uuid)
    event.set("time", pytak.cot_time())
    event.set("start", pytak.cot_time())
    event.set("stale", pytak.cot_time(int(poll_interval)))
    event.set("access", "Undefined")
    event.set("how", "m-g")

    # build detail
    detail = ET.SubElement(event, 'detail')
    contact = ET.SubElement(detail, "contact")
    contact.set("callsign", name)
    status = ET.SubElement(detail, 'status')
    status.set('readiness', 'true')
    precisionlocation = ET.SubElement(detail, "precisionlocation")
    precisionlocation.set("altsrc", "DTED0")

    # what is with color

    # cot_icon = 'a-n-G'

    usericon = ET.SubElement(detail, 'usericon')
    usericon.set('iconsetpath', 'COT_MAPPING_2525C/a-n/a-n-G')
    color = ET.SubElement(detail, 'color')
    color.set('argb', "-1")
    remarks_element = ET.SubElement(detail, 'remarks')
    remarks_element.text = remarks

    # add the Point to event
    point = ET.SubElement(event, 'point')
    point.set('lat', str(lat))
    point.set('lon', str(lon))
    point.set('hae', '250')
    point.set('ce', '9999999.0')
    point.set('le', '9999999.0')

    result = ET.tostring(event)
    return result
