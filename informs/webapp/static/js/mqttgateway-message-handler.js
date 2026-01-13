/**
 * mqttgateway-message-handler.js
 * Handles WebSocket message display with expandable raw data
 */

(function() {
    'use strict';

    const config = {
        debug: false,
        maxDisplayedMessages: 100
    };

    let searchTerm = '';
    let searchTimer = null;
    const pausedBuffers = { mqtt: false, tak: false };
    const queuedMessages = { mqtt: [], tak: [] };
    const lastCallsignTime = {};
    let rowCounter = 0;

    /**
     * Format timestamp (HH:MM:SS)
     */
    function formatTime(isoTimestamp) {
        if (!isoTimestamp) return '-';
        try {
            return new Date(isoTimestamp).toLocaleTimeString('en-US', { hour12: false });
        } catch (e) {
            return isoTimestamp.slice(11, 19) || '-';
        }
    }

    /**
     * Format delta time
     */
    function formatDelta(seconds) {
        if (seconds < 60) return `Δ${Math.round(seconds)}s`;
        if (seconds < 3600) return `Δ${Math.round(seconds / 60)}m`;
        return `Δ${Math.round(seconds / 3600)}h`;
    }

    /**
     * Calculate delta since last message from same callsign
     */
    function getCallsignDelta(callsign, timestamp) {
        if (!callsign || !timestamp) return null;
        const now = new Date(timestamp).getTime();
        const key = callsign.toLowerCase();
        const last = lastCallsignTime[key];
        lastCallsignTime[key] = now;
        if (!last) return null;
        const deltaMs = now - last;
        return deltaMs > 0 ? deltaMs / 1000 : null;
    }

    /**
     * Get type icon
     */
    function getTypeIcon(msgType) {
        switch (msgType) {
            case 'position': return '<i class="bi bi-geo-alt-fill text-primary" title="Position"></i>';
            case 'text': return '<i class="bi bi-chat-dots-fill text-success" title="Text Message" style="font-size: 1.1em;"></i>';
            case 'chat': return '<i class="bi bi-chat-dots-fill text-warning" title="Chat"></i>';
            case 'nodeinfo': return '<i class="bi bi-cpu text-info" title="Node Info"></i>';
            default: return '<i class="bi bi-question-circle text-muted" title="' + (msgType || 'Unknown') + '"></i>';
        }
    }

    /**
     * Extract info from message for display
     * Backend provides all fields normalized - use directly, no parsing
     */
    function extractMessageInfo(message) {
        // Backend provides device_id normalized - use directly
        const callsign = message.device_id || 'Unknown';

        // Backend provides coordinates normalized - use directly
        let coords = null;
        if (message.latitude !== undefined && message.longitude !== undefined) {
            coords = { lat: message.latitude, lon: message.longitude };
        }

        // Backend provides summary - use directly
        const details = message.summary || '';

        return { callsign, details, coords };
    }

    /**
     * Create message row with expandable raw data
     */
    function createMessageRow(message, showDelta) {
        const info = extractMessageInfo(message);
        let deltaSeconds = null;
        if (showDelta) {
            deltaSeconds = getCallsignDelta(info.callsign, message.timestamp);
        }
        return createMessageRowWithDelta(message, deltaSeconds);
    }

    /**
     * Create message row with specific delta value
     */
    function createMessageRowWithDelta(message, deltaSeconds) {
        const time = formatTime(message.timestamp);
        const typeIcon = getTypeIcon(message.msg_type);
        const info = extractMessageInfo(message);
        const rowId = 'msg-' + (++rowCounter);

        let deltaStr = '';
        if (deltaSeconds !== null && deltaSeconds > 0) {
            deltaStr = ` <span class="text-muted">${formatDelta(deltaSeconds)}</span>`;
        }

        // Map button if coords exist - opens embedded modal map
        // Backend provides all fields normalized - use directly, no parsing/conversion
        let mapBtn = '';
        if (info.coords && !isNaN(info.coords.lat) && !isNaN(info.coords.lon)) {
            const mapBtnId = `map-btn-${rowId}`;
            mapBtn = `<button type="button" class="btn btn-link btn-sm p-0 ms-1 position-map-btn"
                id="${mapBtnId}"
                data-latitude="${message.latitude || info.coords.lat}"
                data-longitude="${message.longitude || info.coords.lon}"
                data-callsign="${info.callsign || 'Unknown'}"
                data-device-id="${message.device_id || ''}"
                data-gateway="${message.rf_gateway || ''}"
                data-rssi="${message.rssi || ''}"
                data-snr="${message.snr || ''}"
                data-timestamp="${message.timestamp || ''}"
                title="Show location on map">
                <i class="bi bi-geo-alt-fill text-primary"></i></button>`;
        }

        const row = document.createElement('tr');
        row.className = 'message-row';
        row.dataset.summary = message.summary || '';
        row.dataset.callsign = info.callsign;
        if (message.device_id) {
            row.dataset.deviceId = message.device_id;
        }

        row.innerHTML = `
            <td class="py-1 text-center" style="width: 30px;">
                <button type="button" class="btn btn-link btn-sm p-0 text-muted expand-row-btn"
                    data-bs-toggle="collapse" data-bs-target="#${rowId}" title="Show raw data">
                    <i class="bi bi-plus-lg"></i>
                </button>
            </td>
            <td class="py-1 text-center" style="width: 30px;">
                <input type="checkbox" class="form-check-input message-checkbox"
                    data-summary="${(message.summary || '').replace(/"/g, '&quot;')}"
                    data-timestamp="${message.timestamp || ''}">
            </td>
            <td class="text-nowrap small font-monospace text-muted py-1" style="width: 120px;">${time}${deltaStr}</td>
            <td class="py-1" style="width: 24px;">${typeIcon}</td>
            <td class="small py-1">
                ${info.details || info.callsign}
                ${mapBtn}
            </td>
        `;

        // Create expandable row for raw data
        const detailRow = document.createElement('tr');
        detailRow.className = 'collapse';
        detailRow.id = rowId;
        // Determine colspan based on buffer type (mqtt has more columns)
        // Now we have: expand, select, time, type icon, summary = 5 columns total
        const colspan = 5;

        // Extract text message content if this is a text/chat message
        let chatBubble = '';
        if (message.msg_type === 'text' || message.msg_type === 'chat') {
            const payload = message.payload || {};
            const textContent = payload.payload?.text || payload.text || payload.message || '';
            if (textContent) {
                // Clean up control characters (like \u0007)
                const cleanText = textContent.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
                if (cleanText) {
                    chatBubble = `
                        <div class="mb-2">
                            <div class="bg-primary text-white p-2 rounded" style="max-width: 80%; border-radius: 1rem 1rem 1rem 0.25rem;">
                                <div class="small">${escapeHtml(cleanText)}</div>
                            </div>
                        </div>
                    `;
                }
            }
        }

        // Use pre-formatted JSON from backend (required)
        let formattedJson;
        if (!message.formatted_payload_json) {
            console.warn('[Message Handler] Missing formatted_payload_json, formatting on the fly');
            formattedJson = formatPayloadJson(message.payload || message);
        } else {
            formattedJson = message.formatted_payload_json;
        }

        detailRow.innerHTML = `
            <td colspan="${colspan}" class="bg-light p-2">
                ${chatBubble}
                <pre class="mb-0 small bg-white p-2 rounded border" style="max-height: 75vh; overflow-y: auto; overflow-x: visible; white-space: pre-wrap; word-wrap: break-word; word-break: break-word; font-size: 0.75rem; font-family: 'Courier New', monospace; width: 100%;"><code style="white-space: pre-wrap; word-wrap: break-word; word-break: break-word;">${formattedJson}</code></pre>
            </td>
        `;

        return { row, detailRow };
    }

    /**
     * Format JSON payload with logical field ordering and high-density formatting.
     * Matches the backend format_payload_json function.
     *
     * Orders fields logically:
     * 1. Message type and identifiers (type, timestamp, from, sender, to, id)
     * 2. RF/Mesh fields (hops_away, hop_start, rssi, snr, channel)
     * 3. Nested objects (payload, position, etc.)
     * 4. Other fields
     *
     * Uses compact format with spaces as preferred break points for CSS wrapping.
     */
    function formatPayloadJson(payload) {
        if (!payload || typeof payload !== 'object') {
            return JSON.stringify(payload, null, 0).replace(/,/g, ', ').replace(/:/g, ': ');
        }

        // Define field order priority (lower number = earlier in output)
        const fieldOrder = {
            'type': 1,
            'timestamp': 2,
            'from': 3,
            'sender': 4,
            'to': 5,
            'id': 6,
            'hops_away': 7,
            'hop_start': 8,
            'rssi': 9,
            'snr': 10,
            'channel': 11,
            'payload': 20,  // Nested objects come later
            'position': 21,
        };

        // Separate fields by priority
        const orderedFields = [];
        const nestedFields = [];
        const otherFields = [];

        for (const [key, value] of Object.entries(payload)) {
            const priority = fieldOrder[key] !== undefined ? fieldOrder[key] : 99;
            if (priority < 20) {
                orderedFields.push({priority, key, value});
            } else if (value && typeof value === 'object' && (Array.isArray(value) || Object.keys(value).length > 0)) {
                nestedFields.push({priority, key, value});
            } else {
                otherFields.push({priority, key, value});
            }
        }

        // Sort each group
        orderedFields.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
        nestedFields.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
        otherFields.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));

        // Build ordered object
        const orderedPayload = {};
        for (const {key, value} of orderedFields) {
            orderedPayload[key] = value;
        }
        for (const {key, value} of nestedFields) {
            orderedPayload[key] = value;
        }
        for (const {key, value} of otherFields) {
            orderedPayload[key] = value;
        }

        // Format as compact JSON (no indentation for density)
        let jsonStr = JSON.stringify(orderedPayload, null, 0);

        // Add zero-width spaces after commas and colons as preferred break points
        // Zero-width space (U+200B) is invisible but allows CSS word-wrap to break
        const ZWSP = '\u200B';
        jsonStr = jsonStr.replace(/,/g, `,${ZWSP}`);
        jsonStr = jsonStr.replace(/:/g, `:${ZWSP}`);

        // Add newline before nested objects for better readability
        jsonStr = jsonStr.replace(new RegExp(`,${ZWSP}*("[\w]+":${ZWSP}*[{[])`, 'g'), ',\n$1');

        return jsonStr;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Create table structure
     */
    function createTableStructure() {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-responsive';
        wrapper.innerHTML = `
            <table class="table table-sm table-hover mb-0 align-middle">
                <thead class="table-light">
                    <tr>
                        <th class="py-1" style="width: 30px;"></th>
                        <th class="py-1" style="width: 30px;"></th>
                        <th class="text-nowrap py-1" style="width: 120px;"><i class="bi bi-clock me-1"></i>Time</th>
                        <th class="py-1" style="width: 24px;"></th>
                        <th class="py-1">Summary</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `;
        return wrapper;
    }

    /**
     * Create stats footer
     */
    function createStatsFooter(stats) {
        const footer = document.createElement('div');
        footer.className = 'd-flex justify-content-between align-items-center px-2 py-1 bg-light border-top small text-muted';
        footer.innerHTML = `
            <span><i class="bi bi-database me-1"></i><span class="buffer-size">${stats?.buffer_size || 0}</span>/${stats?.buffer_max || 1000}</span>
            <span><i class="bi bi-hash me-1"></i>Total: <span class="total-count">${stats?.total_messages || 0}</span></span>
        `;
        return footer;
    }

    /**
     * Handle initial/incremental messages
     */
    function handleInitialMessages(event) {
        const { buffer, messages, stats, incremental } = event.detail;

        const bufferContent = document.getElementById(`buffer-content-${buffer}`);
        if (!bufferContent) return;

        // If incremental and we already have a table, just prepend new messages
        if (incremental && messages && messages.length > 0) {
            const tbody = bufferContent.querySelector('table tbody');
            if (tbody) {
                // Track existing timestamps + device_ids to avoid duplicates
                const existingKeys = new Set();
                const existingRows = tbody.querySelectorAll('tr.message-row');
                existingRows.forEach(function(row) {
                    const ts = row.dataset.timestamp || '';
                    const did = row.dataset.deviceId || '';
                    if (ts) existingKeys.add(`${ts}:${did}`);
                });

                // Prepend new messages (they come newest first), skipping duplicates
                messages.reverse().forEach(function(msg) {
                    const msgKey = `${msg.timestamp || ''}:${msg.device_id || ''}`;
                    if (existingKeys.has(msgKey)) {
                        console.warn('[Handler] DUPLICATE in incremental load:', {
                            timestamp: msg.timestamp,
                            device_id: msg.device_id,
                            summary: msg.summary?.substring(0, 50),
                            source: 'incremental_fetch',
                            stack_trace: new Error().stack
                        });
                        return; // Skip duplicate
                    }
                    existingKeys.add(msgKey);

                    const deltaSec = getCallsignDelta(extractMessageInfo(msg).callsign, msg.timestamp);
                    const { row, detailRow } = createMessageRowWithDelta(msg, deltaSec);
                    if (!matchesSearch(msg, searchTerm)) {
                        row.style.display = 'none';
                        detailRow.style.display = 'none';
                    }
                    tbody.insertBefore(detailRow, tbody.firstChild);
                    tbody.insertBefore(row, tbody.firstChild);
                });

                // Limit rows
                const rows = tbody.querySelectorAll('tr.message-row');
                while (rows.length > config.maxDisplayedMessages) {
                    const lastRow = rows[rows.length - 1];
                    const nextRow = lastRow.nextElementSibling;
                    if (nextRow) nextRow.remove();
                    lastRow.remove();
                }

                // Update stats
                updateStatsFooter(bufferContent, stats);
                updateTabBadge(buffer, stats);
                return;
            }
        }

        // If we already have content and no new messages, just update stats
        if (incremental && (!messages || messages.length === 0)) {
            updateStatsFooter(bufferContent, stats);
            updateTabBadge(buffer, stats);
            return;
        }

        // Full initial load - clear and rebuild
        bufferContent.innerHTML = '';

        if (!messages || messages.length === 0) {
            bufferContent.innerHTML = '<div class="text-center py-3 text-muted"><i class="bi bi-inbox"></i> <span class="small">No messages</span></div>';
            updateTabBadge(buffer, stats);
            return;
        }

        // Deduplicate messages by timestamp + device_id before processing
        const seenMessages = new Map();
        const uniqueMessages = [];
        messages.forEach(function(msg) {
            const key = `${msg.timestamp || ''}:${msg.device_id || ''}`;
            if (!seenMessages.has(key)) {
                seenMessages.set(key, true);
                uniqueMessages.push(msg);
            } else {
                console.warn('[Handler] DUPLICATE in initial load batch:', {
                    timestamp: msg.timestamp,
                    device_id: msg.device_id,
                    summary: msg.summary?.substring(0, 50),
                    source: 'initial_fetch',
                    duplicate_in_batch: true
                });
            }
        });

        const tableWrapper = createTableStructure();
        const tbody = tableWrapper.querySelector('tbody');

        // Display newest first, calculating delta from the NEXT older message
        uniqueMessages.forEach(function(msg, index) {
            const info = extractMessageInfo(msg);
            const key = info.callsign.toLowerCase();

            // Find the next older message from same callsign to calculate delta
            let deltaSeconds = null;
            const currentTime = new Date(msg.timestamp).getTime();

            for (let i = index + 1; i < uniqueMessages.length; i++) {
                const olderInfo = extractMessageInfo(uniqueMessages[i]);
                if (olderInfo.callsign.toLowerCase() === key) {
                    const olderTime = new Date(uniqueMessages[i].timestamp).getTime();
                    deltaSeconds = (currentTime - olderTime) / 1000;
                    break;
                }
            }

            const { row, detailRow } = createMessageRowWithDelta(msg, deltaSeconds);
            if (!matchesSearch(msg, searchTerm)) {
                row.style.display = 'none';
                detailRow.style.display = 'none';
            }
            tbody.appendChild(row);
            tbody.appendChild(detailRow);
        });

        // Update lastCallsignTime with the newest timestamp for each callsign
        messages.forEach(function(msg) {
            const info = extractMessageInfo(msg);
            if (info.callsign && msg.timestamp) {
                const key = info.callsign.toLowerCase();
                const msgTime = new Date(msg.timestamp).getTime();
                if (!lastCallsignTime[key] || msgTime > lastCallsignTime[key]) {
                    lastCallsignTime[key] = msgTime;
                }
            }
        });

        bufferContent.appendChild(tableWrapper);
        bufferContent.appendChild(createStatsFooter(stats));
        updateTabBadge(buffer, stats);
    }

    /**
     * Update stats footer without rebuilding table
     */
    function updateStatsFooter(bufferContent, stats) {
        if (!stats) return;
        const footer = bufferContent.querySelector('.bg-light.border-top');
        if (footer) {
            const bufferSizeEl = footer.querySelector('.buffer-size');
            const totalEl = footer.querySelector('.total-count');
            if (bufferSizeEl) bufferSizeEl.textContent = stats.buffer_size || 0;
            if (totalEl) totalEl.textContent = stats.total_messages || 0;
        }
    }

    /**
     * Handle new message
     */
    function handleNewMessage(event) {
        const { buffer, message, stats } = event.detail;

        if (pausedBuffers[buffer]) {
            queuedMessages[buffer].push({ message, stats });
            updateStreamStatus(buffer);
            return;
        }

        addMessageToBuffer(buffer, message, stats);
    }

    /**
     * Add message to buffer
     */
    function addMessageToBuffer(buffer, message, stats) {
        const bufferContent = document.getElementById(`buffer-content-${buffer}`);
        if (!bufferContent) return;

        let tbody = bufferContent.querySelector('table tbody');

        if (!tbody) {
            bufferContent.innerHTML = '';
            const tableWrapper = createTableStructure();
            bufferContent.appendChild(tableWrapper);
            bufferContent.appendChild(createStatsFooter(stats));
            tbody = bufferContent.querySelector('table tbody');
        }

        // Check for duplicate - use timestamp + device_id as unique key
        const msgTimestamp = message.timestamp || '';
        const msgDeviceId = message.device_id || '';

        if (!msgTimestamp) {
            console.warn('[Handler] Message missing timestamp, skipping:', message);
            return;
        }

        // Check if message already exists - use timestamp + device_id as unique key
        const msgKey = `${msgTimestamp}:${msgDeviceId}`;
        const existingRows = tbody.querySelectorAll('tr.message-row');
        for (let i = 0; i < existingRows.length; i++) {
            const existingRow = existingRows[i];
            const existingTimestamp = existingRow.dataset.timestamp || '';
            const existingDeviceId = existingRow.dataset.deviceId || '';
            const existingKey = `${existingTimestamp}:${existingDeviceId}`;

            // Exact match on timestamp + device_id
            if (existingKey === msgKey && existingTimestamp) {
                // Log duplicate with stack trace to identify source
                console.warn('[Handler] DUPLICATE MESSAGE DETECTED:', {
                    timestamp: msgTimestamp,
                    device_id: msgDeviceId,
                    summary: message.summary?.substring(0, 50),
                    source: message.source,
                    msg_type: message.msg_type,
                    existing_row_index: i,
                    stack_trace: new Error().stack
                });
                // Update stats but don't add duplicate
                updateStatsFooter(bufferContent, stats);
                updateTabBadge(buffer, stats);
                return;
            }
        }

        const { row, detailRow } = createMessageRow(message, true);
        if (!matchesSearch(message, searchTerm)) {
            row.style.display = 'none';
            detailRow.style.display = 'none';
        }

        if (tbody.firstChild) {
            tbody.insertBefore(detailRow, tbody.firstChild);
            tbody.insertBefore(row, tbody.firstChild);
        } else {
            tbody.appendChild(row);
            tbody.appendChild(detailRow);
        }

        // Limit rows (each message = 2 rows)
        const rows = tbody.querySelectorAll('tr.message-row');
        while (rows.length > config.maxDisplayedMessages) {
            const lastRow = rows[rows.length - 1];
            const nextRow = lastRow.nextElementSibling;
            if (nextRow) nextRow.remove();
            lastRow.remove();
        }

        // Update stats
        const bufferSizeEl = bufferContent.querySelector('.buffer-size');
        const totalEl = bufferContent.querySelector('.total-count');
        if (bufferSizeEl && stats) bufferSizeEl.textContent = stats.buffer_size || 0;
        if (totalEl && stats) totalEl.textContent = stats.total_messages || 0;

        updateTabBadge(buffer, stats);
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
     * Check if message matches search
     */
    function matchesSearch(message, term) {
        if (!term) return true;
        const lowerTerm = term.toLowerCase();
        const summary = (message.summary || '').toLowerCase();
        const info = extractMessageInfo(message);
        return summary.includes(lowerTerm) || info.callsign.toLowerCase().includes(lowerTerm);
    }

    /**
     * Apply search filter
     */
    function applySearchFilter() {
        const searchInput = document.getElementById('message-search');
        if (!searchInput) return;

        searchTerm = searchInput.value.trim();

        document.querySelectorAll('[id^="buffer-content-"] tbody').forEach(function(tbody) {
            tbody.querySelectorAll('.message-row').forEach(function(row) {
                const message = { summary: row.dataset.summary || '', callsign: row.dataset.callsign || '' };
                const visible = matchesSearch(message, searchTerm);
                row.style.display = visible ? '' : 'none';
                // Also hide/show the detail row
                const nextRow = row.nextElementSibling;
                if (nextRow && nextRow.classList.contains('collapse')) {
                    nextRow.style.display = visible ? '' : 'none';
                }
            });
        });

        const searchResults = document.getElementById('search-results');
        if (searchResults) {
            searchResults.style.display = searchTerm ? '' : 'none';
            if (searchTerm) {
                const total = document.querySelectorAll('.message-row').length;
                const visible = document.querySelectorAll('.message-row:not([style*="display: none"])').length;
                searchResults.textContent = `${visible}/${total}`;
            }
        }
    }

    /**
     * Update stream status
     */
    function updateStreamStatus(buffer) {
        const statusEl = document.getElementById(`stream-status-${buffer}`);
        if (!statusEl) return;

        if (pausedBuffers[buffer]) {
            const queueSize = queuedMessages[buffer].length;
            statusEl.textContent = queueSize > 0 ? `${queueSize} queued` : 'Paused';
            statusEl.className = queueSize > 0 ? 'small text-warning' : 'small text-muted';
        } else {
            statusEl.textContent = '';
        }
    }

    /**
     * Pause buffer
     */
    function pauseBuffer(buffer) {
        pausedBuffers[buffer] = true;
        const liveBtn = document.getElementById(`live-btn-${buffer}`);
        const pauseBtn = document.getElementById(`pause-btn-${buffer}`);
        if (liveBtn) { liveBtn.classList.remove('btn-success', 'active'); liveBtn.classList.add('btn-outline-success'); }
        if (pauseBtn) { pauseBtn.classList.remove('btn-outline-warning'); pauseBtn.classList.add('btn-warning', 'active'); }
        updateStreamStatus(buffer);
    }

    /**
     * Resume buffer
     */
    function resumeBuffer(buffer) {
        pausedBuffers[buffer] = false;
        const liveBtn = document.getElementById(`live-btn-${buffer}`);
        const pauseBtn = document.getElementById(`pause-btn-${buffer}`);
        if (liveBtn) { liveBtn.classList.remove('btn-outline-success'); liveBtn.classList.add('btn-success', 'active'); }
        if (pauseBtn) { pauseBtn.classList.remove('btn-warning', 'active'); pauseBtn.classList.add('btn-outline-warning'); }

        queuedMessages[buffer].forEach(function(item) {
            addMessageToBuffer(buffer, item.message, item.stats);
        });
        queuedMessages[buffer] = [];
        updateStreamStatus(buffer);
    }

    /**
     * Format local timestamp
     */
    function formatLocalTimestamp(isoTimestamp) {
        if (!isoTimestamp) return '-';
        try {
            const date = new Date(isoTimestamp);
            return date.toLocaleString();
        } catch (e) {
            return isoTimestamp;
        }
    }

    /**
     * Show position map in modal
     */
    let positionMapInstance = null;
    function showPositionMap(lat, lon, callsign, deviceId, gateway, rssi, snr, timestamp) {
        if (!window.atlas) {
            console.error('[Message Handler] Azure Maps SDK not loaded');
            alert('Map functionality is not available. Please refresh the page.');
            return;
        }

        const modal = document.getElementById('positionMapModal');
        const mapContainer = document.getElementById('position-map-container');
        const infoEl = document.getElementById('position-map-info');
        const deviceIdEl = document.getElementById('position-device-id');

        if (!modal || !mapContainer) {
            console.error('[Message Handler] Position map modal elements not found');
            return;
        }

        const azureMapsKey = mapContainer.dataset.azureMapsKey;
        if (!azureMapsKey || azureMapsKey.trim() === '') {
            console.error('[Message Handler] Azure Maps key not configured');
            if (infoEl) {
                infoEl.innerHTML = '<span class="text-danger">Azure Maps key not configured. Please contact your administrator.</span>';
            }
            // Still show modal but with error message
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
            return;
        }

        // Update device ID in header
        if (deviceIdEl) {
            deviceIdEl.textContent = deviceId || callsign || 'Unknown';
        }

        // Update info text with metadata - backend provides normalized data, display directly
        if (infoEl) {
            const parts = [];
            if (gateway) parts.push(`GW: ${gateway}`);
            if (rssi) parts.push(`RSSI: ${rssi}`);
            if (snr) parts.push(`SNR: ${snr}`);
            if (timestamp) parts.push(`Time: ${formatLocalTimestamp(timestamp)}`);

            const metadata = parts.length > 0 ? parts.join(' · ') : '';
            infoEl.innerHTML = `<strong>${callsign}</strong> @ ${lat.toFixed(5)}, ${lon.toFixed(5)}${metadata ? '<br><small class="text-muted">' + metadata + '</small>' : ''}`;
        }

        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Initialize map when modal is shown
        modal.addEventListener('shown.bs.modal', function initMap() {
            modal.removeEventListener('shown.bs.modal', initMap);

            // Dispose existing map if any
            if (positionMapInstance) {
                positionMapInstance.dispose();
                positionMapInstance = null;
            }

            // Initialize map
            positionMapInstance = new atlas.Map('position-map-container', {
                authOptions: {
                    authType: 'subscriptionKey',
                    subscriptionKey: azureMapsKey
                },
                style: 'road',
                zoom: 15,
                center: [lon, lat],
                showFeedbackLink: false,
                showLogo: false
            });

            // Add marker when map is ready
            positionMapInstance.events.add('ready', function() {
                const dataSource = new atlas.source.DataSource();
                positionMapInstance.sources.add(dataSource);

                const point = new atlas.data.Point([lon, lat]);
                dataSource.add(new atlas.data.Feature(point, {
                    callsign: callsign
                }));

                const symbolLayer = new atlas.layer.SymbolLayer(dataSource, null, {
                    iconOptions: {
                        image: 'pin-round-blue',
                        anchor: 'center',
                        allowOverlap: true
                    },
                    textOptions: {
                        textField: callsign,
                        offset: [0, -1.5],
                        color: 'white',
                        outlineColor: 'black',
                        outlineWidth: 2
                    }
                });

                positionMapInstance.layers.add(symbolLayer);
            });
        }, { once: true });

        // Clean up when modal is hidden
        modal.addEventListener('hidden.bs.modal', function cleanup() {
            if (positionMapInstance) {
                positionMapInstance.dispose();
                positionMapInstance = null;
            }
        }, { once: true });
    }

    /**
     * Switch controls visibility on tab change
     */
    function switchControlsForTab(buffer) {
        // Show/hide stream controls
        document.getElementById('stream-controls-mqtt')?.classList.toggle('d-none', buffer !== 'mqtt');
        document.getElementById('stream-controls-tak')?.classList.toggle('d-none', buffer !== 'tak');

        // Show/hide stream status
        document.getElementById('stream-status-mqtt')?.classList.toggle('d-none', buffer !== 'mqtt');
        document.getElementById('stream-status-tak')?.classList.toggle('d-none', buffer !== 'tak');

        // Show/hide forwarding controls
        document.getElementById('forwarding-controls-mqtt')?.classList.toggle('d-none', buffer !== 'mqtt');
        document.getElementById('forwarding-controls-tak')?.classList.toggle('d-none', buffer !== 'tak');
    }

    /**
     * Initialize
     */
    function init() {
        document.addEventListener('mqttgateway:initial-messages', handleInitialMessages);
        document.addEventListener('mqttgateway:new-message', handleNewMessage);

        // Search
        const searchInput = document.getElementById('message-search');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                if (searchTimer) clearTimeout(searchTimer);
                searchTimer = setTimeout(applySearchFilter, 200);
            });
        }

        const clearSearchBtn = document.getElementById('clear-search');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', function() {
                if (searchInput) searchInput.value = '';
                searchTerm = '';
                applySearchFilter();
            });
        }

        // Buffer controls
        ['mqtt', 'tak'].forEach(function(buffer) {
            const liveBtn = document.getElementById(`live-btn-${buffer}`);
            const pauseBtn = document.getElementById(`pause-btn-${buffer}`);
            if (liveBtn) liveBtn.addEventListener('click', function() { resumeBuffer(buffer); });
            if (pauseBtn) pauseBtn.addEventListener('click', function() { pauseBuffer(buffer); });
        });

        // Tab change - switch controls
        document.querySelectorAll('[data-bs-toggle="tab"][data-buffer]').forEach(function(tab) {
            tab.addEventListener('shown.bs.tab', function(event) {
                const buffer = event.target.dataset.buffer;
                if (buffer) switchControlsForTab(buffer);
            });
        });

        // Position map button handlers - use delegated event listener for dynamically created buttons
        document.body.addEventListener('click', function(event) {
            const mapBtn = event.target.closest('.position-map-btn');
            if (mapBtn) {
                event.preventDefault();
                event.stopPropagation();
                const lat = parseFloat(mapBtn.dataset.latitude);
                const lon = parseFloat(mapBtn.dataset.longitude);
                const callsign = mapBtn.dataset.callsign || 'Unknown';
                const deviceId = mapBtn.dataset.deviceId || '';
                const gateway = mapBtn.dataset.gateway || '';
                const rssi = mapBtn.dataset.rssi || '';
                const snr = mapBtn.dataset.snr || '';
                const timestamp = mapBtn.dataset.timestamp || '';
                if (!isNaN(lat) && !isNaN(lon)) {
                    showPositionMap(lat, lon, callsign, deviceId, gateway, rssi, snr, timestamp);
                }
            }
        });

        // Update current date/time display
        function updateDateTime() {
            const el = document.getElementById('current-datetime');
            if (el) {
                const now = new Date();
                el.textContent = now.toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                }) + ' ' + now.toLocaleTimeString('en-US', { hour12: false });
            }
        }
        updateDateTime();
        setInterval(updateDateTime, 1000);

    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.mqttgatewayMessageHandler = {
        applySearch: applySearchFilter,
        pauseBuffer: pauseBuffer,
        resumeBuffer: resumeBuffer
    };

})();
