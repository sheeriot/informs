# WebSocket Architecture

## Overview

The Message Monitor uses WebSockets for real-time message streaming from the TAKMesh Gateway (FastAPI) to the browser. NGINX handles TLS termination and WebSocket protocol upgrade.

```
Browser (wss://) → NGINX (TLS + Upgrade) → FastAPI (ws://)
```

## Connection Flow

### 1. Browser Initiates Connection

```javascript
// mqttgateway-websocket.js
ws = new ReconnectingWebSocket(wsUrl);  // wss://your-domain.com/ws/messages
```

- Uses `wss://` (secure WebSocket) over HTTPS
- Browser includes Django session cookies automatically
- URL provided by Django template: `{{ websocket_url }}`

### 2. NGINX WebSocket Proxy

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

**Key settings:**
- `proxy_http_version 1.1` - Required for WebSocket upgrade (NGINX doesn't support HTTP/2 WebSocket proxying)
- `Upgrade` / `Connection` headers - Enable protocol switch from HTTP to WebSocket
- `proxy_buffering off` - Real-time streaming
- Extended timeouts - Support long-lived connections

### 3. FastAPI Authentication

```python
@app.websocket("/ws/messages")
async def websocket_messages(websocket: WebSocket):
    session_key = websocket.cookies.get("sessionid")
    is_valid, user_id = await validate_django_session(session_key)

    if not is_valid:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await websocket.accept()
```

- Validates Django session via `http://informs:8000/takservers/api/validate-session/`
- Rejects unauthenticated connections with close code 1008
- Logs user ID for audit

### 4. Message Protocol

**Client → Server:**
```json
{ "action": "subscribe", "buffer": "mqtt" }
{ "action": "get_messages", "buffer": "mqtt", "limit": 100 }
{ "action": "ping" }
```

**Server → Client (batched at 1Hz):**
```json
{
  "type": "batch",
  "buffer": "mqtt",
  "messages": [...],
  "stats": {...},
  "ts": "2026-01-14T12:00:00Z"
}
```

## NGINX `$connection_upgrade` Variable

NGINX uses a map directive to handle the Connection header:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

- WebSocket requests → `Connection: upgrade`
- Regular HTTP → `Connection: close`

## Client Library

**ReconnectingWebSocket** (via CDN, ~2KB):

```javascript
new ReconnectingWebSocket(wsUrl, [], {
    maxRetries: 10,
    connectionTimeout: 4000,
    maxReconnectionDelay: 10000,
    minReconnectionDelay: 1000,
    reconnectionDelayGrowFactor: 1.3
});
```

Falls back to native WebSocket if CDN fails.

## Performance Monitoring

```javascript
const stats = window.mqttgatewayWebSocket.getPerformanceStats();
// { messagesReceived, averageProcessingTime, slowMessages, reconnectCount, ... }
```

Console alerts:
- **Warning**: Processing >100ms
- **Error**: Processing >500ms (potential freeze)

## Troubleshooting

| Issue | Check |
|-------|-------|
| Connection fails | NGINX logs (`docker logs webhost`), FastAPI logs (`docker logs takmesh`) |
| Auth rejected | Django session valid? Check browser cookies |
| Browser freezes | DevTools Console for performance warnings, reduce message rate |
| Messages missing | WebSocket status badge, browser console errors |

## References

- [RFC 6455 - WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
- [NGINX WebSocket Proxying](https://nginx.org/en/docs/http/websocket.html)
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
- [ReconnectingWebSocket](https://github.com/pladaria/reconnecting-websocket)
