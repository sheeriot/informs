"""
FastAPI REST API for TAKMesh Gateway.
Provides endpoints for Django to control and inspect the gateway.
"""
import asyncio
import json
import logging
from datetime import datetime, UTC
from typing import Optional, Literal, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from message_buffer import mqtt_buffer, tak_buffer, get_combined_stats
from node_store import node_store

logger = logging.getLogger(__name__)

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
    """Log API and WebSocket endpoint availability on startup."""
    logger.info("=" * 60)
    logger.info("TAKMesh Gateway API Ready")
    logger.info("REST API endpoints available at /health, /status, /messages, etc.")
    logger.info("WebSocket endpoint available at /ws/messages")
    logger.info("  - Real-time message streaming")
    logger.info("  - Compression: permessage-deflate (enabled by default)")
    logger.info("=" * 60)
    # Note: WebSocket compression (permessage-deflate) is enabled by default in Uvicorn.
    # To explicitly configure, add to uvicorn.Config():
    #   ws_per_message_deflate=True  # default
    # Compression is very effective for JSON/ASCII payloads (70-90% reduction)


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

# WebSocket connection management
active_websockets: Set[WebSocket] = set()
websocket_lock = asyncio.Lock()


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
            websocket_connections=len(active_websockets),
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

        running = gateway_instance is not None and gateway_instance._running
        logger.debug(f"[get_status] Gateway running: {running}")

        mqtt_connected = False
        tak_connected = False

        if gateway_instance:
            if hasattr(gateway_instance, 'mqtt_client'):
                mqtt_connected = gateway_instance.mqtt_client._connected.is_set()
            if hasattr(gateway_instance, 'tak_client'):
                tak_connected = gateway_instance.tak_client.is_connected

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
            uptime_seconds=uptime,
            message_stats=get_combined_stats(),
            forwarding=forwarding.get_state(),
            node_count=node_store.get_node_count(),
            config_valid=config_valid,
            config_errors=config_errors,
            config_source=config_source
        )
        logger.info(f"[get_status] Returning status: running={running}, mqtt={mqtt_connected}, tak={tak_connected}")
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


@app.get("/messages/{buffer}")
async def get_messages(
    buffer: Literal["mqtt", "tak"],
    limit: Optional[int] = None,
    msg_type: Optional[str] = None
):
    """
    Get buffered messages from a specific buffer.

    Args:
        buffer: Which buffer to query ("mqtt" for Mesh2TAK, "tak" for TAK2Mesh)
        limit: Maximum number of messages to return (None = all)
        msg_type: Filter by message type ("position", "text", "chat", etc.)

    Returns:
        List of messages, newest first, with buffer stats
    """
    if buffer == "mqtt":
        target_buffer = mqtt_buffer
    else:
        target_buffer = tak_buffer

    messages = target_buffer.get_messages(
        limit=limit,
        msg_type=msg_type
    )

    return {
        "buffer": buffer,
        "count": len(messages),
        "messages": messages,
        "stats": target_buffer.get_stats()
    }


@app.delete("/messages/{buffer}")
async def clear_buffer(buffer: Literal["mqtt", "tak"]):
    """
    Clear a specific message buffer and device timestamps.
    """
    if buffer == "mqtt":
        mqtt_buffer.clear()
        mqtt_buffer.clear_all_device_timestamps()
    else:
        tak_buffer.clear()
        tak_buffer.clear_all_device_timestamps()

    return {"status": "cleared", "buffer": buffer, "message": f"Cleared {buffer} buffer and device timestamps"}


@app.delete("/messages")
async def clear_all_messages():
    """
    Clear both message buffers and all device timestamps.
    """
    mqtt_buffer.clear()
    tak_buffer.clear()
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


@app.websocket("/ws/messages")
async def websocket_messages(websocket: WebSocket):
    """
    WebSocket endpoint for real-time message streaming.
    Clients can subscribe to specific buffers and receive new messages as they arrive.

    Message format from client:
    {
        "action": "subscribe",
        "buffer": "mqtt" | "tak" | "both",
        "filter": {
            "msg_type": "position" | "text" | "chat" | null,
            "search": "search term" | null
        }
    }

    Message format to client:
    {
        "type": "message" | "stats" | "error",
        "buffer": "mqtt" | "tak",
        "message": {...} | null,
        "stats": {...} | null,
        "error": "error message" | null
    }
    """
    # Log connection attempt with client info
    client_host = websocket.client.host if websocket.client else "unknown"
    client_port = websocket.client.port if websocket.client else "unknown"
    client_info = f"{client_host}:{client_port}"
    logger.info(f"WebSocket connection attempt from {client_info}")

    try:
        await websocket.accept()
    except Exception as e:
        logger.error(f"WebSocket accept failed from {client_info}: {e}")
        raise

    async with websocket_lock:
        active_websockets.add(websocket)

    logger.info(f"WebSocket client connected from {client_info}. Total connections: {len(active_websockets)}")

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connected successfully"
        })

        # Handle client messages (subscriptions, filters, etc.)
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
                logger.info(f"WebSocket received from {client_info}: {data.get('action', 'unknown')}")

                if data.get("action") == "ping":
                    # Keep-alive ping
                    await websocket.send_json({"type": "pong"})
                elif data.get("action") == "subscribe":
                    # Client subscription (can be used for future filtering)
                    buffer = data.get("buffer", "both")
                    logger.info(f"WebSocket client {client_info} subscribed to buffer: {buffer}")
                    await websocket.send_json({
                        "type": "subscribed",
                        "buffer": buffer
                    })
                elif data.get("action") == "unsubscribe":
                    buffer = data.get("buffer", "both")
                    logger.info(f"WebSocket client {client_info} unsubscribed from buffer: {buffer}")
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "buffer": buffer
                    })
                elif data.get("action") == "get_messages":
                    # Return current messages from buffer
                    buffer = data.get("buffer", "mqtt")
                    limit = min(data.get("limit", 100), 500)
                    since_id = data.get("since_id")  # timestamp or ID to fetch messages after
                    incremental = data.get("incremental", False)

                    if buffer == "mqtt":
                        messages = mqtt_buffer.get_messages(limit=limit, since_id=since_id)
                        stats = mqtt_buffer.get_stats()
                    elif buffer == "tak":
                        messages = tak_buffer.get_messages(limit=limit, since_id=since_id)
                        stats = tak_buffer.get_stats()
                    else:
                        messages = []
                        stats = {}

                    logger.info(f"Sending {len(messages)} messages to {client_info} (since_id={since_id})")
                    await websocket.send_json({
                        "type": "messages",
                        "buffer": buffer,
                        "messages": messages,
                        "stats": stats,
                        "incremental": incremental
                    })
                elif data.get("action") == "get_stats":
                    # Return just stats for a buffer (for tab badge)
                    buffer = data.get("buffer", "mqtt")
                    if buffer == "mqtt":
                        stats = mqtt_buffer.get_stats()
                    elif buffer == "tak":
                        stats = tak_buffer.get_stats()
                    else:
                        stats = {}

                    await websocket.send_json({
                        "type": "stats",
                        "buffer": buffer,
                        "stats": stats
                    })

            except asyncio.TimeoutError:
                # Send keep-alive ping to client
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break  # Connection lost

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from {client_info}")
    except Exception as e:
        logger.error(f"WebSocket error from {client_info}: {e}", exc_info=True)
    finally:
        async with websocket_lock:
            active_websockets.discard(websocket)
        logger.info(f"WebSocket client removed from {client_info}. Total connections: {len(active_websockets)}")


async def broadcast_message(buffer_name: str, message: dict, stats: dict = None):
    """
    Broadcast a new message to all connected WebSocket clients.
    Called when a new message is added to a buffer.
    """
    if not active_websockets:
        return

    payload = {
        "type": "new_message",
        "buffer": buffer_name,
        "message": message,
        "timestamp": datetime.now(UTC).isoformat()
    }

    if stats:
        payload["stats"] = stats

    message_json = json.dumps(payload)
    disconnected = set()

    async with websocket_lock:
        for ws in active_websockets:
            try:
                await ws.send_text(message_json)
            except Exception as e:
                logger.debug(f"Error sending to WebSocket client: {e}")
                disconnected.add(ws)

        # Remove disconnected clients
        for ws in disconnected:
            active_websockets.discard(ws)


def set_gateway_instance(gateway, start_time: datetime = None):
    """Set the gateway instance for API access."""
    global gateway_instance, gateway_start_time
    gateway_instance = gateway
    gateway_start_time = start_time or datetime.now(UTC)

    # Register WebSocket broadcast callback with message buffer
    from message_buffer import set_websocket_broadcast_callback
    set_websocket_broadcast_callback(broadcast_message)
