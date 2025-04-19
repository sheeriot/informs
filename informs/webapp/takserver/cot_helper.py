from django.conf import settings

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


def make_cot(message_type=None,
             cot_icon=None,
             lat=0.0, lon=0.0,
             uuid=None, name=None,
             remarks=None,
             parent_name=None,
             parent_uuid=None,
             poll_interval="86400"):

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
        remarks = "**** TEST ****"

    # use icon name to lookup 'cot_type' from cot_icons.ini file, or 'a-n-G'.
    cot_type = settings.COT_ICONS.get(cot_icon, 'a-n-G')

    # Start the XML tree
    event = ET.Element("event")
    event.set("version", "2.0")
    event.set("uid", event_uuid)
    event.set("type", cot_type)
    event.set('how', 'h-g-i-g-o')
    # event.set("how", "m-g")
    cot_time = pytak.cot_time()
    event.set("time", cot_time)
    event.set("start", cot_time)
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
    # if message_type == 'test':
    #     contact.set("endpoint", "*:-1:stcp")

    precisionlocation = ET.SubElement(detail, "precisionlocation")
    precisionlocation.set("geopointsrc", "???")
    precisionlocation.set("altsrc", "???")

    status = ET.SubElement(detail, 'status')
    status.set('readiness', 'true')

    if message_type == 'test':
        if parent_name and parent_uuid:
            # add parent suffix for different environments
            if settings.ENV_NAME != 'prod':
                parent_uuid = f"{parent_uuid}.{settings.ENV_NAME}"
                parent_name = f"{parent_name}.{settings.ENV_NAME}"
            link = ET.SubElement(detail, 'link')
            link.set('uid', parent_uuid)
            link.set('production_time', cot_time)
            link.set('type', 'a-f-G-U-C')
            link.set('parent_callsign', parent_name)
            link.set('relation', 'p-p')

    color = ET.SubElement(detail, 'color')
    color.set('argb', "-1")

    remarks_element = ET.SubElement(detail, 'remarks')
    remarks_element.text = remarks

    return ET.tostring(event)
