from django.conf import settings

import xml.etree.ElementTree as ET
import pytak

from icecream import ic


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


def make_cot(message_type=None,
             cot_icon=None,
             lat=0.0, lon=0.0,
             uuid=None, name=None,
             remarks=None,
             poll_interval="3600"):

    if settings.ENV_NAME == 'prod':
        event_uuid = uuid
    else:
        event_uuid = f"{uuid}.{settings.ENV_NAME}"
        name = f"{name}.{settings.ENV_NAME}"

    # red_diamond = 'a-h-G'
    # green_square_x = 'a-n-G-U-C-I'

    if message_type == 'remove':
        cot_icon = 'square_green_x'
        remarks = f"**** CLEARED ****\n{remarks}"
    elif message_type == 'test':
        remarks = f"**** TEST ****\n{remarks}"

    cot_type = settings.COT_ICONS.get(cot_icon, 'a-n-G')

    # Start the XML tree
    event = ET.Element("event")
    event.set("version", "2.0")
    event.set("uid", event_uuid)
    event.set("type", cot_type)
    event.set('how', 'h-g-i-g-o')
    # event.set("how", "m-g")

    event.set("time", pytak.cot_time())
    event.set("start", pytak.cot_time())
    event.set("stale", pytak.cot_time(int(poll_interval)))
    # event.set("access", "Undefined")

    # This is a Point event, the sub-element
    point = ET.SubElement(event, 'point')
    point.set('lat', str(lat))
    point.set('lon', str(lon))
    point.set('hae', '0')
    point.set('ce', '0.0')
    point.set('le', '0.0')

    #  Add a Detail sub-element
    detail = ET.SubElement(event, 'detail')

    # add Contact to Detail
    contact = ET.SubElement(detail, "contact")
    contact.set("callsign", name)

    # more detail
    precisionlocation = ET.SubElement(detail, "precisionlocation")
    precisionlocation.set("geopointsrc", "???")
    precisionlocation.set("altsrc", "???")

    # more detail
    status = ET.SubElement(detail, 'status')
    status.set('readiness', 'true')

    # play with icons after determining if we can do the needful only with cot_type
    # usericon = ET.SubElement(detail, 'usericon')
    # if message_type == 'test':
    #     ic(cot_iconpath)
    #     usericon.set('iconsetpath', cot_iconpath)
    # else:
    #     usericon.set('iconsetpath', 'COT_MAPPING_2525C/a-n/a-n-G')

    color = ET.SubElement(detail, 'color')
    color.set('argb', "-1")

    remarks_element = ET.SubElement(detail, 'remarks')
    remarks_element.text = remarks

    return ET.tostring(event)
