# TAKMesh Gateway

Bidirectional protocol gateway between Meshtastic mesh network (via MQTT) and TAK server (via TLS), with a REST API for Django integration.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Django Web App                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ MQTTGateway     │  │  HTMX Views     │  │  Bootstrap5     │              │
│  │ Model (Config)  │  │  (CRUD/Test)    │  │  Templates      │              │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘              │
│           │                    │                                             │
└───────────┼────────────────────┼─────────────────────────────────────────────┘
            │                    │
            │    REST API        │  GET /status, GET /messages
            │    (port 8089)     │  POST /test/mqtt, POST /config
            ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TAKMesh Container                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  FastAPI REST   │  │ Message Buffer  │  │  Gateway Logic  │              │
│  │  API (:8090)    │──│ (last 100 msgs) │──│  (async)        │              │
│  └─────────────────┘  └─────────────────┘  └────────┬────────┘              │
│                                                      │                       │
│  ┌─────────────────┐                    ┌───────────┴───────────┐           │
│  │ Async MQTT      │◄───────────────────│                       │           │
│  │ Client (gmqtt)  │                    │                       │           │
│  └────────┬────────┘                    │                       │           │
│           │                             │                       │           │
│           │                    ┌────────┴────────┐              │           │
│           │                    │  TAK TLS Client │              │           │
│           │                    │  (pytak)        │              │           │
│           │                    └────────┬────────┘              │           │
└───────────┼─────────────────────────────┼───────────────────────────────────┘
            │                             │
            ▼                             ▼
┌─────────────────┐              ┌─────────────────┐
│   MQTT Broker   │              │   TAK Server    │
│   (mosquitto)   │              │   (TLS:8089)    │
└────────┬────────┘              └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Meshtastic    │
│   Mesh Network  │
└─────────────────┘
```

## Key Design Decision

**Django never connects to MQTT directly.** All MQTT operations go through the TAKMesh container's REST API. This ensures:

- Single source of truth for MQTT state
- Message buffer lives in the always-running gateway
- No duplicate MQTT connections
- Django stays stateless/request-response
- Building inspection features = building gateway features

## Quick Setup

### 1. Configure Environment

```bash
cd /opt/docker/informs/takmesh_gateway
cp env/takmesh.env.sample env/takmesh.env
nano env/takmesh.env
```

### 2. Required Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MQTT_HOST` | Yes | MQTT broker hostname | `mosquitto` |
| `MQTT_PORT` | No | MQTT port (default: 1883) | `1883` |
| `TAK_HOST` | Yes | TAK server hostname | `tak.example.com` |
| `TAK_PORT` | No | TAK streaming port (default: 8089) | `8089` |
| `TAK_CERT_PATH` | Yes | Path to client certificate | `/opt/app/certs/client.pem` |
| `TAK_CA_PATH` | Yes | Path to CA certificate | `/opt/app/certs/truststore.pem` |
| `MESH_CHANNEL` | No | Channel filter (default: takmesh) | `takmesh` |
| `GATEWAY_UID` | No | Gateway CoT identity | `takmesh-gateway` |
| `DEBUG` | No | Enable debug logging | `false` |

### 3. Certificate Setup

The gateway uses the same TAK certificates as the informs app. They're mounted from the shared `certs` volume:

```bash
# Certificates should already exist if informs CoT is working
ls /path/to/certs/
# Expected: client.pem, truststore.pem (or similar names)
```

### 4. Build and Run

```bash
cd /opt/docker/informs
docker compose build takmesh
docker compose up -d takmesh
```

### 5. Verify

```bash
# Check logs
docker compose logs -f takmesh

# Expected output:
# Takmesh Gateway with REST API
# API available at http://0.0.0.0:8090
# Connected to MQTT broker mosquitto:1883
# Subscribed to msh/2/json/+/takmesh/#
# Connected to TAK server tak.example.com:8089
```

## REST API Reference

The gateway exposes a REST API on port 8090 for Django integration.

### Health Check

```
GET /health
```

Always responds if container is running.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000000"
}
```

### Gateway Status

```
GET /status
```

Get gateway status including connection states and message counts.

**Response:**
```json
{
  "running": true,
  "mqtt_connected": true,
  "tak_connected": true,
  "uptime_seconds": 3600.5,
  "message_stats": {
    "buffer_size": 45,
    "buffer_max": 100,
    "total_mqtt_messages": 1234,
    "total_tak_messages": 567
  }
}
```

### Test MQTT Connection

```
POST /test/mqtt
```

Test MQTT broker connection with provided credentials.

**Request:**
```json
{
  "host": "mosquitto",
  "port": 1883,
  "username": "user",
  "password": "pass",
  "timeout": 10
}
```

**Response:**
```json
{
  "success": true,
  "host": "mosquitto",
  "port": 1883,
  "message": "Successfully connected to mosquitto:1883",
  "error": null
}
```

### Get Buffered Messages

```
GET /messages?limit=50&source=mqtt&msg_type=position
```

Get recent messages from the buffer.

**Query Parameters:**
- `limit` (int): Maximum messages to return (default: 50, max: 100)
- `source` (string): Filter by source ("mqtt" or "tak")
- `msg_type` (string): Filter by type ("position", "text", "chat")

**Response:**
```json
{
  "count": 10,
  "messages": [
    {
      "timestamp": "2024-01-15T10:30:00.000000",
      "source": "mqtt",
      "msg_type": "position",
      "topic": "msh/2/json/gateway1/takmesh/position",
      "payload": {...},
      "summary": "Position from MESH-ABC"
    }
  ],
  "stats": {
    "buffer_size": 45,
    "buffer_max": 100,
    "total_mqtt_messages": 1234,
    "total_tak_messages": 567
  }
}
```

### Update Configuration

```
POST /config
```

Update gateway configuration dynamically (requires restart for some changes).

**Request:**
```json
{
  "mqtt_host": "new-broker.example.com",
  "mqtt_port": 1883,
  "mesh_channel": "newchannel"
}
```

### Start/Stop Gateway

```
POST /start
POST /stop
```

Control the gateway process.

## WebSocket API

The gateway provides a WebSocket endpoint for real-time message streaming to the browser.

### WebSocket Endpoint

```
WS /ws/messages
```

Connect to receive real-time message updates as they flow through the gateway.

**Connection URL (through nginx):**
```
wss://your-domain.com/ws/messages
```

**Note:** The WebSocket is proxied through nginx at `/ws/` to the gateway's port 8090. This allows secure WSS connections through the same domain as the web application.

### Message Format

**From Server to Client:**
```json
{
  "type": "message",
  "buffer": "mqtt",
  "message": {
    "timestamp": "2024-01-15T10:30:00.000000",
    "source": "mqtt",
    "msg_type": "position",
    "summary": "Position from MESH-ABC",
    "payload": {...}
  },
  "stats": {
    "buffer_size": 45,
    "buffer_max": 1000
  }
}
```

**From Client to Server:**
```json
{
  "action": "subscribe",
  "buffer": "mqtt"
}
```

```json
{
  "action": "ping"
}
```

### WebSocket Features

- **Real-time Updates**: Messages appear instantly without page refresh
- **Pause/Resume**: Pause message stream to review, resume to catch up
- **Search**: Filter messages by callsign, type, or content
- **Auto-reconnect**: Automatic reconnection with exponential backoff
- **Compression**: permessage-deflate compression (70-90% reduction for JSON)

### WebSocket Compression

WebSocket compression uses the permessage-deflate extension (RFC 7692):

- **Enabled by default** in Uvicorn (no configuration needed)
- **Negotiated automatically** during WebSocket handshake
- **Very effective** for JSON/ASCII payloads (typically 70-90% compression)
- **Nginx is transparent** - compression happens end-to-end between browser and FastAPI

To verify compression is active, check the browser DevTools Network tab for `Sec-WebSocket-Extensions: permessage-deflate` in the WebSocket handshake response.

### Nginx Configuration

WebSocket connections require nginx to proxy with proper upgrade headers. The `nginx_informs.conf` template includes:

```nginx
location /ws/ {
    proxy_pass http://takmesh:8090/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

## Message Buffer

The gateway maintains a circular buffer of the last 100 messages from both MQTT and TAK sources. This buffer:

- Stores messages with timestamps and metadata
- Allows filtering by source (mqtt/tak) and type (position/text/chat)
- Is queried by Django for the message preview UI
- Persists only in memory (cleared on restart)

## Django Integration

The Django app manages MQTT Gateway configurations through the `MQTTGateway` model:

- **Name**: Unique identifier (slug)
- **TAK Server**: Foreign key to TakServer model
- **MQTT Settings**: Host, port, username, password
- **Meshtastic Settings**: Channel name
- **Gateway Identity**: UID and callsign for TAK

Access via the user dropdown menu: **Configuration > MQTT Gateways**

### Configuration Methods

1. **Django UI** (recommended): Create/edit gateways through the web interface
2. **Environment file**: Set defaults in `takmesh.env` for initial configuration

The Django UI provides:
- CRUD operations for gateway configurations
- Connection testing (via REST API)
- Live message preview (via REST API)
- Gateway status monitoring

## How It Works

### Meshtastic → TAK

1. Meshtastic nodes send position/text via radio
2. A Meshtastic gateway node publishes to MQTT broker as JSON
3. TAKMesh Gateway subscribes to `msh/2/json/+/takmesh/#`
4. Messages are buffered for inspection
5. Positions become CoT markers (type `a-f-G-U-C`)
6. Text messages become CoT chat messages
7. CoT sent to TAK server via TLS on port 8089

### TAK → Meshtastic

1. TAK users send chat messages
2. TAKMesh Gateway receives CoT from TAK server
3. Messages are buffered for inspection
4. Chat messages are published to MQTT
5. Meshtastic gateway node transmits to mesh network

## Meshtastic Configuration

Your Meshtastic device/gateway needs:

1. **MQTT enabled** with JSON output
2. **Channel named `takmesh`** (or whatever you set in `MESH_CHANNEL`)
3. **Connected to your MQTT broker**

Example Meshtastic MQTT settings:
- MQTT Server: `your-mqtt-broker.com`
- MQTT Username/Password: (if required)
- JSON Output: Enabled
- Root Topic: `msh` (default)

## Troubleshooting

### Gateway service unavailable in Django

1. Check if takmesh container is running: `docker compose ps takmesh`
2. Check container logs: `docker compose logs takmesh`
3. Verify network connectivity: containers must be on same Docker network

### No messages appearing in TAK

1. Check MQTT connection: `docker compose logs takmesh | grep MQTT`
2. Verify Meshtastic is publishing: Use MQTT Explorer to check `msh/2/json/#`
3. Check TAK connection: `docker compose logs takmesh | grep TAK`
4. Enable debug: Set `DEBUG=true` in env file

### Certificate errors

1. Verify cert paths match your actual files
2. Check cert permissions: `ls -la /path/to/certs/`
3. Ensure certs are valid for your TAK server

### Messages not reaching Meshtastic

1. Check MQTT publish permissions
2. Verify Meshtastic gateway is subscribed to correct topics
3. Check channel name matches on both sides

### Connection test fails but gateway works

The test creates a separate connection - if the broker limits connections, the test may fail while the gateway's persistent connection works fine.

## Docker Compose

The takmesh service is configured in `docker-compose.yml`:

```yaml
takmesh:
  build:
    context: ./takmesh_gateway
  image: takmesh-gateway
  env_file:
    - takmesh_gateway/env/takmesh.env
  restart: unless-stopped
  expose:
    - "8090"  # REST API (internal network only)
  volumes:
    - certs:/opt/app/certs:ro
  depends_on:
    - informs
  healthcheck:
    test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8090/health')"]
    interval: 30s
    timeout: 10s
    retries: 3
```

Note: Port 8090 is exposed only to the Docker network, not to the host. Django accesses it via `http://takmesh:8090`.
