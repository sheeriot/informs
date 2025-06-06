from django.conf import settings
import platform # Added import

import xml.etree.ElementTree as ET
import pytak

# from icecream import ic


def aidrequest_location(locations=None):
    status = aidrequest_locationstatus(locations)
    if status == 'confirmed':
        location = next((location for location in locations if location.status == 'confirmed'), None)
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


def make_cot(cot_icon=None,
             lat=0.0, lon=0.0,
             uuid=None, # Unique ID for data markers (e.g., AidRequest.1), fully suffixed
             name=None,  # Base callsign for data markers (e.g., AR1), fully suffixed
             remarks=None,
             mark_type='field', # Used for stale time logic
             poll_interval="86400", # Default stale time in seconds if mark_type='field'
             client_static_uid: str = None, # FULL, SUFFIXED UID of the client (e.g., informs-dev.dev)
             link_to_client_uid: str = None, # FULL, SUFFIXED UID of the parent marker for linked markers
             link_type: str = None, # CoT type of the parent marker (e.g., a-n-G)
             link_parent_callsign: str = None # Callsign of the parent marker
             ):
    """Create a generic COT XML message.

    Args:
        cot_icon (str): Icon name from settings.COT_ICONS.
        lat (float): Latitude.
        lon (float): Longitude.
        uuid (str): The unique, fully suffixed ID for the event (e.g., "aidrequest.1.dev"). Required.
        name (str): The fully suffixed callsign/name for the marker (e.g., "AR1.dev"). Used for <contact callsign>. Required.
        remarks (str): Remarks text.
        mark_type (str): Governs stale time. 'field' uses poll_interval, others use a default.
        poll_interval (str): Stale time in seconds if mark_type='field'.
        client_static_uid (str): The FULL static, unique, SUFFIXED identifier for the EUD/client
                                 sending the CoT (e.g., "informs-dev.dev"). Required.
        link_to_client_uid (str): For linked markers, the FULL, SUFFIXED UID of the parent marker.
        link_type (str): For linked markers, the CoT 'type' of the parent marker.
        link_parent_callsign (str): For linked markers, the callsign of the parent marker.
    """
    if not client_static_uid:
        raise ValueError("client_static_uid (full, suffixed) is always required.")

    if not uuid:
        raise ValueError("uuid (event UID, fully suffixed) is required.")
    if not name:
        raise ValueError("name (fully suffixed callsign/identifier for contact) is required.")

    event_actual_uid = uuid

    cot_type_from_icon = settings.COT_ICONS.get(cot_icon, 'a-n-G') # Default to Neutral Generic

    event = ET.Element("event")
    event.set("version", "2.0")
    event.set("uid", event_actual_uid)
    event.set("type", cot_type_from_icon)
    event.set('how', 'h-e') # h-e for human created, estimated.
    cot_time = pytak.cot_time()
    event.set("time", cot_time)
    event.set("start", cot_time)

    # Stale time logic
    if mark_type == 'field':
        stale_time_seconds = int(poll_interval)
    else:
        stale_time_seconds = 21600  # 6 hours
    event.set("stale", pytak.cot_time(stale_time_seconds))

    point = ET.SubElement(event, 'point')
    point.set('lat', str(lat))
    point.set('lon', str(lon))
    point.set('hae', '0')
    point.set('ce', '9999999')
    point.set('le', '9999999')

    detail = ET.SubElement(event, 'detail')

    # For persistence on iTAK
    ET.SubElement(detail, 'archive')

    status_element = ET.SubElement(detail, 'status')
    status_element.set('readiness', 'true')

    color_element = ET.SubElement(detail, 'color')
    color_element.set('argb', '-1') # -1 is white

    if link_to_client_uid and link_type:
        link = ET.SubElement(detail, 'link')
        link.set('uid', link_to_client_uid)
        link.set('relation', 'p-p') # Parent-child relationship
        link.set('type', link_type)
        if link_parent_callsign:
            link.set('parent_callsign', link_parent_callsign)

    precisionlocation = ET.SubElement(detail, "precisionlocation")
    precisionlocation.set("geopointsrc", "???")
    precisionlocation.set("altsrc", "???")

    remarks_element = ET.SubElement(detail, 'remarks')
    remarks_element.text = remarks if remarks else ""

    # Add contact element with callsign from the name parameter
    if name:
        contact_element = ET.SubElement(detail, 'contact')
        contact_element.set('callsign', name)

    return ET.tostring(event)
