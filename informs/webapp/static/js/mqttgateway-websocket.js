/**
 * mqttgateway-websocket.js
 * WebSocket client for batched message updates.
 * Server sends batched updates at fixed intervals (default 1 Hz).
 */

(function() {
    'use strict';

    const config = {
        debug: false,
        reconnectDelay: 3000,
        pingInterval: 30000,
        performanceMonitoring: true,  // Enable performance monitoring
        performanceAlertThreshold: 100  // Alert if message processing takes >100ms
    };

    let ws = null;
    let reconnectTimer = null;
    let pingTimer = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;

    // Track initial data state per buffer
    const hasInitialData = { mqtt: false, tak: false };

    // Performance monitoring
    const perfStats = {
        messagesReceived: 0,
        messagesProcessed: 0,
        totalProcessingTime: 0,
        maxProcessingTime: 0,
        slowMessages: [],
        lastMessageTime: null,
        connectionStartTime: null,
        reconnectCount: 0
    };

    /**
     * Log performance metrics
     */
    function logPerformance(operation, duration, details) {
        if (!config.performanceMonitoring) return;

        if (duration > config.performanceAlertThreshold) {
            console.warn(`[WS Perf] SLOW: ${operation} took ${duration.toFixed(2)}ms`, details);
            perfStats.slowMessages.push({
                operation,
                duration,
                timestamp: new Date().toISOString(),
                details
            });
            // Keep only last 10 slow messages
            if (perfStats.slowMessages.length > 10) {
                perfStats.slowMessages.shift();
            }
        } else if (config.debug) {
            console.log(`[WS Perf] ${operation}: ${duration.toFixed(2)}ms`);
        }

        perfStats.totalProcessingTime += duration;
        if (duration > perfStats.maxProcessingTime) {
            perfStats.maxProcessingTime = duration;
        }
    }

    /**
     * Get performance statistics
     */
    function getPerformanceStats() {
        const avgTime = perfStats.messagesProcessed > 0 
            ? perfStats.totalProcessingTime / perfStats.messagesProcessed 
            : 0;
        return {
            messagesReceived: perfStats.messagesReceived,
            messagesProcessed: perfStats.messagesProcessed,
            averageProcessingTime: avgTime.toFixed(2) + 'ms',
            maxProcessingTime: perfStats.maxProcessingTime.toFixed(2) + 'ms',
            slowMessages: perfStats.slowMessages.length,
            uptime: perfStats.connectionStartTime 
                ? Date.now() - perfStats.connectionStartTime 
                : 0,
            reconnectCount: perfStats.reconnectCount
        };
    }

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
        // Check connection state (works for both native and ReconnectingWebSocket)
        if (ws) {
            const readyState = ws.readyState !== undefined ? ws.readyState : (ws._ws ? ws._ws.readyState : WebSocket.CLOSED);
            if (readyState === WebSocket.CONNECTING || readyState === WebSocket.OPEN) {
                return;
            }
        }

        const wsUrl = getWebSocketUrl();
        if (!wsUrl) {
            if (config.debug) console.error('[WS] No WebSocket URL');
            return;
        }

        try {
            // Use ReconnectingWebSocket for automatic reconnection
            // Falls back to native WebSocket if library not loaded
            const WebSocketClass = typeof ReconnectingWebSocket !== 'undefined' 
                ? ReconnectingWebSocket 
                : WebSocket;
            
            // Configure ReconnectingWebSocket options if available
            if (typeof ReconnectingWebSocket !== 'undefined') {
                ws = new ReconnectingWebSocket(wsUrl, [], {
                    maxRetries: maxReconnectAttempts,
                    connectionTimeout: 4000,
                    maxReconnectionDelay: 10000,
                    minReconnectionDelay: 1000,
                    reconnectionDelayGrowFactor: 1.3,
                    debug: config.debug
                });
            } else {
                // Fallback to native WebSocket
                ws = new WebSocket(wsUrl);
            }

            // Handle connection open (works for both native and ReconnectingWebSocket)
            const onOpenHandler = function() {
                const startTime = performance.now();
                // Track reconnection if this wasn't the first connection
                if (reconnectAttempts > 0) {
                    perfStats.reconnectCount++;
                }
                reconnectAttempts = 0;
                perfStats.connectionStartTime = Date.now();
                updateConnectionStatus(true);
                startPingTimer();

                // Subscribe to both buffers
                ws.send(JSON.stringify({ action: 'subscribe', buffer: 'mqtt' }));
                ws.send(JSON.stringify({ action: 'subscribe', buffer: 'tak' }));

                // Fetch initial data for active buffer
                const activeBuffer = getActiveBuffer();
                fetchMessages(activeBuffer);

                // Get stats for the other buffer (for tab badge)
                const otherBuffer = activeBuffer === 'mqtt' ? 'tak' : 'mqtt';
                ws.send(JSON.stringify({ action: 'get_stats', buffer: otherBuffer }));

                const duration = performance.now() - startTime;
                logPerformance('onopen', duration, { reconnectAttempts });
            };
            
            // ReconnectingWebSocket uses 'open' event, native WebSocket uses 'onopen'
            if (typeof ReconnectingWebSocket !== 'undefined') {
                ws.addEventListener('open', onOpenHandler);
            } else {
                ws.onopen = onOpenHandler;
            }

            // Handle messages (works for both native and ReconnectingWebSocket)
            const onMessageHandler = function(event) {
                const msgStartTime = performance.now();
                perfStats.messagesReceived++;
                perfStats.lastMessageTime = Date.now();

                try {
                    const parseStartTime = performance.now();
                    const data = JSON.parse(event.data);
                    const parseTime = performance.now() - parseStartTime;
                    if (parseTime > 10) {
                        logPerformance('JSON.parse', parseTime, { dataSize: event.data.length });
                    }

                    // Handle ping/pong
                    if (data.type === 'ping') {
                        ws.send(JSON.stringify({ action: 'pong' }));
                        return;
                    }
                    if (data.type === 'pong') return;
                    if (data.type === 'subscribed') return;
                    if (data.type === 'connected') {
                        if (config.debug) console.log('[WS] Connected, flush interval:', data.flush_interval_sec);
                        return;
                    }

                    // Handle batched messages (both initial load and real-time updates)
                    if (data.type === 'batch' && data.buffer) {
                        const batchStartTime = performance.now();
                        const messages = data.messages || [];
                        const isInitialLoad = !hasInitialData[data.buffer];

                        if (config.debug) {
                            console.log(`[WS] Batch for ${data.buffer}: ${messages.length} msgs, isInitialLoad=${isInitialLoad}, hasInitialData=${JSON.stringify(hasInitialData)}`);
                        }

                        // Mark that we have data for this buffer
                        if (messages.length > 0 || isInitialLoad) {
                            hasInitialData[data.buffer] = true;
                        }

                        // Clear fetching flag
                        if (window._fetchingMessages) {
                            window._fetchingMessages[data.buffer] = false;
                        }

                        // Dispatch event for message handler
                        const dispatchStartTime = performance.now();
                        document.dispatchEvent(new CustomEvent('mqttgateway:batch', {
                            detail: {
                                buffer: data.buffer,
                                messages: messages,
                                stats: data.stats,
                                dropped: data.dropped || 0,
                                isInitialLoad: isInitialLoad,
                                timestamp: data.ts
                            }
                        }));
                        const dispatchTime = performance.now() - dispatchStartTime;

                        // Update tab badge
                        updateTabBadge(data.buffer, data.stats);

                        const totalTime = performance.now() - batchStartTime;
                        perfStats.messagesProcessed++;
                        logPerformance('batch_processing', totalTime, {
                            buffer: data.buffer,
                            messageCount: messages.length,
                            isInitialLoad: isInitialLoad,
                            dispatchTime: dispatchTime.toFixed(2) + 'ms'
                        });

                        // Alert if processing is very slow (potential freeze)
                        if (totalTime > 500) {
                            console.error(`[WS Perf] CRITICAL: Batch processing took ${totalTime.toFixed(2)}ms - browser may be freezing!`, {
                                buffer: data.buffer,
                                messageCount: messages.length,
                                stats: getPerformanceStats()
                            });
                        }

                        return;
                    }

                    // Handle stats update (for tab badge)
                    if (data.type === 'stats' && data.buffer) {
                        updateTabBadge(data.buffer, data.stats);
                        return;
                    }

                } catch (e) {
                    const errorTime = performance.now() - msgStartTime;
                    logPerformance('message_error', errorTime, { error: e.message });
                    if (config.debug) console.error('[WS] Parse error:', e);
                }
            };
            
            // ReconnectingWebSocket uses 'message' event, native WebSocket uses 'onmessage'
            if (typeof ReconnectingWebSocket !== 'undefined') {
                ws.addEventListener('message', onMessageHandler);
            } else {
                ws.onmessage = onMessageHandler;
            }

            // Handle close (works for both native and ReconnectingWebSocket)
            const onCloseHandler = function() {
                updateConnectionStatus(false);
                stopPingTimer();
                // ReconnectingWebSocket handles reconnection automatically, so only schedule for native
                if (typeof ReconnectingWebSocket === 'undefined') {
                    scheduleReconnect();
                }
            };
            
            const onErrorHandler = function(error) {
                if (config.debug) console.error('[WS] Error:', error);
            };
            
            // ReconnectingWebSocket uses 'close'/'error' events, native WebSocket uses 'onclose'/'onerror'
            if (typeof ReconnectingWebSocket !== 'undefined') {
                ws.addEventListener('close', onCloseHandler);
                ws.addEventListener('error', onErrorHandler);
            } else {
                ws.onclose = onCloseHandler;
                ws.onerror = onErrorHandler;
            }

        } catch (e) {
            if (config.debug) console.error('[WS] Connection error:', e);
            scheduleReconnect();
        }
    }

    /**
     * Fetch messages for a buffer (initial load)
     */
    function fetchMessages(buffer) {
        if (!ws) return;
        // Check readyState (works for both native and ReconnectingWebSocket)
        const readyState = ws.readyState !== undefined ? ws.readyState : (ws._ws ? ws._ws.readyState : WebSocket.CLOSED);
        if (readyState !== WebSocket.OPEN) return;

        // Prevent duplicate fetches
        if (window._fetchingMessages && window._fetchingMessages[buffer]) {
            return;
        }

        if (!window._fetchingMessages) window._fetchingMessages = {};
        window._fetchingMessages[buffer] = true;

        ws.send(JSON.stringify({ action: 'get_messages', buffer: buffer, limit: 100 }));

        // Clear fetching flag after timeout
        setTimeout(function() {
            if (window._fetchingMessages) {
                window._fetchingMessages[buffer] = false;
            }
        }, 2000);
    }

    /**
     * Handle tab switch - fetch initial data if needed
     */
    function onTabSwitch(buffer) {
        if (config.debug) {
            console.log(`[WS] onTabSwitch: buffer=${buffer}, wsOpen=${ws && ws.readyState === WebSocket.OPEN}, hasInitialData=${JSON.stringify(hasInitialData)}`);
        }
        if (!ws) return;
        // Check readyState (works for both native and ReconnectingWebSocket)
        const readyState = ws.readyState !== undefined ? ws.readyState : (ws._ws ? ws._ws.readyState : WebSocket.CLOSED);
        if (readyState !== WebSocket.OPEN) return;

        // Check if content area is empty (still showing placeholder)
        const bufferContent = document.getElementById(`buffer-content-${buffer}`);
        const hasContent = bufferContent && bufferContent.querySelector('table');

        if (!hasInitialData[buffer] || !hasContent) {
            if (config.debug) console.log(`[WS] onTabSwitch: fetching messages for ${buffer} (hasInitialData=${hasInitialData[buffer]}, hasContent=${!!hasContent})`);
            hasInitialData[buffer] = false; // Reset to ensure isInitialLoad is true
            fetchMessages(buffer);
        }
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
            connect();
        }, delay);
    }

    /**
     * Start ping timer
     */
    function startPingTimer() {
        stopPingTimer();
        pingTimer = setInterval(function() {
            if (ws) {
                // Check readyState (works for both native and ReconnectingWebSocket)
                const readyState = ws.readyState !== undefined ? ws.readyState : (ws._ws ? ws._ws.readyState : WebSocket.CLOSED);
                if (readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ action: 'ping' }));
                }
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
        isConnected: function() { 
            if (!ws) return false;
            const readyState = ws.readyState !== undefined ? ws.readyState : (ws._ws ? ws._ws.readyState : WebSocket.CLOSED);
            return readyState === WebSocket.OPEN;
        },
        hasData: function(buffer) { return hasInitialData[buffer]; },
        getPerformanceStats: getPerformanceStats,
        enablePerformanceMonitoring: function(enabled) { config.performanceMonitoring = enabled; },
        setPerformanceThreshold: function(threshold) { config.performanceAlertThreshold = threshold; }
    };

})();
