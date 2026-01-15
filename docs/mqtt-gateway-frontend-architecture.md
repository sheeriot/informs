# MQTT Gateway Frontend Architecture

## Overview

The MQTT Gateway detail page uses **two different technologies** for different purposes:

1. **HTMX** - For periodic status updates and form submissions
2. **WebSocket** - For real-time message streaming

## Technology Stack

### HTMX (Frontend JavaScript Library)

**Purpose:** Status polling and form submissions

**Loaded:** Via CDN in Django templates (`base.html`)
```html
<script src="https://unpkg.com/htmx.org@2.0.4"></script>
```

**Usage:**
- Status badge polling (every 30s): `hx-get` with `hx-trigger="every 30s"`
- Button actions (sync, test, toggle): `hx-post` with `hx-target` and `hx-swap`
- Form submissions without full page reload

**Why HTMX:**
- Simple declarative syntax in HTML
- Good for periodic polling (status updates)
- Handles CSRF tokens automatically
- Works well with Django views

**NOT in `takmesh_gateway/requirements.txt`:**
- HTMX is a **JavaScript library** loaded in the browser
- `takmesh_gateway` is a **Python/FastAPI backend**
- No Python dependency needed

### WebSocket (Real-Time Streaming)

**Purpose:** Real-time message streaming from gateway

**Library:** ReconnectingWebSocket (via CDN)
```html
<script src="https://cdn.jsdelivr.net/npm/reconnecting-websocket@4.4.0/dist/reconnecting-websocket.min.js"></script>
```

**Usage:**
- Live message updates (MQTT and TAK buffers)
- Batched updates at 1Hz
- Automatic reconnection on disconnect

**Why WebSocket:**
- Real-time bidirectional communication
- Lower latency than HTTP polling
- Efficient for high-frequency updates
- Persistent connection

**Backend:** FastAPI WebSocket endpoint (`takmesh_gateway/app/api.py`)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Django Page)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────────┐     │
│  │   HTMX (CDN)     │         │ ReconnectingWebSocket │     │
│  │                  │         │      (CDN)           │     │
│  └────────┬─────────┘         └──────────┬───────────┘     │
│           │                               │                 │
│           │ HTTP GET/POST                 │ WebSocket       │
│           │ (every 30s)                   │ (persistent)    │
│           │                               │                 │
└───────────┼───────────────────────────────┼─────────────────┘
            │                               │
            │                               │
┌───────────▼───────────────────────────────▼─────────────────┐
│                    NGINX (Reverse Proxy)                     │
│  - Routes /takservers/* → Django (HTMX)                      │
│  - Routes /ws/* → FastAPI (WebSocket)                        │
└───────────┬───────────────────────────────┬─────────────────┘
            │                               │
            │                               │
┌───────────▼──────────┐      ┌────────────▼──────────────┐
│   Django (informs)   │      │  FastAPI (takmesh)        │
│                      │      │                           │
│  - Status views      │      │  - WebSocket endpoint     │
│  - Form handlers     │      │  - Message broadcasting    │
│  - HTMX responses    │      │  - Real-time streaming    │
└──────────────────────┘      └───────────────────────────┘
```

## When to Use Each Technology

### Use HTMX For:
- ✅ Periodic status updates (every 30s is fine)
- ✅ Form submissions (sync, test buttons)
- ✅ Simple CRUD operations
- ✅ Content that doesn't need real-time updates

### Use WebSocket For:
- ✅ Real-time message streaming
- ✅ High-frequency updates (multiple messages per second)
- ✅ Bidirectional communication
- ✅ Live data that needs immediate display

## Current Implementation

### Status Updates (HTMX)
```html
<div id="gateway-status-badges"
     hx-get="{% url 'mqttgateway_status' pk=gateway.pk %}"
     hx-trigger="load, every 30s"
     hx-swap="none">
```

**Frequency:** Every 30 seconds  
**Data:** Gateway connection status, message counts  
**Why HTMX:** Status doesn't change frequently, polling is sufficient

### Message Streaming (WebSocket)
```javascript
ws = new ReconnectingWebSocket(wsUrl, [], {
    maxRetries: 10,
    connectionTimeout: 4000,
    // ...
});
```

**Frequency:** Real-time (batched at 1Hz)  
**Data:** Individual messages from MQTT/TAK buffers  
**Why WebSocket:** Messages arrive frequently, need immediate display

## Dependencies

### Frontend (Browser)
- **HTMX**: Loaded via CDN (no npm/bundler needed)
- **ReconnectingWebSocket**: Loaded via CDN
- **Bootstrap 5**: Already in Django templates

### Backend (Python)
- **Django**: `django-htmx` package (for `request.htmx` detection)
- **FastAPI**: WebSocket support built-in
- **No HTMX Python package needed** (it's JavaScript)

## Why Not Replace HTMX with WebSocket?

**Status polling with HTMX is fine because:**
1. Status updates are infrequent (every 30s is sufficient)
2. Simpler implementation (declarative HTML)
3. Less overhead (HTTP request vs persistent connection)
4. Works well with Django's authentication/CSRF

**WebSocket is better for messages because:**
1. Messages arrive frequently (multiple per second)
2. Need immediate display (low latency)
3. Bidirectional (can send commands)
4. More efficient for high-frequency updates

## Conclusion

**HTMX is the right choice** for status polling and form submissions.  
**WebSocket is the right choice** for real-time message streaming.

They complement each other and serve different purposes. No changes needed to `takmesh_gateway/requirements.txt` - HTMX is a frontend library, not a Python dependency.
