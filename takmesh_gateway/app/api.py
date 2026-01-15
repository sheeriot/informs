"""
FastAPI REST API for TAKMesh Gateway.
Provides endpoints for Django to control and inspect the gateway.
"""
import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Optional, Literal, Dict

import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from message_buffer import mqtt_buffer, tak_buffer, output_buffer, get_combined_stats
from node_store import node_store

logger = logging.getLogger(__name__)

# Configuration from environment
WS_FLUSH_INTERVAL_SEC = float(os.getenv("WS_FLUSH_INTERVAL_SEC", "1.0"))
WS_MAX_BATCH_SIZE = int(os.getenv("WS_MAX_BATCH_SIZE", "50"))
WS_SLOW_CLIENT_THRESHOLD = int(os.getenv("WS_SLOW_CLIENT_THRESHOLD", "100"))

# API app instance
app = FastAPI(
    title="TAKMesh Gateway API",
    description="REST API for controlling and inspecting the Meshtastic-TAK gateway",
    version="1.0.0"
)

# Add CORS middleware to allow WebSocket connections from any origin
# This is necessary because the browser sends an Origin header that must be accepted
# The WebSocket is proxied through nginx, so the Origin will be the web app's domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for WebSocket connections
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Start broadcaster and log API availability."""
    await broadcaster.start()
    logger.info("=" * 60)
    logger.info("TAKMesh Gateway API Ready")
    logger.info("REST API endpoints available at /health, /status, /messages, etc.")
    logger.info("WebSocket endpoint available at /ws/messages")
    logger.info(f"  - Batched updates every {WS_FLUSH_INTERVAL_SEC}s")
    logger.info("  - Compression: permessage-deflate (enabled by default)")
    logger.info("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """Stop broadcaster on shutdown."""
    await broadcaster.stop()
    logger.info("TAKMesh Gateway API shutdown complete")


@app.middleware("http")
async def log_requests(request, call_next):
    """Log all HTTP requests for debugging."""
    logger.info(f"[HTTP] {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"[HTTP] {request.method} {request.url.path} -> {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"[HTTP] {request.method} {request.url.path} -> ERROR: {e}", exc_info=True)
        raise

# Gateway state (will be set by main.py)
gateway_instance = None
gateway_start_time: Optional[datetime] = None


@dataclass
class ClientState:
    """Track state for each WebSocket client for slow client detection."""
    websocket: WebSocket
    pending_sends: int = 0
    last_send_time: float = field(default_factory=time.time)
    dropped_count: int = 0
    total_batches_sent: int = 0


class CoalescingBroadcaster:
    """
    Coalesces WebSocket messages and broadcasts in batches at a fixed interval.
    Implements backpressure by dropping oldest messages and skipping slow clients.
    """

    def __init__(
        self,
        flush_interval_sec: float = WS_FLUSH_INTERVAL_SEC,
        max_batch_size: int = WS_MAX_BATCH_SIZE,
        slow_client_threshold: int = WS_SLOW_CLIENT_THRESHOLD
    ):
        self.flush_interval = flush_interval_sec
        self.max_batch_size = max_batch_size
        self.slow_client_threshold = slow_client_threshold

        # Per-buffer message queues
        self.pending: Dict[str, list] = {"mqtt": [], "tak": [], "output": []}
        self.pending_lock = asyncio.Lock()

        # Client tracking
        self.clients: Dict[WebSocket, ClientState] = {}
        self.clients_lock = asyncio.Lock()

        # Flush loop control
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False

        # Stats
        self.total_messages_queued = 0
        self.total_messages_dropped = 0
        self.total_batches_sent = 0

    async def start(self):
        """Start the flush loop."""
        if self._running:
            return
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info(f"[Broadcaster] Started with {self.flush_interval}s interval, "
                   f"max_batch={self.max_batch_size}, slow_threshold={self.slow_client_threshold}")

    async def stop(self):
        """Stop the flush loop."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
            self._flush_task = None
        logger.info("[Broadcaster] Stopped")

    async def add_client(self, websocket: WebSocket):
        """Register a new WebSocket client."""
        async with self.clients_lock:
            self.clients[websocket] = ClientState(websocket=websocket)
        logger.info(f"[Broadcaster] Client added. Total: {len(self.clients)}")

    async def remove_client(self, websocket: WebSocket):
        """Remove a WebSocket client."""
        async with self.clients_lock:
            if websocket in self.clients:
                del self.clients[websocket]
        logger.info(f"[Broadcaster] Client removed. Total: {len(self.clients)}")

    def queue_message(self, buffer_name: str, message: dict, stats: dict):
        """
        Queue a message for broadcast. Called from message_buffer.
        This is synchronous to avoid blocking the message ingestion path.
        """
        if buffer_name not in self.pending:
            return

        queue = self.pending[buffer_name]
        queue.append({"message": message, "stats": stats})
        self.total_messages_queued += 1

        # Drop oldest if over limit (keep freshest for live telemetry)
        while len(queue) > self.max_batch_size:
            queue.pop(0)
            self.total_messages_dropped += 1

    async def _flush_loop(self):
        """Background task that flushes queued messages at fixed intervals."""
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval)
                await self._flush_all()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[Broadcaster] Flush error: {e}")

    async def _flush_all(self):
        """Flush all pending messages to clients."""
        async with self.pending_lock:
            for buffer_name, queue in self.pending.items():
                if not queue:
                    continue

                # Extract messages and stats
                messages = [item["message"] for item in queue]
                stats = queue[-1]["stats"]  # Use latest stats
                dropped_in_batch = max(0, len(queue) - self.max_batch_size)
                queue.clear()

                # Broadcast to clients
                await self._broadcast_batch(buffer_name, messages, stats, dropped_in_batch)

    async def _broadcast_batch(
        self,
        buffer_name: str,
        messages: list,
        stats: dict,
        dropped: int = 0
    ):
        """Send a batch of messages to all connected clients."""
        if not messages:
            return

        # Enrich mqtt and tak messages with output status before broadcasting
        if buffer_name in ["mqtt", "tak"]:
            messages = enrich_messages_with_output_status(messages, buffer_name)

        payload = {
            "type": "batch",
            "buffer": buffer_name,
            "messages": messages,
            "stats": stats,
            "dropped": dropped,
            "ts": datetime.now(UTC).isoformat()
        }

        payload_json = json.dumps(payload)
        self.total_batches_sent += 1

        disconnected = []

        async with self.clients_lock:
            for websocket, client in self.clients.items():
                # Skip slow clients
                if client.pending_sends > self.slow_client_threshold:
                    client.dropped_count += len(messages)
                    logger.warning(f"[Broadcaster] Skipping slow client "
                                 f"(pending={client.pending_sends}, dropped={client.dropped_count})")
                    continue

                try:
                    client.pending_sends += 1
                    await websocket.send_text(payload_json)
                    client.pending_sends -= 1
                    client.last_send_time = time.time()
                    client.total_batches_sent += 1
                except Exception as e:
                    # Decrement pending_sends to maintain accurate count
                    client.pending_sends -= 1
                    logger.debug(f"[Broadcaster] Send error: {e}")
                    disconnected.append(websocket)

            # Remove disconnected clients
            for ws in disconnected:
                if ws in self.clients:
                    del self.clients[ws]

    def get_stats(self) -> dict:
        """Get broadcaster statistics."""
        return {
            "clients": len(self.clients),
            "flush_interval_sec": self.flush_interval,
            "max_batch_size": self.max_batch_size,
            "total_messages_queued": self.total_messages_queued,
            "total_messages_dropped": self.total_messages_dropped,
            "total_batches_sent": self.total_batches_sent,
            "pending_mqtt": len(self.pending.get("mqtt", [])),
            "pending_tak": len(self.pending.get("tak", [])),
            "pending_output": len(self.pending.get("output", []))
        }


# Global broadcaster instance
broadcaster = CoalescingBroadcaster()


class GatewayConfig(BaseModel):
    """Configuration update request."""
    mqtt_host: Optional[str] = None
    mqtt_port: Optional[int] = None
    mqtt_username: Optional[str] = None
    mqtt_password: Optional[str] = None
    mqtt_subscribe_topic: Optional[str] = None
    tak_host: Optional[str] = None
    tak_port: Optional[int] = None
    tak_cert_path: Optional[str] = None
    tak_ca_path: Optional[str] = None
    mesh_channel: Optional[str] = None
    gateway_uid: Optional[str] = None
    gateway_callsign: Optional[str] = None


class MQTTTestRequest(BaseModel):
    """MQTT connection test request."""
    host: str
    port: int = 1883
    username: Optional[str] = None
    password: Optional[str] = None
    timeout: int = 10


class ForwardingRequest(BaseModel):
    """Forwarding toggle request."""
    mesh2tak: Optional[bool] = None
    tak2mesh: Optional[bool] = None


class StatusResponse(BaseModel):
    """Gateway status response."""
    running: bool
    mqtt_connected: bool
    tak_connected: bool
    redis_connected: bool = False
    uptime_seconds: Optional[float] = None
    message_stats: dict
    forwarding: dict
    node_count: int = 0
    config_valid: bool = False
    config_errors: list[str] = []
    config_source: str = "unknown"


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: str
    websocket_connections: int = 0
    websocket_available: bool = True


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint - always responds if container is running.
    Includes WebSocket availability status.
    """
    logger.info(f"[health_check] Health check requested")
    try:
        response = HealthResponse(
            status="healthy",
            timestamp=datetime.now(UTC).isoformat(),
            websocket_connections=len(broadcaster.clients),
            websocket_available=True
        )
        logger.info(f"[health_check] Returning health response")
        return response
    except Exception as e:
        logger.error(f"[health_check] Error: {e}", exc_info=True)
        raise


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """
    Get gateway status including connection states, message counts, and forwarding state.
    """
    logger.info(f"[get_status] Status check requested")
    try:
        from config import config, forwarding
        from message_buffer import get_redis_client

        running = gateway_instance is not None and gateway_instance._running
        logger.debug(f"[get_status] Gateway running: {running}")

        mqtt_connected = False
        tak_connected = False

        if gateway_instance:
            if hasattr(gateway_instance, 'mqtt_client'):
                mqtt_connected = gateway_instance.mqtt_client._connected.is_set()
            if hasattr(gateway_instance, 'tak_client'):
                tak_connected = gateway_instance.tak_client.is_connected

        # Check Redis connectivity
        redis_connected = False
        try:
            redis_client = get_redis_client()
            redis_connected = redis_client.ping()
        except Exception as e:
            logger.warning(f"[get_status] Redis ping failed: {e}")

        uptime = None
        if gateway_start_time and running:
            uptime = (datetime.now(UTC) - gateway_start_time).total_seconds()

        # Get config validation status
        config_errors = config.validate()
        config_valid = len(config_errors) == 0
        config_source = getattr(config, '_config_source', 'unknown')

        response = StatusResponse(
            running=running,
            mqtt_connected=mqtt_connected,
            tak_connected=tak_connected,
            redis_connected=redis_connected,
            uptime_seconds=uptime,
            message_stats=get_combined_stats(),
            forwarding=forwarding.get_state(),
            node_count=node_store.get_node_count(),
            config_valid=config_valid,
            config_errors=config_errors,
            config_source=config_source
        )
        logger.info(f"[get_status] Returning status: running={running}, mqtt={mqtt_connected}, tak={tak_connected}, redis={redis_connected}")
        return response
    except Exception as e:
        logger.error(f"[get_status] Error: {e}", exc_info=True)
        raise


@app.get("/forwarding")
async def get_forwarding():
    """
    Get current forwarding toggle states.
    """
    from config import forwarding
    return forwarding.get_state()


@app.post("/forwarding")
async def set_forwarding(request: ForwardingRequest):
    """
    Set forwarding toggle states.
    """
    from config import forwarding

    state = forwarding.set_state(
        mesh2tak=request.mesh2tak,
        tak2mesh=request.tak2mesh
    )

    return {
        "status": "updated",
        "forwarding": state
    }


@app.post("/start")
async def start_gateway():
    """
    Start the gateway process.
    """
    global gateway_instance, gateway_start_time

    if gateway_instance and gateway_instance._running:
        return {"status": "already_running", "message": "Gateway is already running"}

    # Gateway will be started by main.py's background task
    # This endpoint signals the intent to start
    return {"status": "starting", "message": "Gateway start requested"}


@app.post("/stop")
async def stop_gateway():
    """
    Stop the gateway process.
    """
    global gateway_instance

    if not gateway_instance or not gateway_instance._running:
        return {"status": "not_running", "message": "Gateway is not running"}

    try:
        await gateway_instance.stop()
        return {"status": "stopped", "message": "Gateway stopped successfully"}
    except Exception as e:
        logger.error(f"Error stopping gateway: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/config")
async def update_config(config_update: GatewayConfig):
    """
    Update gateway configuration dynamically.
    Configuration is persisted to file for restart survival.
    Note: Some changes may require restart to take effect.
    """
    from config import config

    # Convert Pydantic model to dict, excluding None values
    update_data = {
        k: v for k, v in config_update.model_dump().items()
        if v is not None
    }

    # Update config and persist
    updated_fields = config.update_from_dict(update_data)

    return {
        "status": "updated",
        "updated_fields": updated_fields,
        "persisted": True,
        "message": "Configuration updated and saved. Restart gateway for changes to take effect."
    }


@app.post("/test/mqtt")
async def test_mqtt_connection(request: MQTTTestRequest):
    """
    Test MQTT broker connection with provided credentials.
    Returns success/failure and any error message.
    """
    import asyncio
    from gmqtt import Client as MQTTClient
    from gmqtt.mqtt.constants import MQTTv311

    result = {
        "success": False,
        "host": request.host,
        "port": request.port,
        "message": "",
        "error": None
    }

    client = None
    connected_event = asyncio.Event()

    def on_connect(client, flags, rc, properties):
        if rc == 0:
            connected_event.set()

    try:
        client = MQTTClient(client_id="takmesh-test")
        client.on_connect = on_connect

        if request.username:
            client.set_auth_credentials(request.username, request.password)

        # Try to connect with timeout
        await asyncio.wait_for(
            client.connect(request.host, request.port, version=MQTTv311),
            timeout=request.timeout
        )

        # Wait for connection confirmation
        try:
            await asyncio.wait_for(connected_event.wait(), timeout=5)
            result["success"] = True
            result["message"] = f"Successfully connected to {request.host}:{request.port}"
        except asyncio.TimeoutError:
            result["message"] = "Connection initiated but no confirmation received"
            result["error"] = "Connection confirmation timeout"

    except asyncio.TimeoutError:
        result["message"] = f"Connection to {request.host}:{request.port} timed out"
        result["error"] = "Connection timeout"
    except Exception as e:
        result["message"] = f"Failed to connect to {request.host}:{request.port}"
        result["error"] = str(e)
    finally:
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

    return result


def enrich_messages_with_output_status(messages: list[dict], buffer_name: str) -> list[dict]:
    """
    Enrich messages with output status information from output_buffer.
    Optimized to use batch lookup for better performance.
    
    Args:
        messages: List of message dictionaries
        buffer_name: Name of the buffer ("mqtt" or "tak")
        
    Returns:
        List of enriched message dictionaries
    """
    if buffer_name not in ["mqtt", "tak"]:
        return messages
    
    if not messages:
        return messages
    
    # Collect all correlation_ids that need enrichment
    correlation_ids = [msg.get("correlation_id") for msg in messages if msg.get("correlation_id")]
    
    # Batch fetch all outputs at once (much more efficient)
    outputs_by_correlation = {}
    if correlation_ids:
        outputs_by_correlation = output_buffer.get_outputs_by_correlation_ids(correlation_ids)
    
    # Enrich messages using the batch-fetched data
    enriched = []
    for msg in messages:
        correlation_id = msg.get("correlation_id")
        if correlation_id:
            output_msg = outputs_by_correlation.get(correlation_id)
            if output_msg:
                # Add output status fields
                msg["output_filtered"] = output_msg.get("filtered", False)
                msg["output_filtered_reason"] = output_msg.get("filtered_reason")
                msg["output_sent"] = output_msg.get("sent", False)
                msg["output_send_result"] = output_msg.get("send_result", "not_sent")
                msg["output_send_timestamp"] = output_msg.get("send_timestamp")
                msg["output_channel"] = output_msg.get("outbound_channel")
                msg["output_cot"] = output_msg.get("generated_cot")
                msg["output_cot_uid"] = output_msg.get("cot_uid")
                msg["output_cot_type"] = output_msg.get("cot_type")
                msg["output_cot_received"] = output_msg.get("cot_received")
                msg["output_cot_received_timestamp"] = output_msg.get("cot_received_timestamp")
                msg["output_cot_verification_method"] = output_msg.get("cot_verification_method")
            else:
                # No output found - set defaults
                msg["output_filtered"] = None
                msg["output_sent"] = None
                msg["output_cot_received"] = None
        enriched.append(msg)
    
    return enriched


@app.get("/messages/{buffer}")
async def get_messages(
    buffer: Literal["mqtt", "tak", "output"],
    limit: Optional[int] = None,
    msg_type: Optional[str] = None,
    filtered: Optional[bool] = None
):
    """
    Get buffered messages from a specific buffer.

    Args:
        buffer: Which buffer to query ("mqtt" for Mesh2TAK, "tak" for TAK2Mesh, "output" for generated outputs)
        limit: Maximum number of messages to return (None = all)
        msg_type: Filter by message type ("position", "text", "chat", etc.)
        filtered: For output buffer only - filter by filtered status (True/False)

    Returns:
        List of messages, newest first, with buffer stats
    """
    if buffer == "mqtt":
        target_buffer = mqtt_buffer
    elif buffer == "tak":
        target_buffer = tak_buffer
    else:
        target_buffer = output_buffer

    messages = target_buffer.get_messages(
        limit=limit,
        msg_type=msg_type
    )

    # Apply filtered filter for output buffer
    if buffer == "output" and filtered is not None:
        messages = [m for m in messages if m.get("filtered") == filtered]

    # Enrich mqtt and tak messages with output status
    if buffer in ["mqtt", "tak"]:
        messages = enrich_messages_with_output_status(messages, buffer)

    return {
        "buffer": buffer,
        "count": len(messages),
        "messages": messages,
        "stats": target_buffer.get_stats()
    }


@app.get("/messages/correlation/{correlation_id}")
async def get_correlated_messages(correlation_id: str):
    """
    Get linked input and output messages by correlation ID.

    Args:
        correlation_id: UUID linking input and output messages

    Returns:
        Input message (from mqtt or tak buffer) and corresponding output message
    """
    # Search mqtt buffer for input
    mqtt_messages = mqtt_buffer.get_messages()
    mqtt_input = next((m for m in mqtt_messages if m.get("correlation_id") == correlation_id), None)

    # Search tak buffer for input
    tak_messages = tak_buffer.get_messages()
    tak_input = next((m for m in tak_messages if m.get("correlation_id") == correlation_id), None)

    # Search output buffer
    output_messages = output_buffer.get_messages()
    output_msg = next((m for m in output_messages if m.get("correlation_id") == correlation_id), None)

    # Determine which input we found
    input_msg = mqtt_input or tak_input
    input_buffer = "mqtt" if mqtt_input else ("tak" if tak_input else None)

    if not input_msg and not output_msg:
        raise HTTPException(status_code=404, detail=f"No messages found with correlation_id: {correlation_id}")

    return {
        "correlation_id": correlation_id,
        "input_buffer": input_buffer,
        "input": input_msg,
        "output": output_msg
    }


async def verify_cot_message(correlation_id: str) -> dict:
    """
    Verify a COT message by correlation_id using available verification methods.
    
    Args:
        correlation_id: UUID linking input and output messages
        
    Returns:
        Dictionary with verification status and method used
    """
    # Get output message by correlation_id
    output_msg = output_buffer.get_output_for_correlation(correlation_id)
    if not output_msg:
        return {
            "verified": False,
            "error": f"No output message found with correlation_id: {correlation_id}",
            "method": None
        }
    
    # Check if already verified
    if output_msg.get("cot_received") is True:
        return {
            "verified": True,
            "already_verified": True,
            "method": output_msg.get("cot_verification_method", "unknown"),
            "timestamp": output_msg.get("cot_received_timestamp")
        }
    
    cot_uid = output_msg.get("cot_uid")
    if not cot_uid:
        return {
            "verified": False,
            "error": "No COT UID found in output message",
            "method": None
        }
    
    # Strategy 1: Check TAK buffer for matching UID (limit to recent messages for performance)
    # Fast path: Check for MeshMQTT-tagged messages first (our own messages)
    tak_messages = tak_buffer.get_messages(limit=200)
    for tak_msg in tak_messages:
        tak_uid = tak_msg.get("uid")
        # Fast check: If message has MeshMQTT tag and UID matches, it's definitely ours
        if tak_msg.get("mesh_mqtt", False) and tak_uid and (tak_uid == cot_uid or tak_uid.startswith(cot_uid)):
            # Found match in TAK buffer with MeshMQTT tag (fast verification)
            output_buffer.update_output_verification(
                correlation_id=correlation_id,
                cot_received=True,
                cot_verification_method="buffer_match_meshmqtt_tag"
            )
            return {
                "verified": True,
                "method": "buffer_match_meshmqtt_tag",
                "cot_uid": cot_uid,
                "matched_uid": tak_uid
            }
        # Standard check: UID match without tag
        elif tak_uid and (tak_uid == cot_uid or tak_uid.startswith(cot_uid)):
            # Found match in TAK buffer
            output_buffer.update_output_verification(
                correlation_id=correlation_id,
                cot_received=True,
                cot_verification_method="buffer_match"
            )
            return {
                "verified": True,
                "method": "buffer_match",
                "cot_uid": cot_uid,
                "matched_uid": tak_uid
            }
    
    # Strategy 2: Query TAK server CoT Query API (if available)
    # TODO: Implement CoT Query API integration when API endpoint is discovered
    # For now, return not verified
    return {
        "verified": False,
        "method": "buffer_match",
        "cot_uid": cot_uid,
        "message": "COT not found in TAK buffer. CoT Query API integration pending.",
        "error": "COT not found in TAK buffer"
    }


@app.post("/messages/verify/{correlation_id}")
async def verify_message(correlation_id: str):
    """
    Manually verify a COT message by correlation_id.
    
    Args:
        correlation_id: UUID linking input and output messages
        
    Returns:
        Verification status and method used
    """
    result = await verify_cot_message(correlation_id)
    return result


@app.delete("/messages/{buffer}")
async def clear_buffer(buffer: Literal["mqtt", "tak", "output"]):
    """
    Clear a specific message buffer and device timestamps.
    """
    if buffer == "mqtt":
        mqtt_buffer.clear()
        mqtt_buffer.clear_all_device_timestamps()
    elif buffer == "tak":
        tak_buffer.clear()
        tak_buffer.clear_all_device_timestamps()
    else:
        output_buffer.clear()

    return {"status": "cleared", "buffer": buffer, "message": f"Cleared {buffer} buffer"}


@app.delete("/messages")
async def clear_all_messages():
    """
    Clear all message buffers and device timestamps.
    """
    mqtt_buffer.clear()
    tak_buffer.clear()
    output_buffer.clear()
    mqtt_buffer.clear_all_device_timestamps()
    tak_buffer.clear_all_device_timestamps()
    return {"status": "cleared", "message": "All message buffers and device timestamps cleared"}


@app.delete("/cache")
async def clear_redis_cache():
    """
    Clear all Redis cache related to takmesh (buffers, timestamps, etc.).
    This will remove all stored messages and device tracking data.
    """
    import redis
    from message_buffer import get_redis_client

    try:
        r = get_redis_client()

        # Clear message buffers
        mqtt_buffer.clear()
        tak_buffer.clear()
        output_buffer.clear()

        # Clear device timestamps
        mqtt_buffer.clear_all_device_timestamps()
        tak_buffer.clear_all_device_timestamps()

        # Clear any other takmesh-related keys
        pattern = "takmesh:*"
        keys = list(r.scan_iter(match=pattern))
        if keys:
            r.delete(*keys)
            logger.info(f"Cleared {len(keys)} Redis keys matching '{pattern}'")

        return {
            "status": "cleared",
            "message": f"Cleared all takmesh Redis cache ({len(keys)} keys)",
            "keys_cleared": len(keys)
        }
    except Exception as e:
        logger.error(f"Error clearing Redis cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")


@app.get("/nodes")
async def get_nodes():
    """
    Get all known Meshtastic nodes from the persistent store.
    """
    nodes = node_store.get_all_nodes()
    return {
        "count": len(nodes),
        "nodes": nodes
    }


@app.get("/nodes/{node_id}")
async def get_node(node_id: str):
    """
    Get a specific node by ID.
    """
    from fastapi import HTTPException

    node = node_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    from dataclasses import asdict
    return asdict(node)


async def validate_django_session(session_key: str) -> tuple[bool, Optional[str]]:
    """
    Validate Django session by calling Django's validation endpoint.
    
    Args:
        session_key: Django session ID from cookie
        
    Returns:
        Tuple of (is_valid, user_id or None)
    """
    if not session_key:
        return False, None
    
    django_url = os.getenv("DJANGO_API_URL", "http://informs:8000")
    validation_url = f"{django_url}/takservers/api/validate-session/"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                validation_url,
                params={"sessionid": session_key}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    return True, data.get("user_id")
                else:
                    logger.warning(f"Session validation failed: {data.get('error', 'Unknown error')}")
                    return False, None
            else:
                logger.warning(f"Session validation endpoint returned {response.status_code}")
                return False, None
                
    except Exception as e:
        logger.error(f"Error validating Django session: {e}")
        # On error, allow connection but log it (fail open for reliability)
        # In production, you might want to fail closed
        return False, None


@app.websocket("/ws/messages")
async def websocket_messages(websocket: WebSocket):
    """
    WebSocket endpoint for real-time message streaming.
    Messages are batched and sent at fixed intervals (default 1 Hz).

    Message format from client:
    {
        "action": "subscribe" | "ping" | "get_messages" | "get_stats",
        "buffer": "mqtt" | "tak" | "output"
    }

    Message format to client (batched updates):
    {
        "type": "batch",
        "buffer": "mqtt" | "tak" | "output",
        "messages": [...],
        "stats": {...},
        "dropped": 0,
        "ts": "2026-01-14T12:00:00Z"
    }

    Authentication:
    - Validates Django session cookie before accepting connection
    - Calls Django's /takservers/api/validate-session/ endpoint
    - Rejects connection if session is invalid or user not authenticated
    """
    client_host = websocket.client.host if websocket.client else "unknown"
    client_port = websocket.client.port if websocket.client else "unknown"
    client_info = f"{client_host}:{client_port}"
    
    # Get session cookie
    cookies = websocket.cookies
    session_key = cookies.get("sessionid")
    
    # Validate Django session
    is_valid, user_id = await validate_django_session(session_key)
    
    if not is_valid:
        logger.warning(f"WebSocket connection rejected from {client_info}: Invalid or missing session")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication required")
        return
    
    logger.info(f"WebSocket connection accepted from {client_info}, user_id: {user_id}")

    try:
        await websocket.accept()
    except Exception as e:
        logger.error(f"WebSocket accept failed from {client_info}: {e}")
        raise

    # Register with broadcaster for batched updates
    await broadcaster.add_client(websocket)
    logger.info(f"WebSocket client connected from {client_info}")

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connected successfully",
            "flush_interval_sec": WS_FLUSH_INTERVAL_SEC
        })

        # Handle client messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)

                if data.get("action") == "ping":
                    await websocket.send_json({"type": "pong"})

                elif data.get("action") == "subscribe":
                    buffer = data.get("buffer", "both")
                    logger.info(f"WebSocket client {client_info} subscribed to: {buffer}")
                    await websocket.send_json({"type": "subscribed", "buffer": buffer})

                elif data.get("action") == "get_messages":
                    # Return current messages from buffer (initial load)
                    buffer = data.get("buffer", "mqtt")
                    limit = min(data.get("limit", 100), 500)

                    if buffer == "mqtt":
                        messages = mqtt_buffer.get_messages(limit=limit)
                        stats = mqtt_buffer.get_stats()
                    elif buffer == "tak":
                        messages = tak_buffer.get_messages(limit=limit)
                        stats = tak_buffer.get_stats()
                    elif buffer == "output":
                        messages = output_buffer.get_messages(limit=limit)
                        stats = output_buffer.get_stats()
                    else:
                        messages = []
                        stats = {}

                    # Enrich mqtt and tak messages with output status
                    if buffer in ["mqtt", "tak"]:
                        messages = enrich_messages_with_output_status(messages, buffer)

                    # Send as batch format for consistency
                    await websocket.send_json({
                        "type": "batch",
                        "buffer": buffer,
                        "messages": messages,
                        "stats": stats,
                        "dropped": 0,
                        "ts": datetime.now(UTC).isoformat()
                    })

                elif data.get("action") == "get_stats":
                    buffer = data.get("buffer", "mqtt")
                    if buffer == "mqtt":
                        stats = mqtt_buffer.get_stats()
                    elif buffer == "tak":
                        stats = tak_buffer.get_stats()
                    elif buffer == "output":
                        stats = output_buffer.get_stats()
                    else:
                        stats = {}

                    await websocket.send_json({
                        "type": "stats",
                        "buffer": buffer,
                        "stats": stats
                    })

            except asyncio.TimeoutError:
                # Send keep-alive ping
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from {client_info}")
    except Exception as e:
        logger.error(f"WebSocket error from {client_info}: {e}", exc_info=True)
    finally:
        await broadcaster.remove_client(websocket)
        logger.info(f"WebSocket client removed from {client_info}")


def queue_message_for_broadcast(buffer_name: str, message: dict, stats: dict = None):
    """
    Queue a message for batched broadcast to WebSocket clients.
    Called synchronously from message_buffer when a new message is added.
    Messages are coalesced and sent at fixed intervals by the broadcaster.
    """
    broadcaster.queue_message(buffer_name, message, stats or {})


def set_gateway_instance(gateway, start_time: datetime = None):
    """Set the gateway instance for API access."""
    global gateway_instance, gateway_start_time
    gateway_instance = gateway
    gateway_start_time = start_time or datetime.now(UTC)

    # Register the queue function (not async broadcast) with message buffer
    from message_buffer import set_websocket_broadcast_callback
    set_websocket_broadcast_callback(queue_message_for_broadcast)
