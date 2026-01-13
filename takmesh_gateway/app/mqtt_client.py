"""
MQTT Client for Meshtastic message subscription and publishing.
Uses gmqtt for async MQTT operations.
"""
import asyncio
import json
import logging
from typing import Callable, Optional, Awaitable

from gmqtt import Client as MQTTClient
from gmqtt.mqtt.constants import MQTTv311

from config import config

logger = logging.getLogger(__name__)


class MeshtasticMQTTClient:
    """Async MQTT client for Meshtastic message handling."""

    def __init__(self, on_message_callback: Callable[[str, dict], Awaitable[None]]):
        """
        Initialize MQTT client.

        Args:
            on_message_callback: Async callback for received messages.
                                 Called with (topic: str, payload: dict)
        """
        self.client: Optional[MQTTClient] = None
        self.on_message_callback = on_message_callback
        self._connected = asyncio.Event()
        self._stop_event = asyncio.Event()

    def _on_connect(self, client, flags, rc, properties):
        """Handle MQTT connection."""
        if rc == 0:
            logger.info(f"Connected to MQTT broker {config.mqtt_host}:{config.mqtt_port}")
            self._connected.set()
            # Subscribe to Meshtastic topic
            client.subscribe(config.mqtt_subscribe_topic, qos=1)
            logger.info(f"Subscribed to {config.mqtt_subscribe_topic}")
        else:
            logger.error(f"MQTT connection failed with code {rc}")

    def _on_disconnect(self, client, packet, exc=None):
        """Handle MQTT disconnection."""
        logger.warning(f"Disconnected from MQTT broker: {exc}")
        self._connected.clear()

    def _on_message(self, client, topic, payload, qos, properties):
        """Handle incoming MQTT message."""
        try:
            # Check if payload is None or empty
            if payload is None:
                logger.warning(f"Received None payload from {topic}")
                return 0
            
            # Decode payload to string
            try:
                payload_str = payload.decode('utf-8')
            except (AttributeError, UnicodeDecodeError) as e:
                logger.warning(f"Failed to decode payload bytes from {topic}: {e} (type: {type(payload)}, value: {repr(payload)[:100]})")
                return 0
            
            # Check if payload is empty
            if not payload_str.strip():
                logger.warning(f"Received empty payload from {topic}")
                return 0
            
            # Decode JSON payload
            message = json.loads(payload_str)

            if config.debug:
                logger.debug(f"MQTT message on {topic}: {json.dumps(message, indent=2)}")

            # Schedule the async callback
            asyncio.create_task(self._handle_message(topic, message))

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to decode JSON from {topic}: {e}")
            if config.debug and payload:
                try:
                    payload_preview = payload.decode('utf-8')[:200] if isinstance(payload, bytes) else str(payload)[:200]
                    logger.debug(f"Payload preview: {payload_preview}")
                except:
                    logger.debug(f"Payload (raw): {repr(payload)[:200]}")
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}", exc_info=True)

        return 0  # Return PUBACK

    async def _handle_message(self, topic: str, message: dict):
        """Process message through callback."""
        try:
            await self.on_message_callback(topic, message)
        except Exception as e:
            logger.error(f"Error in message callback: {e}")

    async def connect(self):
        """Connect to MQTT broker."""
        self.client = MQTTClient(client_id=f"takmesh-{config.gateway_uid}")

        # Set callbacks
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        # Set credentials if provided
        if config.mqtt_username:
            self.client.set_auth_credentials(config.mqtt_username, config.mqtt_password)

        logger.info(f"Connecting to MQTT broker {config.mqtt_host}:{config.mqtt_port}...")

        await self.client.connect(
            config.mqtt_host,
            config.mqtt_port,
            version=MQTTv311
        )

        # Wait for connection
        await self._connected.wait()

    async def publish(self, topic: str, payload: dict):
        """
        Publish a message to MQTT.

        Args:
            topic: MQTT topic to publish to
            payload: Dictionary to publish as JSON
        """
        if not self.client or not self._connected.is_set():
            logger.warning("Cannot publish: MQTT not connected")
            return

        message = json.dumps(payload)
        self.client.publish(topic, message, qos=1)

        if config.debug:
            logger.debug(f"Published to {topic}: {message}")

    async def publish_to_mesh(self, text: str, from_callsign: str = "TAK"):
        """
        Publish a text message to Meshtastic network.

        Args:
            text: Message text to send
            from_callsign: Callsign of the sender
        """
        # Meshtastic expects a specific JSON format for text messages
        payload = {
            "from": 0,  # Will be set by the gateway node
            "to": 0xFFFFFFFF,  # Broadcast
            "channel": 0,
            "type": "text",
            "payload": {
                "text": f"[{from_callsign}] {text}"
            }
        }

        topic = f"{config.mqtt_publish_topic_base}/text"
        await self.publish(topic, payload)
        logger.info(f"Sent to Meshtastic: [{from_callsign}] {text}")

    async def disconnect(self):
        """Disconnect from MQTT broker."""
        if self.client:
            await self.client.disconnect()
            logger.info("Disconnected from MQTT broker")

    async def run(self):
        """Run the MQTT client until stopped."""
        while not self._stop_event.is_set():
            try:
                if not self._connected.is_set():
                    await self.connect()
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"MQTT error: {e}")
                self._connected.clear()
                await asyncio.sleep(config.reconnect_delay)

    def stop(self):
        """Signal the client to stop."""
        self._stop_event.set()
