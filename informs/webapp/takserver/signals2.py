import xml.etree.ElementTree as ET
import pytak

from icecream import ic


def tak_activityReport(lat=0.0, lon=0.0, uuid="test101", name="name101",
                       updates=None, poll_interval="3600"):

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

    remarks = ET.SubElement(detail, 'remarks')
    if hasattr(updates, '__iter__'):
        remarks.text = '\n'.join(updates)

    color = ET.SubElement(detail, 'color')
    color.set('argb', "-1")
    usericon = ET.SubElement(detail, 'usericon')
    usericon.set('iconsetpath', 'COT_MAPPING_2525B/a-u/a-u-G')

    return ET.tostring(root)
