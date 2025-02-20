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


def make_cot(cot_type=None, message_type=None,
             lat=0.0, lon=0.0,
             uuid=None, name=None,
             remarks=None,
             poll_interval="3600"):

    red_diamond = 'a-h-G'
    green_square_x = 'a-n-G-U-C-I'
    # yellow_blob = 'a-n-G'
    # cot_type = 'a-n-X-i-s'
    # cot_type = 'a-n-G-U-C'
    # cot_icon = 'a-n-G-U-C-I'
    # cot_icon = 'a-n-G'
    # green_square = 'a-f-G'

    icon_food = 'ad78aafb-83a6-4c07-b2b9-a897a8b6a38f/ShapesClr/convenience.png'

    if settings.ENV_NAME == 'prod':
        event_uuid = uuid
    else:
        event_uuid = f"{uuid}.{settings.ENV_NAME}"
        name = f"{name}.{settings.ENV_NAME}"

    if message_type == 'remove':
        remarks = f"**** CLEARED ****\n{remarks}"
        cot_type = green_square_x
    elif message_type == 'test':
        cot_type = 'a-u-G'
        cot_icon = icon_food
    else:
        cot_type = red_diamond

    # build the xml root element as event
    event = ET.Element("event")
    event.set("version", "2.0")
    event.set("uid", event_uuid)
    event.set("type", cot_type)
    if message_type == 'test':
        event.set('how', 'h-g-i-g-o')
    else:
        event.set("how", "m-g")

    event.set("time", pytak.cot_time())
    event.set("start", pytak.cot_time())
    event.set("stale", pytak.cot_time(int(poll_interval)))
    if message_type != 'test':
        event.set("access", "Undefined")

    # This is a Point event, add it first
    point = ET.SubElement(event, 'point')
    point.set('lat', str(lat))
    point.set('lon', str(lon))
    point.set('hae', '250')
    if message_type == 'test':
        point.set('ce', '0.0')
        point.set('le', '0.0')
    else:
        point.set('ce', '9999999.0')
        point.set('le', '9999999.0')

    #  Now add detail
    detail = ET.SubElement(event, 'detail')

    contact = ET.SubElement(detail, "contact")
    contact.set("callsign", name)
    precisionlocation = ET.SubElement(detail, "precisionlocation")
    if message_type == 'test':
        precisionlocation.set("geopointsrc", "???")
        precisionlocation.set("altsrc", "???")
    else:
        precisionlocation.set("altsrc", "DTED0")

    status = ET.SubElement(detail, 'status')
    status.set('readiness', 'true')

    usericon = ET.SubElement(detail, 'usericon')
    if message_type == 'test':
        usericon.set('iconsetpath', cot_icon)
    else:
        usericon.set('iconsetpath', 'COT_MAPPING_2525C/a-n/a-n-G')
    color = ET.SubElement(detail, 'color')
    color.set('argb', "-1")
    remarks_element = ET.SubElement(detail, 'remarks')
    remarks_element.text = remarks

    result = ET.tostring(event)
    return result
