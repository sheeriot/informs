"""
CoT (Cursor on Target) XML message builder.
Generates CoT events for TAK server from Meshtastic data.
"""
import logging
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import config
from meshtastic_decode import PositionMessage, TextMessage, MeshNode

logger = logging.getLogger(__name__)


def cot_time(delta_seconds: int = 0) -> str:
    """
    Generate CoT-formatted timestamp (UTC).
    
    Uses Python 3.12+ best practice: datetime.now(timezone.utc) instead of deprecated datetime.utcnow().

    Args:
        delta_seconds: Seconds to add to current time (for stale time)

    Returns:
        ISO 8601 formatted timestamp string with Z suffix
    """
    dt = datetime.now(timezone.utc) + timedelta(seconds=delta_seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class CotBuilder:
    """Builds CoT XML messages for TAK server."""

    # CoT type codes
    COT_TYPE_FRIENDLY_GROUND = "a-f-G-U-C"  # Friendly ground unit
    COT_TYPE_NEUTRAL_GROUND = "a-n-G"       # Neutral ground
    COT_TYPE_UNKNOWN_GROUND = "a-u-G"       # Unknown ground

    def __init__(self):
        self.stale_seconds = config.cot_stale_seconds

    def build_position_cot(self, position: PositionMessage) -> bytes:
        """
        Build CoT XML for a position update.

        Args:
            position: Decoded position message from Meshtastic

        Returns:
            CoT XML as bytes
        """
        now = cot_time()
        stale = cot_time(self.stale_seconds)

        # Create event element
        event = ET.Element("event")
        event.set("version", "2.0")
        event.set("uid", position.node.cot_uid)
        event.set("type", self.COT_TYPE_FRIENDLY_GROUND)
        event.set("how", "m-g")  # Machine GPS
        event.set("time", now)
        event.set("start", now)
        event.set("stale", stale)

        # Point element with position
        point = ET.SubElement(event, "point")
        point.set("lat", f"{position.latitude:.7f}")
        point.set("lon", f"{position.longitude:.7f}")
        point.set("hae", str(position.altitude or 0))
        point.set("ce", "9999999")  # Circular error
        point.set("le", "9999999")  # Linear error

        # Detail element
        detail = ET.SubElement(event, "detail")

        # Contact with callsign
        contact = ET.SubElement(detail, "contact")
        contact.set("callsign", position.node.callsign)

        # Status
        status = ET.SubElement(detail, "status")
        status.set("readiness", "true")

        # Precision location
        precision = ET.SubElement(detail, "precisionlocation")
        precision.set("geopointsrc", "GPS")
        precision.set("altsrc", "GPS")

        # Track info if available
        if position.ground_speed is not None or position.ground_track is not None:
            track = ET.SubElement(detail, "track")
            if position.ground_speed is not None:
                track.set("speed", str(position.ground_speed))
            if position.ground_track is not None:
                track.set("course", str(position.ground_track))

        # Remarks with source info - tag as MeshMQTT for verification and loop prevention
        remarks = ET.SubElement(detail, "remarks")
        remarks.set("source", "MeshMQTT")
        remarks.text = f"Meshtastic node: {position.node.node_id}"

        # Custom tag for fast identification of MeshMQTT-originated messages
        mesh_mqtt_tag = ET.SubElement(detail, "MeshMQTT")
        mesh_mqtt_tag.text = "true"

        # Archive for persistence
        ET.SubElement(detail, "archive")

        # Color (white)
        color = ET.SubElement(detail, "color")
        color.set("argb", "-1")

        # User icon - use a radio/comms icon
        usericon = ET.SubElement(detail, "usericon")
        usericon.set("iconsetpath", "COT_MAPPING_2525C/a-f/a-f-G-U-C")

        xml_bytes = ET.tostring(event, encoding='unicode').encode('utf-8')

        if config.debug:
            logger.debug(f"Built position CoT for {position.node.callsign}")

        return xml_bytes

    def build_chat_cot(self, message: TextMessage, chat_room: str = "All Chat Rooms") -> bytes:
        """
        Build CoT XML for a chat message.

        Args:
            message: Decoded text message from Meshtastic
            chat_room: TAK chat room to send to

        Returns:
            CoT XML as bytes
        """
        now = cot_time()
        stale = cot_time(120)  # Chat messages stale after 2 minutes

        # Generate unique message ID
        msg_id = str(uuid.uuid4())

        # Create event element
        event = ET.Element("event")
        event.set("version", "2.0")
        event.set("uid", f"GeoChat.{message.node.cot_uid}.{chat_room}.{msg_id}")
        event.set("type", "b-t-f")  # Broadcast - Text - Freeform
        event.set("how", "h-g-i-g-o")  # Human generated
        event.set("time", now)
        event.set("start", now)
        event.set("stale", stale)

        # Point element (use 0,0 for chat without position)
        point = ET.SubElement(event, "point")
        point.set("lat", "0.0")
        point.set("lon", "0.0")
        point.set("hae", "0")
        point.set("ce", "9999999")
        point.set("le", "9999999")

        # Detail element
        detail = ET.SubElement(event, "detail")

        # Chat element
        chat = ET.SubElement(detail, "__chat")
        chat.set("parent", "RootContactGroup")
        chat.set("groupOwner", "false")
        chat.set("chatroom", chat_room)
        chat.set("id", chat_room)
        chat.set("senderCallsign", message.node.callsign)

        # Chat group
        chatgrp = ET.SubElement(chat, "chatgrp")
        chatgrp.set("uid0", message.node.cot_uid)
        chatgrp.set("uid1", chat_room)
        chatgrp.set("id", chat_room)

        # Link to sender
        link = ET.SubElement(detail, "link")
        link.set("uid", message.node.cot_uid)
        link.set("type", self.COT_TYPE_FRIENDLY_GROUND)
        link.set("relation", "p-p")

        # Remarks with the actual message - tag as MeshMQTT for verification and loop prevention
        remarks = ET.SubElement(detail, "remarks")
        remarks.set("source", "MeshMQTT")
        remarks.set("sourceID", message.node.cot_uid)
        remarks.set("to", chat_room)
        remarks.set("time", now)
        remarks.text = message.text

        # Custom tag for fast identification of MeshMQTT-originated messages
        mesh_mqtt_tag = ET.SubElement(detail, "MeshMQTT")
        mesh_mqtt_tag.text = "true"

        # Server destination
        serverdest = ET.SubElement(detail, "__serverdestination")
        serverdest.set("destinations", chat_room)

        xml_bytes = ET.tostring(event, encoding='unicode').encode('utf-8')

        if config.debug:
            logger.debug(f"Built chat CoT from {message.node.callsign}: {message.text[:30]}...")

        return xml_bytes

    def build_ping_cot(self) -> bytes:
        """
        Build a ping/presence CoT for the gateway itself.

        Returns:
            CoT XML as bytes
        """
        now = cot_time()
        stale = cot_time(self.stale_seconds)

        event = ET.Element("event")
        event.set("version", "2.0")
        event.set("uid", config.gateway_uid)
        event.set("type", "a-f-G-U-C-I")  # Friendly ground unit - infrastructure
        event.set("how", "m-g")
        event.set("time", now)
        event.set("start", now)
        event.set("stale", stale)

        point = ET.SubElement(event, "point")
        point.set("lat", "0.0")
        point.set("lon", "0.0")
        point.set("hae", "0")
        point.set("ce", "9999999")
        point.set("le", "9999999")

        detail = ET.SubElement(event, "detail")

        contact = ET.SubElement(detail, "contact")
        contact.set("callsign", config.gateway_callsign)

        status = ET.SubElement(detail, "status")
        status.set("readiness", "true")

        # Custom tag for fast identification of MeshMQTT-originated messages
        mesh_mqtt_tag = ET.SubElement(detail, "MeshMQTT")
        mesh_mqtt_tag.text = "true"

        remarks = ET.SubElement(detail, "remarks")
        remarks.set("source", "MeshMQTT")
        remarks.text = f"Takmesh Gateway - Meshtastic to TAK Bridge (UID: {config.gateway_uid})"

        ET.SubElement(detail, "archive")

        return ET.tostring(event, encoding='unicode').encode('utf-8')


def parse_cot_event(xml_bytes: bytes) -> Optional[dict]:
    """
    Parse a CoT XML event into a dictionary.
    Used for processing incoming TAK messages.

    Args:
        xml_bytes: Raw CoT XML bytes

    Returns:
        Dictionary with event data or None if parsing fails
    """
    try:
        root = ET.fromstring(xml_bytes)

        if root.tag != "event":
            return None

        event = {
            "uid": root.get("uid"),
            "type": root.get("type"),
            "how": root.get("how"),
            "time": root.get("time"),
            "stale": root.get("stale"),
        }

        # Extract point
        point = root.find("point")
        if point is not None:
            event["lat"] = float(point.get("lat", 0))
            event["lon"] = float(point.get("lon", 0))
            event["hae"] = float(point.get("hae", 0))

        # Extract detail elements
        detail = root.find("detail")
        if detail is not None:
            # Contact/callsign - extract all contact attributes
            contact = detail.find("contact")
            if contact is not None:
                event["callsign"] = contact.get("callsign")
                if contact.get("phone"):
                    event["contact_phone"] = contact.get("phone")
                if contact.get("endpoint"):
                    event["contact_endpoint"] = contact.get("endpoint")

            # Custom MeshMQTT tag - fast check for gateway-originated messages
            mesh_mqtt = detail.find("MeshMQTT")
            if mesh_mqtt is not None and mesh_mqtt.text and mesh_mqtt.text.lower() == "true":
                event["mesh_mqtt"] = True

            # Remarks - extract text and attributes
            remarks = detail.find("remarks")
            if remarks is not None:
                if remarks.text:
                    event["remarks"] = remarks.text
                # Extract remarks attributes
                for attr in ["source", "sourceID", "to", "time"]:
                    if remarks.get(attr):
                        event[f"remarks_{attr}"] = remarks.get(attr)

            # Chat message
            chat = detail.find("__chat")
            if chat is not None:
                event["is_chat"] = True
                event["chat_room"] = chat.get("chatroom")
                event["sender_callsign"] = chat.get("senderCallsign")

            # Status - extract all status attributes
            status = detail.find("status")
            if status is not None:
                status_data = {}
                for attr in ["readiness", "battery"]:
                    if status.get(attr):
                        status_data[attr] = status.get(attr)
                if status_data:
                    event["status"] = status_data

            # Track - extract speed and course
            track = detail.find("track")
            if track is not None:
                track_data = {}
                if track.get("speed"):
                    track_data["speed"] = float(track.get("speed"))
                if track.get("course"):
                    track_data["course"] = float(track.get("course"))
                if track_data:
                    event["track"] = track_data

            # Link - extract link information
            link = detail.find("link")
            if link is not None:
                link_data = {}
                for attr in ["uid", "type", "relation", "parent_callsign", "production_time"]:
                    if link.get(attr):
                        link_data[attr] = link.get(attr)
                if link_data:
                    event["link"] = link_data

            # TAK version info
            takv = detail.find("takv")
            if takv is not None:
                takv_data = {}
                for attr in ["device", "platform", "os", "version"]:
                    if takv.get(attr):
                        takv_data[attr] = takv.get(attr)
                if takv_data:
                    event["takv"] = takv_data

            # Precision location
            precision = detail.find("precisionlocation")
            if precision is not None:
                precision_data = {}
                for attr in ["geopointsrc", "altsrc"]:
                    if precision.get(attr):
                        precision_data[attr] = precision.get(attr)
                if precision_data:
                    event["precisionlocation"] = precision_data

            # Point attributes (ce, le - circular/linear error)
            if point is not None:
                if point.get("ce") and point.get("ce") != "9999999":
                    event["ce"] = float(point.get("ce"))
                if point.get("le") and point.get("le") != "9999999":
                    event["le"] = float(point.get("le"))

        return event

    except ET.ParseError as e:
        logger.warning(f"Failed to parse CoT XML: {e}")
        return None
    except Exception as e:
        logger.error(f"Error parsing CoT event: {e}")
        return None
