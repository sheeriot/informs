"""
Redis-backed circular buffers for storing MQTT and TAK messages separately.
Used by the REST API to provide message inspection capabilities.
Uses Redis lists for fast, non-blocking operations.
"""
import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, UTC
from typing import Optional, Literal

import redis
from json_formatter import format_payload_json

logger = logging.getLogger(__name__)

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# WebSocket broadcast callback (set by api.py to avoid circular imports)
_websocket_broadcast_callback = None

# Global Redis client (initialized lazily)
_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    """Get or create the Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        logger.info(f"Connected to Redis at {REDIS_URL}")
    return _redis_client


def set_websocket_broadcast_callback(callback):
    """Set the callback function to broadcast messages via WebSocket."""
    global _websocket_broadcast_callback
    _websocket_broadcast_callback = callback


@dataclass
class MQTTBufferedMessage:
    """A Meshtastic MQTT message stored in the buffer with all enriched fields."""
    timestamp: str  # ISO format string for JSON serialization
    msg_type: str  # position, text, nodeinfo, telemetry, other
    source: Literal["mqtt"] = "mqtt"
    topic: Optional[str] = None  # MQTT topic
    payload: dict = field(default_factory=dict)  # Original full payload

    # Correlation ID to link input to output
    correlation_id: Optional[str] = None  # UUID linking to output buffer

    # Enriched fields for display and processing
    summary: str = ""  # Human-readable summary (computed on backend)
    device_id: Optional[str] = None  # Hex device ID (from 'from' field)
    short_name: Optional[str] = None  # Device short name from node_store
    gateway_id: Optional[str] = None  # Gateway ID (sender field from MQTT)

    # RF/Mesh-specific fields
    hops_away: Optional[int] = None  # Number of hops through mesh
    rf_gateway: Optional[str] = None  # RF Gateway ID (sender field)
    rssi: Optional[int] = None  # Received Signal Strength Indicator
    snr: Optional[float] = None  # Signal-to-Noise Ratio

    # Position fields
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None

    # Time delta tracking (computed when message is added)
    time_delta_seconds: Optional[float] = None  # Time since last message from this device_id

    # Formatted payload JSON (computed once when message is added)
    formatted_payload_json: Optional[str] = None  # Pre-formatted JSON with break points


@dataclass
class TAKBufferedMessage:
    """A TAK CoT message stored in the buffer with all enriched fields."""
    timestamp: str  # ISO format string for JSON serialization
    msg_type: str  # position, chat, other
    source: Literal["tak"] = "tak"
    payload: dict = field(default_factory=dict)  # Original full CoT event dict

    # Correlation ID to link input to output
    correlation_id: Optional[str] = None  # UUID linking to output buffer

    # Enriched fields for display and processing
    summary: str = ""  # Human-readable summary (computed on backend)
    device_id: Optional[str] = None  # Device ID extracted from UID (for Meshtastic-originated messages)
    callsign: Optional[str] = None  # Callsign from CoT event
    uid: Optional[str] = None  # CoT UID

    # Position fields
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None

    # CoT-specific fields
    cot_type: Optional[str] = None  # CoT type code (e.g., "a-f-G-U-C")
    is_chat: bool = False  # Whether this is a chat message

    # Time delta tracking (computed when message is added)
    time_delta_seconds: Optional[float] = None  # Time since last message from this device_id/callsign

    # Formatted payload JSON (computed once when message is added)
    formatted_payload_json: Optional[str] = None  # Pre-formatted JSON with break points


@dataclass
class OutputBufferedMessage:
    """
    Output message tracking for each processed input message.
    Links to input via correlation_id and tracks what was generated/sent.
    """
    timestamp: str  # ISO format when output was created
    correlation_id: str  # UUID linking to input message
    input_buffer: Literal["mqtt", "tak"]  # Which input buffer the source came from
    input_timestamp: str  # When the input message was received

    # Processing result
    filtered: bool = False  # Was the message filtered out?
    filtered_reason: Optional[str] = None  # Why it was filtered (if filtered)

    # Send status
    sent: bool = False  # Was it actually sent?
    send_result: Literal["success", "failed", "not_sent"] = "not_sent"
    send_timestamp: Optional[str] = None  # When it was sent (if sent)

    # Output channel
    outbound_channel: Optional[Literal["tak", "mesh"]] = None  # Where it was sent

    # Generated output (for debugging)
    generated_cot: Optional[str] = None  # Full COT XML string
    cot_uid: Optional[str] = None  # Extracted UID from generated COT
    cot_type: Optional[str] = None  # Extracted type from generated COT

    # Input message summary for quick reference
    input_summary: str = ""
    input_device_id: Optional[str] = None
    input_msg_type: Optional[str] = None

    # TAK Server Verification
    cot_received: Optional[bool] = None  # Was COT verified as received by TAK server?
    cot_received_timestamp: Optional[str] = None  # When verification occurred
    cot_verification_method: Optional[str] = None  # How it was verified (echo, api_query, buffer_match)


class MessageBuffer:
    """
    Redis-backed circular buffer for messages.
    Uses Redis lists with LPUSH + LTRIM for circular buffer behavior.
    """

    def __init__(self, name: str, max_size: int = 1000):
        self.name = name
        self._max_size = max_size
        self._list_key = f"takmesh:buffer:{name}"
        self._count_key = f"takmesh:buffer:{name}:count"

    def _get_redis(self) -> redis.Redis:
        """Get the Redis client."""
        return get_redis_client()

    def add_mqtt(
        self,
        msg_type: str = "other",
        topic: Optional[str] = None,
        payload: Optional[dict] = None,
        summary: str = "",
        device_id: Optional[str] = None,
        short_name: Optional[str] = None,
        gateway_id: Optional[str] = None,
        hops_away: Optional[int] = None,
        rf_gateway: Optional[str] = None,
        rssi: Optional[int] = None,
        snr: Optional[float] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        altitude: Optional[float] = None,
        correlation_id: Optional[str] = None,
    ) -> None:
        """Add an MQTT message to the buffer with all enriched fields."""
        now = datetime.now(UTC)
        timestamp_str = now.isoformat()

        # Calculate time delta from last message for this device
        time_delta = None
        if device_id:
            last_timestamp_key = f"takmesh:last_msg:{device_id}"
            try:
                r = self._get_redis()
                last_timestamp = r.get(last_timestamp_key)
                if last_timestamp:
                    try:
                        last_dt = datetime.fromisoformat(last_timestamp.replace('Z', '+00:00'))
                        time_delta = (now - last_dt).total_seconds()
                    except (ValueError, AttributeError):
                        pass
                # Update last message timestamp for this device
                r.set(last_timestamp_key, timestamp_str)
            except redis.RedisError:
                pass

        # Format payload JSON once when adding to buffer
        formatted_json = format_payload_json(payload or {})

        msg = MQTTBufferedMessage(
            timestamp=timestamp_str,
            source="mqtt",
            msg_type=msg_type,
            topic=topic,
            payload=payload or {},
            correlation_id=correlation_id,
            summary=summary,
            device_id=device_id,
            short_name=short_name,
            gateway_id=gateway_id,
            hops_away=hops_away,
            rf_gateway=rf_gateway,
            rssi=rssi,
            snr=snr,
            latitude=latitude,
            longitude=longitude,
            altitude=altitude,
            time_delta_seconds=time_delta,
            formatted_payload_json=formatted_json
        )

        self._add_message(msg)

    def add_tak(
        self,
        msg_type: str = "other",
        payload: Optional[dict] = None,
        summary: str = "",
        device_id: Optional[str] = None,
        callsign: Optional[str] = None,
        uid: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        altitude: Optional[float] = None,
        cot_type: Optional[str] = None,
        is_chat: bool = False,
        correlation_id: Optional[str] = None,
    ) -> None:
        """Add a TAK message to the buffer with all enriched fields."""
        now = datetime.now(UTC)
        timestamp_str = now.isoformat()

        # Calculate time delta from last message for this device/callsign
        time_delta = None
        identifier = device_id or callsign
        if identifier:
            last_timestamp_key = f"takmesh:last_msg:{identifier}"
            try:
                r = self._get_redis()
                last_timestamp = r.get(last_timestamp_key)
                if last_timestamp:
                    try:
                        last_dt = datetime.fromisoformat(last_timestamp.replace('Z', '+00:00'))
                        time_delta = (now - last_dt).total_seconds()
                    except (ValueError, AttributeError):
                        pass
                # Update last message timestamp for this device/callsign
                r.set(last_timestamp_key, timestamp_str)
            except redis.RedisError:
                pass

        # Format payload JSON once when adding to buffer
        formatted_json = format_payload_json(payload or {})

        msg = TAKBufferedMessage(
            timestamp=timestamp_str,
            source="tak",
            msg_type=msg_type,
            payload=payload or {},
            correlation_id=correlation_id,
            summary=summary,
            device_id=device_id,
            callsign=callsign,
            uid=uid,
            latitude=latitude,
            longitude=longitude,
            altitude=altitude,
            cot_type=cot_type,
            is_chat=is_chat,
            time_delta_seconds=time_delta,
            formatted_payload_json=formatted_json
        )

        self._add_message(msg)

    def add_output(
        self,
        correlation_id: str,
        input_buffer: Literal["mqtt", "tak"],
        input_timestamp: str,
        input_summary: str = "",
        input_device_id: Optional[str] = None,
        input_msg_type: Optional[str] = None,
        filtered: bool = False,
        filtered_reason: Optional[str] = None,
        sent: bool = False,
        send_result: Literal["success", "failed", "not_sent"] = "not_sent",
        outbound_channel: Optional[Literal["tak", "mesh"]] = None,
        generated_cot: Optional[str] = None,
        cot_uid: Optional[str] = None,
        cot_type: Optional[str] = None,
        cot_received: Optional[bool] = None,
        cot_received_timestamp: Optional[str] = None,
        cot_verification_method: Optional[str] = None,
    ) -> None:
        """Add an output message to the buffer tracking what was generated for an input."""
        now = datetime.now(UTC)
        timestamp_str = now.isoformat()

        # Set send_timestamp if actually sent
        send_timestamp = timestamp_str if sent else None

        msg = OutputBufferedMessage(
            timestamp=timestamp_str,
            correlation_id=correlation_id,
            input_buffer=input_buffer,
            input_timestamp=input_timestamp,
            filtered=filtered,
            filtered_reason=filtered_reason,
            sent=sent,
            send_result=send_result,
            send_timestamp=send_timestamp,
            outbound_channel=outbound_channel,
            generated_cot=generated_cot,
            cot_uid=cot_uid,
            cot_type=cot_type,
            input_summary=input_summary,
            input_device_id=input_device_id,
            input_msg_type=input_msg_type,
            cot_received=cot_received,
            cot_received_timestamp=cot_received_timestamp,
            cot_verification_method=cot_verification_method,
        )

        self._add_message(msg)

    def _add_message(self, msg) -> None:
        """Internal method to add any message type to the buffer."""
        try:
            r = self._get_redis()
            msg_json = json.dumps(asdict(msg))

            # Use pipeline for atomic operations
            pipe = r.pipeline()
            pipe.lpush(self._list_key, msg_json)  # Add to front
            pipe.ltrim(self._list_key, 0, self._max_size - 1)  # Keep only max_size
            pipe.incr(self._count_key)  # Increment total count
            pipe.execute()

        except redis.RedisError as e:
            logger.error(f"Redis error adding message to {self.name}: {e}")
            return

        # Queue message for batched WebSocket broadcast (synchronous call)
        if _websocket_broadcast_callback:
            try:
                msg_dict = asdict(msg)
                stats = self.get_stats()
                _websocket_broadcast_callback(self.name, msg_dict, stats)
            except Exception as e:
                logger.debug(f"Error queuing message for broadcast: {e}")

    def get_messages(
        self,
        limit: Optional[int] = None,
        msg_type: Optional[str] = None,
        since_id: Optional[str] = None
    ) -> list[dict]:
        """
        Get messages from the buffer.

        Args:
            limit: Maximum number of messages to return (None = all)
            msg_type: Filter by message type
            since_id: Only return messages newer than this timestamp/ID

        Returns:
            List of message dictionaries, newest first
        """
        try:
            r = self._get_redis()

            # Get messages (already newest first due to LPUSH)
            # If since_id is provided, we need to scan and filter
            fetch_limit = -1 if (limit is None or since_id) else (limit - 1)
            messages_json = r.lrange(self._list_key, 0, fetch_limit if fetch_limit != -1 else 500)

            messages = []
            for msg_json in messages_json:
                try:
                    msg = json.loads(msg_json)

                    # Filter by since_id (timestamp comparison)
                    if since_id:
                        msg_ts = msg.get("timestamp", "")
                        # If message timestamp <= since_id, we've seen it already
                        if msg_ts and msg_ts <= since_id:
                            break  # Messages are sorted newest first, so stop here

                    # Apply type filter
                    if msg_type is None or msg.get("msg_type") == msg_type:
                        messages.append(msg)

                    # Apply limit after filtering
                    if limit and len(messages) >= limit:
                        break

                except json.JSONDecodeError:
                    continue

            # If filtering by type and we have a limit, we may need more
            if msg_type and limit and len(messages) < limit and not since_id:
                # Get all and filter
                all_messages_json = r.lrange(self._list_key, 0, -1)
                messages = []
                for msg_json in all_messages_json:
                    try:
                        msg = json.loads(msg_json)
                        if msg.get("msg_type") == msg_type:
                            messages.append(msg)
                            if len(messages) >= limit:
                                break
                    except json.JSONDecodeError:
                        continue

            return messages

        except redis.RedisError as e:
            logger.error(f"Redis error getting messages from {self.name}: {e}")
            return []

    def get_stats(self) -> dict:
        """Get buffer statistics."""
        try:
            r = self._get_redis()
            pipe = r.pipeline()
            pipe.llen(self._list_key)
            pipe.get(self._count_key)
            results = pipe.execute()

            buffer_size = results[0] or 0
            total_count = int(results[1] or 0)

            return {
                "name": self.name,
                "buffer_size": buffer_size,
                "buffer_max": self._max_size,
                "total_messages": total_count
            }
        except redis.RedisError as e:
            logger.error(f"Redis error getting stats for {self.name}: {e}")
            return {
                "name": self.name,
                "buffer_size": 0,
                "buffer_max": self._max_size,
                "total_messages": 0,
                "error": str(e)
            }

    def clear(self) -> None:
        """Clear the buffer (but keep count)."""
        try:
            r = self._get_redis()
            r.delete(self._list_key)
            logger.info(f"Cleared buffer {self.name}")
        except redis.RedisError as e:
            logger.error(f"Redis error clearing {self.name}: {e}")

    def clear_all_device_timestamps(self) -> None:
        """Clear all device timestamp tracking keys."""
        try:
            r = self._get_redis()
            pattern = "takmesh:last_msg:*"
            keys = list(r.scan_iter(match=pattern))
            if keys:
                r.delete(*keys)
                logger.info(f"Cleared {len(keys)} device timestamp keys")
        except redis.RedisError as e:
            logger.error(f"Redis error clearing device timestamps: {e}")

    @property
    def size(self) -> int:
        """Current number of messages in buffer."""
        try:
            r = self._get_redis()
            return r.llen(self._list_key) or 0
        except redis.RedisError:
            return 0

    @property
    def max_size(self) -> int:
        """Maximum buffer capacity."""
        return self._max_size

    def get_output_for_correlation(self, correlation_id: str) -> Optional[dict]:
        """
        Get output message for a given correlation_id.
        
        Args:
            correlation_id: UUID linking input and output messages
            
        Returns:
            Output message dict or None if not found
        """
        try:
            r = self._get_redis()
            messages_json = r.lrange(self._list_key, 0, -1)
            
            for msg_json in messages_json:
                try:
                    msg = json.loads(msg_json)
                    if msg.get("correlation_id") == correlation_id:
                        return msg
                except json.JSONDecodeError:
                    continue
                    
            return None
        except redis.RedisError as e:
            logger.error(f"Redis error getting output for correlation {correlation_id}: {e}")
            return None

    def get_outputs_by_correlation_ids(self, correlation_ids: list[str]) -> dict[str, dict]:
        """
        Batch fetch multiple output messages by correlation_ids.
        More efficient than individual lookups.
        
        Args:
            correlation_ids: List of correlation IDs to fetch
            
        Returns:
            Dictionary mapping correlation_id -> output message dict
        """
        if not correlation_ids:
            return {}
        
        result = {}
        try:
            r = self._get_redis()
            messages_json = r.lrange(self._list_key, 0, -1)
            
            # Build set for fast lookup
            correlation_set = set(correlation_ids)
            
            for msg_json in messages_json:
                try:
                    msg = json.loads(msg_json)
                    corr_id = msg.get("correlation_id")
                    if corr_id and corr_id in correlation_set:
                        result[corr_id] = msg
                        correlation_set.discard(corr_id)
                        # Early exit if we found all requested IDs
                        if not correlation_set:
                            break
                except json.JSONDecodeError:
                    continue
                    
        except redis.RedisError as e:
            logger.error(f"Redis error batch getting outputs: {e}")
        
        return result

    def update_output_verification(
        self,
        correlation_id: str,
        cot_received: bool,
        cot_received_timestamp: Optional[str] = None,
        cot_verification_method: Optional[str] = None,
    ) -> bool:
        """
        Update COT verification status for an output message.
        
        Args:
            correlation_id: UUID linking input and output messages
            cot_received: Whether COT was verified as received
            cot_received_timestamp: When verification occurred (defaults to now)
            cot_verification_method: How it was verified (echo, api_query, buffer_match)
            
        Returns:
            True if update was successful, False otherwise
        """
        try:
            r = self._get_redis()
            messages_json = r.lrange(self._list_key, 0, -1)
            
            for i, msg_json in enumerate(messages_json):
                try:
                    msg = json.loads(msg_json)
                    if msg.get("correlation_id") == correlation_id:
                        # Update the message
                        msg["cot_received"] = cot_received
                        msg["cot_received_timestamp"] = cot_received_timestamp or datetime.now(UTC).isoformat()
                        if cot_verification_method:
                            msg["cot_verification_method"] = cot_verification_method
                        
                        # Replace in Redis list
                        updated_json = json.dumps(msg)
                        pipe = r.pipeline()
                        pipe.lset(self._list_key, i, updated_json)
                        pipe.execute()
                        
                        logger.debug(f"Updated verification for correlation {correlation_id}: received={cot_received}")
                        return True
                except json.JSONDecodeError:
                    continue
                    
            logger.warning(f"Output message with correlation_id {correlation_id} not found")
            return False
        except redis.RedisError as e:
            logger.error(f"Redis error updating verification for correlation {correlation_id}: {e}")
            return False


# Separate buffers for each direction
# mqtt_buffer: Meshtastic MQTT messages received (mesh2tak inspection)
mqtt_buffer = MessageBuffer("mqtt", max_size=1000)

# tak_buffer: TAK CoT messages received (tak2mesh inspection)
tak_buffer = MessageBuffer("tak", max_size=1000)

# output_buffer: Generated output messages (COT/Mesh) with correlation to input
output_buffer = MessageBuffer("output", max_size=1000)


def get_combined_stats() -> dict:
    """Get stats for all buffers."""
    return {
        "mqtt": mqtt_buffer.get_stats(),
        "tak": tak_buffer.get_stats(),
        "output": output_buffer.get_stats()
    }


def save_all_buffers() -> None:
    """
    No-op for Redis backend - data is already persisted.
    Kept for API compatibility with main.py graceful shutdown.
    """
    logger.info("Message buffers use Redis - no file save needed")
