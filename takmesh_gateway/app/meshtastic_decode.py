"""
Meshtastic JSON message decoder.
Parses position, text, and telemetry messages from Meshtastic MQTT JSON format.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, UTC
from typing import Optional

from config import config
from node_store import node_store

logger = logging.getLogger(__name__)


@dataclass
class MeshNode:
    """Represents a Meshtastic node."""
    node_id: str           # Hex node ID (e.g., "!abcd1234")
    short_name: str        # Short name (e.g., "ABC")
    long_name: str         # Long name (e.g., "Alpha Base Camp")

    @property
    def cot_uid(self) -> str:
        """Generate CoT UID for this node."""
        # Remove ! prefix if present for cleaner UID
        clean_id = self.node_id.lstrip('!')
        return f"meshtastic-{clean_id}"

    @property
    def callsign(self) -> str:
        """Generate callsign for CoT contact."""
        if self.long_name:
            return self.long_name
        if self.short_name:
            return self.short_name
        return self.node_id


@dataclass
class PositionMessage:
    """Decoded position message from Meshtastic."""
    node: MeshNode
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    ground_speed: Optional[float] = None
    ground_track: Optional[float] = None
    precision_bits: Optional[int] = None
    timestamp: Optional[datetime] = None
    battery_level: Optional[int] = None

    @property
    def has_valid_position(self) -> bool:
        """Check if position is valid (non-zero lat/lon)."""
        return self.latitude != 0.0 and self.longitude != 0.0


@dataclass
class TextMessage:
    """Decoded text message from Meshtastic."""
    node: MeshNode
    text: str
    to_node: Optional[str] = None  # None = broadcast
    channel: int = 0
    timestamp: Optional[datetime] = None


class MeshtasticDecoder:
    """Decodes Meshtastic JSON messages from MQTT."""

    def __init__(self):
        # In-memory cache backed by persistent node_store
        self._node_cache: dict[str, MeshNode] = {}
        # Load existing nodes from persistent store
        self._load_from_store()

    def decode_message(self, topic: str, payload: dict) -> Optional[PositionMessage | TextMessage]:
        """
        Decode a Meshtastic MQTT JSON message.

        Args:
            topic: MQTT topic the message was received on
            payload: Decoded JSON payload

        Returns:
            PositionMessage, TextMessage, or None if not decodable
        """
        try:
            # Extract message type from topic or payload
            msg_type = payload.get("type", "")

            # Get sender info
            sender_id = self._extract_node_id(payload)
            if not sender_id:
                if config.debug:
                    logger.debug(f"No sender ID in message: {payload}")
                return None

            # Get or create node
            node = self._get_or_create_node(sender_id, payload)

            # Decode based on type
            if msg_type == "position" or "position" in payload.get("payload", {}):
                return self._decode_position(node, payload)
            elif msg_type == "text" or "text" in payload.get("payload", {}):
                return self._decode_text(node, payload)
            elif msg_type == "nodeinfo":
                # Update node cache with new info
                self._update_node_info(sender_id, payload)
                return None
            elif msg_type == "telemetry":
                # Could extract battery info for position updates
                self._update_telemetry(sender_id, payload)
                return None
            else:
                if config.debug:
                    logger.debug(f"Unhandled message type: {msg_type}")
                return None

        except Exception as e:
            logger.error(f"Error decoding message: {e}")
            if config.debug:
                logger.exception("Decode error details")
            return None

    def _extract_node_id(self, payload: dict) -> Optional[str]:
        """Extract node ID from payload.

        The 'from' field contains the Meshtastic device ID as a decimal number.
        This must be converted to hexadecimal format (e.g., 3908012265 -> !E80DB3E9).
        The 'from' field should always be present in Meshtastic messages.
        """
        from_id = payload.get("from")
        if from_id is None:
            # 'from' should always be present, but handle gracefully
            if config.debug:
                logger.warning(f"Missing 'from' field in payload: {payload}")
            return None

        # Convert to int (handles both int and string representation of int), then to hex
        try:
            node_id = f"!{int(from_id):08X}"
            return node_id
        except (ValueError, TypeError) as e:
            logger.error(f"Failed to convert 'from' field to hex: {from_id} (type: {type(from_id)}), error: {e}")
            return None

    def _load_from_store(self):
        """Load nodes from persistent store into memory cache."""
        for stored_node in node_store.get_all_nodes():
            node_id = stored_node['node_id']
            self._node_cache[node_id] = MeshNode(
                node_id=node_id,
                short_name=stored_node.get('short_name', node_id[-4:].upper()),
                long_name=stored_node.get('long_name', '')
            )
        if self._node_cache:
            logger.info(f"Loaded {len(self._node_cache)} nodes from persistent store")

    def _get_or_create_node(self, node_id: str, payload: dict) -> MeshNode:
        """Get node from cache or create new one."""
        if node_id in self._node_cache:
            # Touch the node in persistent store to update last_seen
            node_store.update_node(node_id)
            return self._node_cache[node_id]

        # Extract names from payload if available
        sender_info = payload.get("sender_info", {})
        short_name = sender_info.get("short_name", node_id[-4:].upper())
        long_name = sender_info.get("long_name", "")

        # Create in-memory node
        node = MeshNode(
            node_id=node_id,
            short_name=short_name,
            long_name=long_name
        )
        self._node_cache[node_id] = node

        # Persist to store
        node_store.update_node(
            node_id=node_id,
            short_name=short_name,
            long_name=long_name
        )

        return node

    def _update_node_info(self, node_id: str, payload: dict):
        """Update node cache with nodeinfo message."""
        info = payload.get("payload", {})

        short_name = info.get("short_name")
        long_name = info.get("long_name")
        hw_model = info.get("hw_model")
        role = info.get("role")

        # Update in-memory cache
        node = self._node_cache.get(node_id)
        if node:
            if short_name:
                node.short_name = short_name
            if long_name:
                node.long_name = long_name
        else:
            self._node_cache[node_id] = MeshNode(
                node_id=node_id,
                short_name=short_name or node_id[-4:].upper(),
                long_name=long_name or ""
            )

        # Persist to store
        node_store.update_node(
            node_id=node_id,
            short_name=short_name,
            long_name=long_name,
            hw_model=hw_model,
            role=role
        )

        logger.info(f"Updated node info for {node_id}: {self._node_cache[node_id]}")

    def _update_telemetry(self, node_id: str, payload: dict):
        """Update node with telemetry data (battery, etc)."""
        telemetry = payload.get("payload", {})
        device_metrics = telemetry.get("device_metrics", {})

        battery = device_metrics.get("battery_level")
        if battery is not None:
            # Persist battery level to store
            node_store.update_node(node_id=node_id, battery_level=battery)

    def _decode_position(self, node: MeshNode, payload: dict) -> Optional[PositionMessage]:
        """Decode a position message."""
        pos_data = payload.get("payload", {})

        # Handle nested position object
        if "position" in pos_data:
            pos_data = pos_data["position"]

        lat = pos_data.get("latitude_i", 0) / 1e7 if "latitude_i" in pos_data else pos_data.get("latitude", 0)
        lon = pos_data.get("longitude_i", 0) / 1e7 if "longitude_i" in pos_data else pos_data.get("longitude", 0)

        if lat == 0 and lon == 0:
            if config.debug:
                logger.debug(f"Skipping zero position for {node.node_id}")
            return None

        position = PositionMessage(
            node=node,
            latitude=lat,
            longitude=lon,
            altitude=pos_data.get("altitude"),
            ground_speed=pos_data.get("ground_speed"),
            ground_track=pos_data.get("ground_track"),
            precision_bits=pos_data.get("precision_bits"),
            timestamp=datetime.now(UTC)
        )

        # Persist position to node store
        node_store.update_node(node_id=node.node_id, position=(lat, lon))

        logger.info(f"Position from {node.callsign}: {lat:.6f}, {lon:.6f}")
        return position

    def _decode_text(self, node: MeshNode, payload: dict) -> Optional[TextMessage]:
        """Decode a text message."""
        text_data = payload.get("payload", {})

        text = text_data.get("text", "")
        if not text:
            return None

        to_id = payload.get("to")
        to_node = None
        if to_id and to_id != 0xFFFFFFFF:
            to_node = f"!{to_id:08x}" if isinstance(to_id, int) else str(to_id)

        message = TextMessage(
            node=node,
            text=text,
            to_node=to_node,
            channel=payload.get("channel", 0),
            timestamp=datetime.now(UTC)
        )

        logger.info(f"Text from {node.callsign}: {text[:50]}{'...' if len(text) > 50 else ''}")
        return message

    def get_node(self, node_id: str) -> Optional[MeshNode]:
        """Get a node from the cache."""
        return self._node_cache.get(node_id)
