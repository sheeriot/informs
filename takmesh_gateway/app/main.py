#!/usr/bin/env python3
"""
Takmesh Gateway - Meshtastic to TAK Bridge

Bidirectional protocol gateway between Meshtastic mesh network (via MQTT)
and TAK server (via TLS streaming).

Now includes a REST API for Django integration.

Usage:
    python main.py

Environment variables are loaded from config.py
"""
import asyncio
import logging
import signal
import sys
import threading
from datetime import datetime, UTC
from typing import Optional
from icecream import ic

import uvicorn

from config import config, forwarding
from mqtt_client import MeshtasticMQTTClient
from meshtastic_decode import MeshtasticDecoder, PositionMessage, TextMessage
from cot_builder import CotBuilder
from tak_client import TAKClient
from message_buffer import mqtt_buffer, tak_buffer, save_all_buffers
from node_store import node_store
from api import app as api_app, set_gateway_instance

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if config.debug else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger(__name__)

# Configure icecream for debugging
if config.debug:
    ic.configureOutput(prefix='[IC] ', outputFunction=logger.debug)
else:
    # Disable icecream when not in debug mode
    ic.disable()

# API configuration
API_HOST = "0.0.0.0"
API_PORT = 8090


class TakmeshGateway:
    """Main gateway orchestrator."""

    def __init__(self):
        self.decoder = MeshtasticDecoder()
        self.cot_builder = CotBuilder()
        self.mqtt_client = MeshtasticMQTTClient(on_message_callback=self._on_mesh_message)
        self.tak_client = TAKClient(on_cot_callback=self._on_tak_message)
        self._running = False
        self._ping_task = None

    async def _on_mesh_message(self, topic: str, payload: dict):
        """Handle incoming Meshtastic message from MQTT."""
        # Log raw payload keys for debugging
        if config.debug:
            logger.debug(f"[MQTT Raw] Topic: {topic}, Payload keys: {list(payload.keys())}")
            # Log key values for the fields we care about
            for key in ["sender", "rssi", "snr", "hops_away", "from", "type"]:
                if key in payload:
                    logger.debug(f"[MQTT Raw] {key}: {payload[key]} (type: {type(payload[key]).__name__})")

        # Decode the message
        message = self.decoder.decode_message(topic, payload)

        if message is None:
            # Build a useful summary even for unrecognized messages
            summary = self._summarize_mqtt_payload(payload, topic)
            msg_type = payload.get("type", "unknown")

            # Extract device_id and gateway_id for unrecognized messages too
            device_id = None
            from_id = payload.get("from")
            if from_id is not None:
                try:
                    device_id = f"!{int(from_id):08X}"
                except (ValueError, TypeError):
                    pass

            # Extract gateway ID from sender field (the gateway that sent it to MQTT)
            gateway_id = payload.get("sender") or ""

            # Extract all available fields for unrecognized messages
            hops_away = payload.get("hops_away")
            rf_gateway = self._extract_rf_gateway(payload)
            rssi = self._extract_rssi(payload)
            snr = self._extract_snr(payload)

            # Try to extract position if present
            latitude = None
            longitude = None
            altitude = None
            if "payload" in payload:
                payload_data = payload.get("payload", {})
                if "position" in payload_data:
                    pos = payload_data["position"]
                    latitude = pos.get("latitude_deg")
                    longitude = pos.get("longitude_deg")
                    altitude = pos.get("altitude")

            # Always buffer for inspection with all extracted fields
            mqtt_buffer.add_mqtt(
                msg_type=msg_type,
                topic=topic,
                payload=payload,
                summary=summary,
                device_id=device_id,
                gateway_id=gateway_id if gateway_id else None,
                hops_away=hops_away,
                rf_gateway=rf_gateway,
                rssi=rssi,
                snr=snr,
                latitude=latitude,
                longitude=longitude,
                altitude=altitude
            )
            return

        # Convert to CoT and send to TAK (if forwarding enabled)
        if isinstance(message, PositionMessage):
            # Buffer the position message
            lat_str = f"{message.latitude:.5f}"
            lon_str = f"{message.longitude:.5f}"

            # Use node_id from message.node (already hex-converted by _extract_node_id)
            device_id = message.node.node_id

            # Extract gateway ID from sender field (the gateway that sent it to MQTT)
            gateway_id = payload.get("sender") or ""

            # Extract hop count
            hops_away = payload.get("hops_away")
            hop_info = ""
            if hops_away is not None:
                hop_info = f"h{hops_away}"

            # Extract RF Gateway, RSSI, SNR
            rf_gateway = self._extract_rf_gateway(payload)
            rssi = self._extract_rssi(payload)
            snr = self._extract_snr(payload)

            # Log extracted fields for debugging
            if config.debug:
                logger.debug(f"[Position] Extracted fields - device_id: {device_id}, gateway_id: {gateway_id}, "
                           f"hops_away: {hops_away}, rf_gateway: {rf_gateway}, rssi: {rssi}, snr: {snr}")

            # Build summary with device_id as primary identifier (matches node database)
            # Format: "device_id gw:gwid hops:N rssi:XX snr:XX @ lat, lon"
            summary_parts = [device_id]
            # Use rf_gateway if available, otherwise gateway_id (they're usually the same)
            gw_id = rf_gateway or gateway_id
            if gw_id:
                summary_parts.append(f"gw:{gw_id}")
            if hops_away is not None:
                summary_parts.append(f"hops:{hops_away}")
            if rssi is not None:
                summary_parts.append(f"rssi:{rssi}")
            if snr is not None:
                summary_parts.append(f"snr:{snr}")
            summary_parts.append(f"@ {lat_str}, {lon_str}")

            summary = " ".join(summary_parts)
            logger.info(f"[MQTT Position] {summary}")

            mqtt_buffer.add_mqtt(
                msg_type="position",
                topic=topic,
                payload=payload,
                summary=summary,
                device_id=device_id,
                gateway_id=gateway_id if gateway_id else None,
                hops_away=hops_away,
                rf_gateway=rf_gateway,
                rssi=rssi,
                snr=snr,
                latitude=message.latitude,
                longitude=message.longitude,
                altitude=message.altitude
            )

            # Forward to TAK if enabled and valid position
            if forwarding.mesh2tak_enabled and message.has_valid_position:
                cot = self.cot_builder.build_position_cot(message)
                await self.tak_client.send(cot)
                logger.info(f"Sent position to TAK: {message.node.callsign}")

        elif isinstance(message, TextMessage):
            # Buffer the text message
            # Use node_id from message.node (already hex-converted by _extract_node_id)
            device_id = message.node.node_id

            # Extract gateway ID from sender field (the gateway that sent it to MQTT)
            gateway_id = payload.get("sender") or ""

            # Extract hop count
            hops_away = payload.get("hops_away")
            hop_info = ""
            if hops_away is not None:
                hop_info = f"h{hops_away}"

            # Extract RF Gateway, RSSI, SNR
            rf_gateway = self._extract_rf_gateway(payload)
            rssi = self._extract_rssi(payload)
            snr = self._extract_snr(payload)

            # Log extracted fields for debugging
            if config.debug:
                logger.debug(f"[Text] Extracted fields - device_id: {device_id}, gateway_id: {gateway_id}, "
                           f"hops_away: {hops_away}, rf_gateway: {rf_gateway}, rssi: {rssi}, snr: {snr}")

            # Build summary with device_id as primary identifier (matches node database)
            # Format: "device_id gw:gwid hops:N rssi:XX snr:XX text"
            summary_parts = [device_id]
            # Use rf_gateway if available, otherwise gateway_id (they're usually the same)
            gw_id = rf_gateway or gateway_id
            if gw_id:
                summary_parts.append(f"gw:{gw_id}")
            if hops_away is not None:
                summary_parts.append(f"hops:{hops_away}")
            if rssi is not None:
                summary_parts.append(f"rssi:{rssi}")
            if snr is not None:
                summary_parts.append(f"snr:{snr}")
            summary_parts.append(message.text[:50])

            summary = " ".join(summary_parts)
            logger.info(f"[MQTT Text] {summary}")

            mqtt_buffer.add_mqtt(
                msg_type="text",
                topic=topic,
                payload=payload,
                summary=summary,
                device_id=device_id,
                gateway_id=gateway_id if gateway_id else None,
                hops_away=hops_away,
                rf_gateway=rf_gateway,
                rssi=rssi,
                snr=snr
            )

            # Forward to TAK if enabled
            if forwarding.mesh2tak_enabled:
                cot = self.cot_builder.build_chat_cot(message)
                await self.tak_client.send(cot)
                logger.info(f"Sent chat to TAK: {message.node.callsign}: {message.text[:30]}...")

    def _summarize_mqtt_payload(self, payload: dict, topic: str = "") -> str:
        """Build a human-readable summary from raw MQTT payload.

        Args:
            payload: The MQTT message payload
            topic: The MQTT topic (for extracting gateway ID)
        """
        msg_type = payload.get("type", "")
        ic(f"[_summarize_mqtt_payload] msg_type: {msg_type}")

        # Extract device_id from "from" field (convert to hex)
        # Use the same conversion logic as _extract_node_id for consistency
        from_id = payload.get("from")
        device_id = ""
        if from_id is not None:
            try:
                # Convert to int (handles both int and string), then to uppercase hex
                device_id = f"!{int(from_id):08X}"
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to convert 'from' field to hex in summary: {from_id}, error: {e}")
                device_id = str(from_id)

        # Extract gateway ID from sender field (the gateway that sent it to MQTT)
        gateway_id = payload.get("sender") or ""

        # Extract hop count
        hops_away = payload.get("hops_away")
        hop_info = ""
        if hops_away is not None:
            hop_info = f"h{hops_away}"

        # Build summary with device_id as primary identifier (matches node database)
        # Format: "device_id @ gateway_id hN" or "device_id @ gateway_id hN @ coords"
        # Use device_id as primary identifier to match node database
        if device_id:
            summary_parts = [device_id]
            ic(f"[_summarize_mqtt_payload] Using device_id as primary identifier: {device_id}")
        else:
            # Fallback: try to get sender name
            sender_info = payload.get("sender_info", {})
            ic(f"[_summarize_mqtt_payload] sender_info: {sender_info}")
            sender = "Unknown"
            if sender_info.get("short_name"):
                sender = sender_info["short_name"]
            elif sender_info.get("long_name"):
                sender = sender_info["long_name"]
            summary_parts = [sender]

        # Extract RF Gateway, RSSI, SNR
        rf_gateway = self._extract_rf_gateway(payload)
        rssi = self._extract_rssi(payload)
        snr = self._extract_snr(payload)

        # Add gateway (use rf_gateway if available, otherwise gateway_id)
        gw_id = rf_gateway or gateway_id
        if gw_id:
            summary_parts.append(f"gw:{gw_id}")
        if hops_away is not None:
            summary_parts.append(f"hops:{hops_away}")
        if rssi is not None:
            summary_parts.append(f"rssi:{rssi}")
        if snr is not None:
            summary_parts.append(f"snr:{snr}")

        # Build summary based on type
        if msg_type == "nodeinfo":
            node_payload = payload.get("payload", {})
            name = node_payload.get("long_name") or node_payload.get("short_name") or sender
            final_summary = f"Node info: {name} {' '.join(summary_parts[1:])}".strip()
            ic(f"[_summarize_mqtt_payload] nodeinfo final_summary: {final_summary}")
            return final_summary
        elif msg_type == "telemetry":
            telem = payload.get("payload", {})
            device = telem.get("device_metrics", {})
            battery = device.get("battery_level")
            base_summary = " ".join(summary_parts)
            final_summary = f"{base_summary} telemetry (bat: {battery}%)" if battery else f"{base_summary} telemetry"
            ic(f"[_summarize_mqtt_payload] telemetry final_summary: {final_summary}")
            return final_summary
        elif msg_type == "position":
            # Position messages will have coords added later in the summary
            final_summary = " ".join(summary_parts)
            ic(f"[_summarize_mqtt_payload] position final_summary: {final_summary}")
            return final_summary
        elif msg_type == "text":
            text = payload.get("payload", {}).get("text", "")
            base_summary = " ".join(summary_parts)
            final_summary = f"{base_summary} {text[:40]}" if text else f"{base_summary} text msg"
            ic(f"[_summarize_mqtt_payload] text final_summary: {final_summary}")
            return final_summary
        elif msg_type:
            final_summary = " ".join(summary_parts) + f" {msg_type}"
            ic(f"[_summarize_mqtt_payload] {msg_type} final_summary: {final_summary}")
            return final_summary
        else:
            final_summary = " ".join(summary_parts) if summary_parts else "Unknown message"
            ic(f"[_summarize_mqtt_payload] unknown final_summary: {final_summary}")
            return final_summary

    def _log_payload_structure(self, payload: dict, indent: int = 0):
        """Recursively log payload structure to identify available fields."""
        prefix = "  " * indent
        for key, value in payload.items():
            if isinstance(value, dict):
                logger.debug(f"{prefix}{key}: (dict with keys: {list(value.keys())})")
                if indent < 2:  # Limit depth to avoid too much output
                    self._log_payload_structure(value, indent + 1)
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                logger.debug(f"{prefix}{key}: (list of dicts, first item keys: {list(value[0].keys())})")
            else:
                logger.debug(f"{prefix}{key}: {type(value).__name__} = {value}")

    def _extract_rf_gateway(self, payload: dict) -> Optional[str]:
        """Extract RF Gateway ID from payload.

        Uses 'sender' field which is the gateway that received the RF signal.
        """
        sender = payload.get("sender")
        if sender:
            return str(sender)
        return None

    def _extract_rssi(self, payload: dict) -> Optional[int]:
        """Extract RSSI (Received Signal Strength Indicator) from payload.

        Field name: 'rssi' (integer, e.g., -66)
        """
        rssi = payload.get("rssi")
        if rssi is not None:
            try:
                return int(rssi)
            except (ValueError, TypeError):
                if config.debug:
                    logger.debug(f"[RSSI] Failed to convert rssi to int: {rssi} (type: {type(rssi)})")
        return None

    def _extract_snr(self, payload: dict) -> Optional[float]:
        """Extract SNR (Signal-to-Noise Ratio) from payload.

        Field name: 'snr' (float, e.g., -3.25)
        """
        snr = payload.get("snr")
        if snr is not None:
            try:
                return float(snr)
            except (ValueError, TypeError):
                if config.debug:
                    logger.debug(f"[SNR] Failed to convert snr to float: {snr} (type: {type(snr)})")
        return None

    async def _on_tak_message(self, event: dict):
        """Handle incoming CoT event from TAK server."""
        # Extract device_id from UID (for Meshtastic messages, UID is like "meshtastic-XXXX")
        uid = event.get("uid", "")
        device_id = None
        if uid.startswith("meshtastic-"):
            # Extract hex device ID from UID (remove prefix)
            hex_id = uid.replace("meshtastic-", "").upper()
            device_id = f"!{hex_id}" if not hex_id.startswith("!") else hex_id

        # Build a useful summary based on event type
        callsign = event.get("callsign", "")
        cot_type = event.get("type", "unknown")
        lat = event.get("lat")
        lon = event.get("lon")
        alt = event.get("alt")
        remarks = event.get("remarks", "")

        if event.get("is_chat"):
            sender = event.get("sender_callsign", callsign or "TAK")
            # Chat summary: sender and message preview
            if remarks:
                summary = f"[{sender}] {remarks[:60]}"
            else:
                summary = f"Chat from {sender}"

            # Always buffer for inspection with all fields
            tak_buffer.add_tak(
                msg_type="chat",
                payload=event,
                summary=summary,
                device_id=device_id,
                callsign=sender,
                uid=uid,
                latitude=lat if lat and lat != 0.0 else None,
                longitude=lon if lon and lon != 0.0 else None,
                altitude=alt,
                is_chat=True
            )

            # Forward to Meshtastic if enabled
            if forwarding.tak2mesh_enabled and remarks:
                # Don't echo messages that came from Meshtastic
                if not uid.startswith("meshtastic-"):
                    await self.mqtt_client.publish_to_mesh(remarks, from_callsign=sender)
                    logger.info(f"Forwarded TAK chat to Meshtastic: [{sender}] {remarks[:30]}...")
        else:
            # Build comprehensive summary for position/other events
            type_desc = self._describe_cot_type(cot_type)

            # Start with callsign and type
            parts = []
            if callsign:
                parts.append(callsign)
            parts.append(type_desc)

            # Add location if available
            if lat is not None and lon is not None and lat != 0.0 and lon != 0.0:
                parts.append(f"@ {lat:.5f}, {lon:.5f}")

            # Add remarks preview if present (not chat)
            if remarks:
                remarks_preview = remarks[:40].replace('\n', ' ').strip()
                if remarks_preview:
                    parts.append(f"- {remarks_preview}")

            summary = " ".join(parts)

            # Determine message type for filtering
            msg_type = "position" if cot_type.startswith("a-") else "other"

            # Always buffer for inspection with all fields
            tak_buffer.add_tak(
                msg_type=msg_type,
                payload=event,
                summary=summary,
                device_id=device_id,
                callsign=callsign,
                uid=uid,
                latitude=lat if lat and lat != 0.0 else None,
                longitude=lon if lon and lon != 0.0 else None,
                altitude=alt,
                cot_type=cot_type,
                is_chat=False
            )

    def _describe_cot_type(self, cot_type: str) -> str:
        """Convert CoT type code to human-readable description."""
        # Common CoT type prefixes
        type_map = {
            "a-f-G": "Friendly Ground",
            "a-f-A": "Friendly Air",
            "a-f-S": "Friendly Sea",
            "a-h-G": "Hostile Ground",
            "a-h-A": "Hostile Air",
            "a-n-G": "Neutral Ground",
            "a-u-G": "Unknown Ground",
            "a-u-A": "Unknown Air",
            "b-t-f": "Chat",
            "b-m-p": "Marker Point",
            "b-r-f-h-c": "Route",
            "u-d-p": "Drawing Point",
        }

        # Try to match longest prefix first
        for prefix, desc in sorted(type_map.items(), key=lambda x: -len(x[0])):
            if cot_type.startswith(prefix):
                return desc

        # Fallback: return the type code
        return f"CoT: {cot_type}"

    async def _ping_loop(self):
        """Send periodic ping/presence to TAK server."""
        while self._running:
            try:
                if self.tak_client.is_connected:
                    ping = self.cot_builder.build_ping_cot()
                    await self.tak_client.send(ping)
                    if config.debug:
                        logger.debug("Sent gateway ping to TAK")

                # Ping every 5 minutes
                await asyncio.sleep(300)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in ping loop: {e}")
                await asyncio.sleep(60)

    async def start(self):
        """Start the gateway."""
        logger.info("=" * 60)
        logger.info("Takmesh Gateway Starting")
        logger.info("=" * 60)

        # Log configuration
        config.log_config(logger)

        # Validate configuration
        errors = config.validate()
        if errors:
            for error in errors:
                logger.error(f"Config error: {error}")
            raise ValueError("Configuration validation failed")

        self._running = True

        # Start components
        logger.info("Starting MQTT client...")
        mqtt_task = asyncio.create_task(self.mqtt_client.run())

        logger.info("Starting TAK client...")
        tak_task = asyncio.create_task(self.tak_client.run())

        # Wait for initial connections
        await asyncio.sleep(2)

        # Start ping loop
        self._ping_task = asyncio.create_task(self._ping_loop())

        logger.info("=" * 60)
        logger.info("Takmesh Gateway Running")
        logger.info("=" * 60)

        # Wait for tasks
        try:
            await asyncio.gather(mqtt_task, tak_task)
        except asyncio.CancelledError:
            logger.info("Gateway tasks cancelled")

    async def stop(self):
        """Stop the gateway."""
        logger.info("Stopping Takmesh Gateway...")
        self._running = False

        if self._ping_task:
            self._ping_task.cancel()
            try:
                await self._ping_task
            except asyncio.CancelledError:
                pass

        self.mqtt_client.stop()
        self.tak_client.stop()

        await self.mqtt_client.disconnect()
        await self.tak_client.disconnect()

        logger.info("Takmesh Gateway stopped")


# Global references for the API server thread
_api_thread: threading.Thread | None = None
_api_server: uvicorn.Server | None = None
_api_loop: asyncio.AbstractEventLoop | None = None


def run_api_in_thread():
    """
    Run the FastAPI server in a separate thread with its own event loop.
    This isolates the API from any blocking in the gateway's main event loop.
    """
    global _api_server, _api_loop

    # Create a new event loop for this thread
    _api_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_api_loop)

    logger.info(f"[API Thread] Starting uvicorn server on {API_HOST}:{API_PORT}")
    config_uvicorn = uvicorn.Config(
        api_app,
        host=API_HOST,
        port=API_PORT,
        log_level="info" if not config.debug else "debug",
        access_log=config.debug,
        lifespan="on",
        # Use wsproto for WebSocket - it doesn't validate Origin headers
        # This is required because nginx proxies requests from the web app's domain
        # and the default 'websockets' library rejects mismatched origins with 403
        ws="wsproto",
    )
    _api_server = uvicorn.Server(config_uvicorn)
    logger.info(f"[API Thread] Uvicorn server created, starting serve()...")

    try:
        _api_loop.run_until_complete(_api_server.serve())
    except Exception as e:
        logger.error(f"[API Thread] Error: {e}")
    finally:
        _api_loop.close()
        logger.info(f"[API Thread] Uvicorn server stopped")


def start_api_thread():
    """Start the API server in a separate thread."""
    global _api_thread

    _api_thread = threading.Thread(
        target=run_api_in_thread,
        name="api_server_thread",
        daemon=True  # Daemon thread will exit when main thread exits
    )
    _api_thread.start()
    logger.info(f"[Main] API server thread started")


def stop_api_thread():
    """Signal the API server to stop."""
    global _api_server, _api_loop

    if _api_server:
        _api_server.should_exit = True
        logger.info("[Main] Signaled API server to stop")

    # Give the server a moment to shut down gracefully
    if _api_thread and _api_thread.is_alive():
        _api_thread.join(timeout=5.0)
        if _api_thread.is_alive():
            logger.warning("[Main] API thread did not stop in time")


async def run_gateway_with_recovery(gateway, shutdown_event: asyncio.Event):
    """Run gateway with error recovery - keeps trying if config is invalid."""
    while not shutdown_event.is_set():
        try:
            await gateway.start()
            break  # If start completes normally, exit loop
        except ValueError as e:
            # Configuration error - gateway can't start but API should keep running
            logger.warning(f"Gateway cannot start: {e}")
            logger.info("API server continues running. Fix configuration and restart container.")
            # Wait for shutdown signal
            await shutdown_event.wait()
            break
        except asyncio.CancelledError:
            logger.info("Gateway task cancelled")
            break
        except Exception as e:
            if shutdown_event.is_set():
                break
            logger.error(f"Gateway error: {e}")
            logger.info("Retrying gateway in 30 seconds...")
            try:
                await asyncio.wait_for(shutdown_event.wait(), timeout=30)
                break  # Shutdown requested
            except asyncio.TimeoutError:
                pass  # Retry


async def graceful_shutdown(gateway, gateway_task):
    """Perform graceful shutdown of all components."""
    logger.info("Initiating graceful shutdown...")

    # 1. Save all persistent data to disk
    save_all_buffers()
    node_store.save_to_file()
    logger.info("Persistent data saved")

    # 2. Stop the gateway (MQTT + TAK connections)
    await gateway.stop()

    # 3. Cancel the gateway task
    if gateway_task and not gateway_task.done():
        gateway_task.cancel()
        try:
            await asyncio.wait_for(gateway_task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    # 4. Stop the API server thread
    stop_api_thread()

    logger.info("Graceful shutdown complete")


async def main():
    """Main entry point - runs API server in thread and gateway in main loop."""
    gateway = TakmeshGateway()

    # Register gateway with API
    set_gateway_instance(gateway, datetime.now(UTC))

    # Handle shutdown signals
    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def signal_handler():
        if not shutdown_event.is_set():
            logger.info("Received shutdown signal")
            shutdown_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    logger.info("=" * 60)
    logger.info("Takmesh Gateway with REST API")
    logger.info(f"REST API available at http://{API_HOST}:{API_PORT}")
    logger.info(f"WebSocket endpoint available at ws://{API_HOST}:{API_PORT}/ws/messages")
    logger.info("=" * 60)

    # Start API server in a separate thread (isolates it from gateway's event loop)
    start_api_thread()

    # Give the API server a moment to start
    await asyncio.sleep(0.5)

    # Run gateway in main event loop
    gateway_task = asyncio.create_task(
        run_gateway_with_recovery(gateway, shutdown_event),
        name="gateway"
    )

    try:
        # Wait for shutdown signal or gateway completion
        done, pending = await asyncio.wait(
            [gateway_task, asyncio.create_task(shutdown_event.wait(), name="shutdown_wait")],
            return_when=asyncio.FIRST_COMPLETED
        )

        # Check what completed
        for task in done:
            if task.get_name() == "gateway" and not task.cancelled():
                exc = task.exception()
                if exc:
                    logger.error(f"Gateway task failed: {exc}")

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
        shutdown_event.set()
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
    finally:
        # Perform graceful shutdown
        await graceful_shutdown(gateway, gateway_task)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass  # Already handled in main()
