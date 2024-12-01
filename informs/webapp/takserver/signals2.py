import xml.etree.ElementTree as ET
import pytak

from icecream import ic


def tak_activityReport(lat=0.0, lon=0.0, uuid="dummy", name="dummy-name",
                       updates=None, icon_color="-256", poll_interval="1800"):
    ic('creating event tak_activityReport')
    event_uuid = uuid
    root = ET.Element("event")
    root.set("version", "2.0")
    root.set("type", "a-u-G")
    root.set("uid", event_uuid)
    root.set("how", "h-g-i-g-o")
    root.set("time", pytak.cot_time())
    root.set("start", pytak.cot_time())
    root.set("stale", pytak.cot_time(int(poll_interval)))
    point = ET.SubElement(root, 'point')
    point.set('lat', str(lat))
    point.set('lon', str(lon))
    point.set('hae', '250')
    point.set('ce', '9999999.0')
    point.set('le', '9999999.0')
    detail = ET.SubElement(root, 'detail')
    status = ET.SubElement(detail, 'status')
    status.set('readiness', 'true')
    precisionlocation = ET.SubElement(detail, "precisionlocation")
    precisionlocation.set("altsrc", "DTED0")

    if hasattr(updates, '__iter__'):
        remarks = ET.SubElement(detail, 'remarks')
        remarks.text = '\n'.join(updates)
    contact = ET.SubElement(detail, "contact")
    contact.set("callsign", name)
    color = ET.SubElement(detail, 'color')
    color.set('argb', icon_color)
    usericon = ET.SubElement(detail, 'usericon')
    usericon.set('iconsetpath', 'ad78aafb-83a6-4c07-b2b9-a897a8b6a38f/Pointers/track-none.png')

    return ET.tostring(root)
