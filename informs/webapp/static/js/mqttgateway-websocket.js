/**
 * mqttgateway-websocket.js
 * WebSocket client - single connection, subscribed to both buffers
 * Caches messages locally, only fetches new ones on tab switch
 */

(function() {
    'use strict';

    const config = {
        debug: false,
        reconnectDelay: 3000,
        pingInterval: 30000
    };

    let ws = null;
    let reconnectTimer = null;
    let pingTimer = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;

    // Track last sequence/timestamp per buffer for incremental fetches
    const lastMessageId = { mqtt: null, tak: null };
    const hasInitialData = { mqtt: false, tak: false };

    /**
     * Get WebSocket URL from page data
     */
    function getWebSocketUrl() {
        const wsUrlElement = document.querySelector('[data-websocket-url]');
        if (wsUrlElement && wsUrlElement.dataset.websocketUrl) {
            return wsUrlElement.dataset.websocketUrl;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        return `${protocol}//${host}:8090/ws/messages`;
    }

    /**
     * Get active buffer from tab
     */
    function getActiveBuffer() {
        const activeTab = document.querySelector('.nav-link.active[data-bs-toggle="tab"]');
        if (activeTab && activeTab.dataset.buffer) {
            return activeTab.dataset.buffer;
        }
        return 'mqtt';
    }

    /**
     * Connect to WebSocket
     */
    function connect() {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            return;
        }

        const wsUrl = getWebSocketUrl();
        if (!wsUrl) {
            console.error('[WS] No WebSocket URL');
            return;
        }

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = function() {
                reconnectAttempts = 0;
                updateConnectionStatus(true);
                startPingTimer();

                // Subscribe to BOTH buffers (single connection)
                ws.send(JSON.stringify({ action: 'subscribe', buffer: 'mqtt' }));
                ws.send(JSON.stringify({ action: 'subscribe', buffer: 'tak' }));

                // Fetch initial data for active buffer
                const activeBuffer = getActiveBuffer();
                fetchMessages(activeBuffer);

                // Get stats for the other buffer (for tab badge)
                const otherBuffer = activeBuffer === 'mqtt' ? 'tak' : 'mqtt';
                ws.send(JSON.stringify({ action: 'get_stats', buffer: otherBuffer }));
            };

            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'ping') {
                        ws.send(JSON.stringify({ action: 'pong' }));
                        return;
                    }

                    if (data.type === 'pong') return;
                    if (data.type === 'subscribed') return;
                    if (data.type === 'unsubscribed') return;
                    if (data.type === 'connected') return;

                    // Initial/incremental data response
                    if (data.type === 'messages' && data.buffer) {
                        const messages = data.messages || [];

                        // Check for duplicates in the batch itself
                        const batchKeys = new Set();
                        messages.forEach(function(msg) {
                            const key = `${msg.timestamp || ''}:${msg.device_id || ''}`;
                            if (batchKeys.has(key)) {
                                console.warn('[WS] DUPLICATE in WebSocket batch:', {
                                    timestamp: msg.timestamp,
                                    device_id: msg.device_id,
                                    summary: msg.summary?.substring(0, 50),
                                    source: 'websocket_batch',
                                    buffer: data.buffer
                                });
                            }
                            batchKeys.add(key);
                        });

                        // Clear fetching flag
                        if (window._fetchingMessages) {
                            window._fetchingMessages[data.buffer] = false;
                        }

                        // Track that we have data for this buffer
                        if (messages.length > 0) {
                            hasInitialData[data.buffer] = true;
                            // Track newest message ID for incremental fetches (messages come newest first)
                            lastMessageId[data.buffer] = messages[0].id || messages[0].timestamp;
                        } else if (!hasInitialData[data.buffer]) {
                            hasInitialData[data.buffer] = true;
                        }

                        document.dispatchEvent(new CustomEvent('mqttgateway:initial-messages', {
                            detail: {
                                buffer: data.buffer,
                                messages: messages,
                                stats: data.stats,
                                incremental: data.incremental || false
                            }
                        }));
                        return;
                    }

                    // New real-time message (from subscription)
                    if (data.type === 'new_message' && data.buffer && data.message) {
                        // Update last message ID
                        lastMessageId[data.buffer] = data.message.id || data.message.timestamp;

                        document.dispatchEvent(new CustomEvent('mqttgateway:new-message', {
                            detail: { buffer: data.buffer, message: data.message, stats: data.stats }
                        }));
                        return;
                    }

                    // Stats update (for tab badge)
                    if (data.type === 'stats' && data.buffer) {
                        updateTabBadge(data.buffer, data.stats);
                        return;
                    }

                } catch (e) {
                    console.error('[WS] Parse error:', e);
                }
            };

            ws.onclose = function(event) {
                updateConnectionStatus(false);
                stopPingTimer();
                scheduleReconnect();
            };

            ws.onerror = function(error) {
                console.error('[WS] Error:', error);
            };

        } catch (e) {
            console.error('[WS] Connection error:', e);
            scheduleReconnect();
        }
    }

    /**
     * Fetch messages for a buffer (initial or incremental)
     */
    function fetchMessages(buffer) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        // Prevent duplicate fetches - if we're already fetching or just fetched, skip
        if (window._fetchingMessages && window._fetchingMessages[buffer]) {
            return;
        }

        if (!window._fetchingMessages) window._fetchingMessages = {};
        window._fetchingMessages[buffer] = true;

        const request = { action: 'get_messages', buffer: buffer, limit: 100 };

        // If we already have data, request only newer messages
        if (hasInitialData[buffer] && lastMessageId[buffer]) {
            request.since_id = lastMessageId[buffer];
            request.incremental = true;
        }

        ws.send(JSON.stringify(request));

        // Clear fetching flag after a short delay (messages should arrive quickly)
        setTimeout(function() {
            if (window._fetchingMessages) {
                window._fetchingMessages[buffer] = false;
            }
        }, 1000);
    }

    /**
     * Handle tab switch - fetch new messages if needed
     */
    function onTabSwitch(buffer) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        if (!hasInitialData[buffer]) {
            // First time viewing this tab - fetch all messages
            fetchMessages(buffer);
        } else if (lastMessageId[buffer]) {
            // Already have data - fetch only new messages since last seen
            fetchMessages(buffer);
        }
        // If we have data and no new messages needed, the cached display remains
    }

    /**
     * Update tab badge
     */
    function updateTabBadge(buffer, stats) {
        if (!stats) return;
        const tabId = buffer === 'mqtt' ? 'mesh2tak-tab' : 'tak2mesh-tab';
        const tab = document.getElementById(tabId);
        if (tab) {
            const badge = tab.querySelector('.badge');
            if (badge) badge.textContent = stats.buffer_size || 0;
        }
    }

    /**
     * Disconnect
     */
    function disconnect() {
        stopPingTimer();
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
        updateConnectionStatus(false);
    }

    /**
     * Schedule reconnect
     */
    function scheduleReconnect() {
        if (reconnectTimer) return;
        if (reconnectAttempts >= maxReconnectAttempts) {
            return;
        }

        reconnectAttempts++;
        const delay = Math.min(config.reconnectDelay * reconnectAttempts, 30000);

        reconnectTimer = setTimeout(function() {
            reconnectTimer = null;
            // Reset state on reconnect
            hasInitialData.mqtt = false;
            hasInitialData.tak = false;
            lastMessageId.mqtt = null;
            lastMessageId.tak = null;
            connect();
        }, delay);
    }

    /**
     * Start ping timer
     */
    function startPingTimer() {
        stopPingTimer();
        pingTimer = setInterval(function() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'ping' }));
            }
        }, config.pingInterval);
    }

    /**
     * Stop ping timer
     */
    function stopPingTimer() {
        if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
        }
    }

    /**
     * Update connection status UI
     */
    function updateConnectionStatus(connected) {
        const statusEl = document.getElementById('websocket-status');
        if (statusEl) {
            if (connected) {
                statusEl.className = 'badge bg-success';
                statusEl.innerHTML = '<i class="bi bi-wifi"></i> Live';
            } else {
                statusEl.className = 'badge bg-secondary';
                statusEl.innerHTML = '<i class="bi bi-wifi-off"></i> Offline';
            }
        }
    }

    /**
     * Initialize tab change listener
     */
    function initTabListener() {
        document.querySelectorAll('[data-bs-toggle="tab"][data-buffer]').forEach(function(tab) {
            tab.addEventListener('shown.bs.tab', function(event) {
                const buffer = event.target.dataset.buffer;
                if (buffer) {
                    onTabSwitch(buffer);
                }
            });
        });
    }

    /**
     * Initialize
     */
    function init() {
        initTabListener();
        connect();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    window.mqttgatewayWebSocket = {
        connect: connect,
        disconnect: disconnect,
        fetchMessages: fetchMessages,
        isConnected: function() { return ws && ws.readyState === WebSocket.OPEN; },
        hasData: function(buffer) { return hasInitialData[buffer]; }
    };

})();
