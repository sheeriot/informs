/**
 * mqttgateway-message-handler.js
 * Handles batched WebSocket message display with render throttling.
 * Uses requestAnimationFrame to batch DOM updates.
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
    const pendingRenders = { mqtt: [], tak: [] };
    const lastCallsignTime = {};
    let rowCounter = 0;
    let renderScheduled = { mqtt: false, tak: false };

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
     */
    function extractMessageInfo(message) {
        // Use short_name if available, fallback to device_id
        const callsign = message.short_name || message.device_id || 'Unknown';
        let coords = null;
        if (message.latitude !== undefined && message.longitude !== undefined) {
            coords = { lat: message.latitude, lon: message.longitude };
        }
        const details = message.summary || '';
        return { callsign, details, coords };
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

        let mapBtn = '';
        if (info.coords && !isNaN(info.coords.lat) && !isNaN(info.coords.lon)) {
            mapBtn = `<button type="button" class="btn btn-link btn-sm p-0 ms-1 position-map-btn"
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
        row.dataset.timestamp = message.timestamp || '';
        if (message.device_id) {
            row.dataset.deviceId = message.device_id;
        }
        if (message.correlation_id) {
            row.dataset.correlationId = message.correlation_id;
        }

        // Build status badges for summary row
        const statusBadges = buildStatusBadges(message);
        
        row.innerHTML = `
            <td class="py-1 text-center" style="width: 30px;">
                <button type="button" class="btn btn-link btn-sm p-0 text-muted expand-row-btn"
                    data-bs-toggle="collapse" data-bs-target="#${rowId}" title="Show message details">
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
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span>${info.details || info.callsign}</span>
                    ${statusBadges}
                    ${mapBtn}
                    <button type="button" class="btn btn-link btn-sm p-0 text-primary view-details-btn"
                        data-bs-toggle="collapse" data-bs-target="#${rowId}" title="View message workflow & details">
                        <i class="bi bi-info-circle"></i>
                    </button>
                </div>
            </td>
        `;

        const detailRow = document.createElement('tr');
        detailRow.className = 'collapse';
        detailRow.id = rowId;
        const colspan = 5;

        let chatBubble = '';
        if (message.msg_type === 'text' || message.msg_type === 'chat') {
            const payload = message.payload || {};
            const textContent = payload.payload?.text || payload.text || payload.message || '';
            if (textContent) {
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

        let formattedJson = message.formatted_payload_json || formatPayloadJson(message.payload || message);

        // Build workflow detail section
        const workflowHtml = buildWorkflowDetailSection(message, chatBubble, formattedJson);

        detailRow.innerHTML = `
            <td colspan="${colspan}" class="p-0">
                ${workflowHtml}
            </td>
        `;

        return { row, detailRow };
    }

    /**
     * Build status badges for summary row (filtered, forwarded, verified)
     */
    function buildStatusBadges(message) {
        const badges = [];
        const outputFiltered = message.output_filtered;
        const outputSent = message.output_sent;
        const outputFilteredReason = message.output_filtered_reason;
        const outputChannel = message.output_channel;
        const outputCotReceived = message.output_cot_received;
        const outputSendResult = message.output_send_result;
        
        // Filtered badge
        if (outputFiltered === true) {
            let badgeClass = 'bg-warning text-dark';
            let badgeText = 'Filtered';
            let badgeTitle = outputFilteredReason || 'Message was filtered';
            
            // Color code by reason
            if (outputFilteredReason) {
                if (outputFilteredReason.includes('disabled')) {
                    badgeClass = 'bg-secondary';
                } else if (outputFilteredReason.includes('loop') || outputFilteredReason.includes('echo')) {
                    badgeClass = 'bg-danger';
                }
            }
            
            badges.push(`<span class="badge ${badgeClass}" title="${escapeHtml(badgeTitle)}">
                <i class="bi bi-funnel-fill me-1"></i>${badgeText}
            </span>`);
        }
        
        // Forwarded/Sent badge
        if (outputSent === true) {
            const channel = outputChannel ? outputChannel.toUpperCase() : 'TAK';
            let badgeClass = 'bg-success';
            let badgeText = `→ ${channel}`;
            
            if (outputSendResult && outputSendResult !== 'success') {
                badgeClass = 'bg-danger';
                badgeText = `✗ ${channel}`;
            }
            
            badges.push(`<span class="badge ${badgeClass}" title="Forwarded to ${channel}">
                <i class="bi bi-send-fill me-1"></i>${badgeText}
            </span>`);
        } else if (outputFiltered === false && outputSent === false) {
            // Not filtered but not sent (pending)
            badges.push(`<span class="badge bg-secondary" title="Pending">
                <i class="bi bi-hourglass-split me-1"></i>Pending
            </span>`);
        }
        
        // Verification badge
        if (outputSent === true) {
            if (outputCotReceived === true) {
                badges.push(`<span class="badge bg-success" title="TAK Server verified receipt">
                    <i class="bi bi-check-circle-fill me-1"></i>Verified
                </span>`);
            } else if (outputCotReceived === false) {
                badges.push(`<span class="badge bg-danger" title="TAK Server verification failed">
                    <i class="bi bi-x-circle-fill me-1"></i>Not Verified
                </span>`);
            } else {
                badges.push(`<span class="badge bg-warning text-dark" title="TAK Server verification pending">
                    <i class="bi bi-question-circle-fill me-1"></i>Verify
                </span>`);
            }
        }
        
        return badges.join(' ');
    }

    /**
     * Build workflow detail section showing complete message lifecycle
     */
    function buildWorkflowDetailSection(message, chatBubble, formattedJson) {
        const outputFiltered = message.output_filtered;
        const outputSent = message.output_sent;
        const outputSendResult = message.output_send_result;
        const outputFilteredReason = message.output_filtered_reason;
        const outputCot = message.output_cot;
        const outputCotUid = message.output_cot_uid;
        const outputCotType = message.output_cot_type;
        const outputChannel = message.output_channel;
        const outputSendTimestamp = message.output_send_timestamp;
        const outputCotReceived = message.output_cot_received;
        const outputCotReceivedTimestamp = message.output_cot_received_timestamp;
        const outputCotVerificationMethod = message.output_cot_verification_method;

        let routingHtml = '';
        if (outputFiltered === true) {
            routingHtml = `
                <div class="mb-2">
                    <strong>Status:</strong> <span class="badge bg-warning text-dark">Filtered</span>
                    ${outputFilteredReason ? `<div class="small text-muted mt-1">Reason: ${escapeHtml(outputFilteredReason)}</div>` : ''}
                </div>
            `;
        } else if (outputFiltered === false) {
            routingHtml = `
                <div class="mb-2">
                    <strong>Status:</strong> <span class="badge bg-success">Forwarded</span>
                    ${outputChannel ? `<div class="small text-muted mt-1">Destination: ${escapeHtml(outputChannel.toUpperCase())}</div>` : ''}
                </div>
            `;
        } else {
            routingHtml = `
                <div class="mb-2">
                    <strong>Status:</strong> <span class="badge bg-secondary">Pending</span>
                </div>
            `;
        }

        let cotTranslationHtml = '';
        if (outputCot) {
            cotTranslationHtml = `
                <div class="mb-2">
                    <strong>COT Translation:</strong>
                    <div class="small mt-1">
                        ${outputCotUid ? `<div><strong>UID:</strong> <code>${escapeHtml(outputCotUid)}</code></div>` : ''}
                        ${outputCotType ? `<div><strong>Type:</strong> <code>${escapeHtml(outputCotType)}</code></div>` : ''}
                    </div>
                    <pre class="mb-0 small bg-white p-2 rounded border mt-2" style="max-height: 300px; overflow-y: auto; font-size: 0.7rem; font-family: 'Courier New', monospace;"><code>${escapeHtml(outputCot)}</code></pre>
                </div>
            `;
        } else if (outputFiltered === false) {
            cotTranslationHtml = `
                <div class="mb-2">
                    <strong>COT Translation:</strong> <span class="text-muted small">Not available</span>
                </div>
            `;
        }

        let sendStatusHtml = '';
        if (outputSent === true) {
            const resultBadge = outputSendResult === 'success' ? 'bg-success' : 'bg-danger';
            sendStatusHtml = `
                <div class="mb-2">
                    <strong>Send Status:</strong> <span class="badge ${resultBadge}">${escapeHtml(outputSendResult || 'sent')}</span>
                    ${outputSendTimestamp ? `<div class="small text-muted mt-1">Sent: ${formatLocalTimestamp(outputSendTimestamp)}</div>` : ''}
                </div>
            `;
        } else if (outputSent === false) {
            sendStatusHtml = `
                <div class="mb-2">
                    <strong>Send Status:</strong> <span class="badge bg-secondary">Not Sent</span>
                </div>
            `;
        }

        const correlationId = message.correlation_id;
        const canVerify = outputSent === true && correlationId;
        
        let verificationHtml = '';
        if (outputCotReceived === true) {
            verificationHtml = `
                <div class="mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <strong>TAK Server Verification:</strong> <span class="badge bg-success">Verified</span>
                    </div>
                    ${outputCotReceivedTimestamp ? `<div class="small text-muted mt-1">Verified: ${formatLocalTimestamp(outputCotReceivedTimestamp)}</div>` : ''}
                    ${outputCotVerificationMethod ? `<div class="small text-muted">Method: ${escapeHtml(outputCotVerificationMethod)}</div>` : ''}
                </div>
            `;
        } else if (outputCotReceived === false) {
            verificationHtml = `
                <div class="mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <strong>TAK Server Verification:</strong> <span class="badge bg-danger">Not Verified</span>
                        ${canVerify ? `<button type="button" class="btn btn-sm btn-outline-primary verify-btn" data-correlation-id="${escapeHtml(correlationId)}" title="Verify COT receipt">
                            <i class="bi bi-check-circle me-1"></i>Verify
                        </button>` : ''}
                    </div>
                </div>
            `;
        } else if (outputSent === true) {
            verificationHtml = `
                <div class="mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <strong>TAK Server Verification:</strong> <span class="badge bg-warning text-dark">Pending</span>
                        ${canVerify ? `<button type="button" class="btn btn-sm btn-outline-primary verify-btn" data-correlation-id="${escapeHtml(correlationId)}" title="Verify COT receipt">
                            <i class="bi bi-check-circle me-1"></i>Verify
                        </button>` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="card border-0">
                <div class="card-header bg-secondary-subtle py-2 px-3">
                    <h6 class="mb-0"><i class="bi bi-diagram-3 me-1"></i>Message Workflow & Translation</h6>
                </div>
                <div class="card-body p-3">
                    <div class="mb-3">
                        <h6 class="small fw-bold mb-2">1. Input Message</h6>
                        ${chatBubble}
                        <pre class="mb-0 small bg-white p-2 rounded border" style="max-height: 200px; overflow-y: auto; font-size: 0.7rem; font-family: 'Courier New', monospace;"><code>${escapeHtml(formattedJson)}</code></pre>
                    </div>
                    <div class="mb-3">
                        <h6 class="small fw-bold mb-2">2. Routing Decision</h6>
                        ${routingHtml}
                    </div>
                    ${cotTranslationHtml ? `<div class="mb-3"><h6 class="small fw-bold mb-2">3. COT Translation</h6>${cotTranslationHtml}</div>` : ''}
                    ${sendStatusHtml ? `<div class="mb-3"><h6 class="small fw-bold mb-2">4. Send Status</h6>${sendStatusHtml}</div>` : ''}
                    ${verificationHtml ? `<div class="mb-3"><h6 class="small fw-bold mb-2">5. TAK Server Verification</h6>${verificationHtml}</div>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Format JSON payload (fallback if backend doesn't provide formatted version)
     */
    function formatPayloadJson(payload) {
        if (!payload || typeof payload !== 'object') {
            return JSON.stringify(payload, null, 0).replace(/,/g, ', ').replace(/:/g, ': ');
        }
        let jsonStr = JSON.stringify(payload, null, 0);
        const ZWSP = '\u200B';
        jsonStr = jsonStr.replace(/,/g, `,${ZWSP}`);
        jsonStr = jsonStr.replace(/:/g, `:${ZWSP}`);
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
     * Update stats footer
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

    // Performance monitoring for message handler
    const handlerPerfStats = {
        batchesProcessed: 0,
        totalRenderTime: 0,
        maxRenderTime: 0,
        slowRenders: []
    };

    /**
     * Handle batched messages from WebSocket.
     * Uses requestAnimationFrame to batch DOM updates.
     */
    function handleBatch(event) {
        const batchStartTime = performance.now();
        const { buffer, messages, stats, isInitialLoad, dropped } = event.detail;

        if (config.debug) {
            console.log(`[Handler] handleBatch: buffer=${buffer}, msgs=${messages.length}, isInitialLoad=${isInitialLoad}, dropped=${dropped}`);
        }

        const bufferContent = document.getElementById(`buffer-content-${buffer}`);
        if (!bufferContent) return;

        // If paused, queue messages but still update stats
        if (pausedBuffers[buffer] && !isInitialLoad) {
            pendingRenders[buffer].push(...messages);
            updateStatsFooter(bufferContent, stats);
            updateTabBadge(buffer, stats);
            updateStreamStatus(buffer);
            return;
        }

        // Initial load - rebuild entire table
        if (isInitialLoad) {
            renderInitialLoad(buffer, messages, stats);
            return;
        }

        // Incremental update - queue for batched render
        if (messages.length > 0) {
            pendingRenders[buffer].push(...messages);
            scheduleRender(buffer, stats);
        } else {
            // No new messages, just update stats
            updateStatsFooter(bufferContent, stats);
            updateTabBadge(buffer, stats);
        }

        // Performance monitoring
        const batchTime = performance.now() - batchStartTime;
        handlerPerfStats.batchesProcessed++;
        handlerPerfStats.totalRenderTime += batchTime;
        if (batchTime > handlerPerfStats.maxRenderTime) {
            handlerPerfStats.maxRenderTime = batchTime;
        }

        if (batchTime > 100) {
            console.warn(`[Handler Perf] SLOW batch processing: ${batchTime.toFixed(2)}ms`, {
                buffer,
                messageCount: messages.length,
                isInitialLoad,
                pendingCount: pendingRenders[buffer].length
            });
            handlerPerfStats.slowRenders.push({
                buffer,
                duration: batchTime,
                messageCount: messages.length,
                timestamp: new Date().toISOString()
            });
            if (handlerPerfStats.slowRenders.length > 10) {
                handlerPerfStats.slowRenders.shift();
            }
        }

        // Critical alert if processing is very slow
        if (batchTime > 500) {
            console.error(`[Handler Perf] CRITICAL: Batch handler took ${batchTime.toFixed(2)}ms - browser may be freezing!`, {
                buffer,
                messageCount: messages.length,
                pendingCount: pendingRenders[buffer].length,
                stats: {
                    avgTime: (handlerPerfStats.totalRenderTime / handlerPerfStats.batchesProcessed).toFixed(2) + 'ms',
                    maxTime: handlerPerfStats.maxRenderTime.toFixed(2) + 'ms',
                    slowRenders: handlerPerfStats.slowRenders.length
                }
            });
        }
    }

    /**
     * Schedule a render using requestAnimationFrame
     */
    function scheduleRender(buffer, stats) {
        if (renderScheduled[buffer]) return;
        renderScheduled[buffer] = true;

        requestAnimationFrame(function() {
            renderPendingMessages(buffer, stats);
            renderScheduled[buffer] = false;
        });
    }

    /**
     * Render all pending messages for a buffer in a single DOM update
     */
    function renderPendingMessages(buffer, stats) {
        const renderStartTime = performance.now();
        const messages = pendingRenders[buffer];
        if (messages.length === 0) return;

        const bufferContent = document.getElementById(`buffer-content-${buffer}`);
        if (!bufferContent) {
            pendingRenders[buffer] = [];
            return;
        }

        let tbody = bufferContent.querySelector('table tbody');
        if (!tbody) {
            bufferContent.innerHTML = '';
            const tableWrapper = createTableStructure();
            bufferContent.appendChild(tableWrapper);
            bufferContent.appendChild(createStatsFooter(stats));
            tbody = bufferContent.querySelector('table tbody');
        }

        // Build set of existing message keys for deduplication
        const existingKeys = new Set();
        tbody.querySelectorAll('tr.message-row').forEach(function(row) {
            const ts = row.dataset.timestamp || '';
            const did = row.dataset.deviceId || '';
            if (ts) existingKeys.add(`${ts}:${did}`);
        });

        // Create document fragment for batch DOM insertion
        const fragment = document.createDocumentFragment();
        const rowsToAdd = [];

        // Process messages (newest first in batch)
        messages.forEach(function(msg) {
            const msgKey = `${msg.timestamp || ''}:${msg.device_id || ''}`;
            if (existingKeys.has(msgKey)) return; // Skip duplicates
            existingKeys.add(msgKey);

            const deltaSec = getCallsignDelta(extractMessageInfo(msg).callsign, msg.timestamp);
            const { row, detailRow } = createMessageRowWithDelta(msg, deltaSec);

            if (!matchesSearch(msg, searchTerm)) {
                row.style.display = 'none';
                detailRow.style.display = 'none';
            }

            rowsToAdd.push({ row, detailRow });
        });

        // Insert all rows at once (prepend, newest first)
        for (let i = rowsToAdd.length - 1; i >= 0; i--) {
            fragment.appendChild(rowsToAdd[i].row);
            fragment.appendChild(rowsToAdd[i].detailRow);
        }

        if (tbody.firstChild) {
            tbody.insertBefore(fragment, tbody.firstChild);
        } else {
            tbody.appendChild(fragment);
        }

        // Trim excess rows
        const allRows = tbody.querySelectorAll('tr.message-row');
        while (allRows.length > config.maxDisplayedMessages) {
            const lastRow = allRows[allRows.length - 1];
            const nextRow = lastRow.nextElementSibling;
            if (nextRow) nextRow.remove();
            lastRow.remove();
        }

        // Clear pending and update stats
        pendingRenders[buffer] = [];
        updateStatsFooter(bufferContent, stats);
        updateTabBadge(buffer, stats);

        // Performance monitoring for render
        const renderTime = performance.now() - renderStartTime;
        if (renderTime > 50) {
            console.warn(`[Handler Perf] SLOW render: ${renderTime.toFixed(2)}ms`, {
                buffer,
                rowsAdded: rowsToAdd.length,
                totalRows: tbody.querySelectorAll('tr.message-row').length
            });
        }
    }

    /**
     * Render initial load (full table rebuild)
     */
    function renderInitialLoad(buffer, messages, stats) {
        if (config.debug) {
            console.log(`[Handler] renderInitialLoad: buffer=${buffer}, msgs=${messages ? messages.length : 0}`);
        }
        const bufferContent = document.getElementById(`buffer-content-${buffer}`);
        if (!bufferContent) {
            if (config.debug) console.log(`[Handler] renderInitialLoad: buffer-content-${buffer} not found!`);
            return;
        }

        bufferContent.innerHTML = '';

        if (!messages || messages.length === 0) {
            bufferContent.innerHTML = '<div class="text-center py-3 text-muted"><i class="bi bi-inbox"></i> <span class="small">No messages</span></div>';
            updateTabBadge(buffer, stats);
            return;
        }

        // Deduplicate
        const seenMessages = new Map();
        const uniqueMessages = [];
        messages.forEach(function(msg) {
            const key = `${msg.timestamp || ''}:${msg.device_id || ''}`;
            if (!seenMessages.has(key)) {
                seenMessages.set(key, true);
                uniqueMessages.push(msg);
            }
        });

        const tableWrapper = createTableStructure();
        const tbody = tableWrapper.querySelector('tbody');

        // Build rows with delta calculation
        uniqueMessages.forEach(function(msg, index) {
            const info = extractMessageInfo(msg);
            const key = info.callsign.toLowerCase();

            // Find next older message from same callsign for delta
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

        // Update callsign timestamps
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
            const queueSize = pendingRenders[buffer].length;
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
     * Resume buffer - render queued messages
     */
    function resumeBuffer(buffer) {
        pausedBuffers[buffer] = false;
        const liveBtn = document.getElementById(`live-btn-${buffer}`);
        const pauseBtn = document.getElementById(`pause-btn-${buffer}`);
        if (liveBtn) { liveBtn.classList.remove('btn-outline-success'); liveBtn.classList.add('btn-success', 'active'); }
        if (pauseBtn) { pauseBtn.classList.remove('btn-warning', 'active'); pauseBtn.classList.add('btn-outline-warning'); }

        // Render any queued messages
        if (pendingRenders[buffer].length > 0) {
            scheduleRender(buffer, null);
        }
        updateStreamStatus(buffer);
    }

    /**
     * Format local timestamp
     */
    function formatLocalTimestamp(isoTimestamp) {
        if (!isoTimestamp) return '-';
        try {
            return new Date(isoTimestamp).toLocaleString();
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
            if (config.debug) console.error('[Message Handler] Azure Maps SDK not loaded');
            alert('Map functionality is not available. Please refresh the page.');
            return;
        }

        const modal = document.getElementById('positionMapModal');
        const mapContainer = document.getElementById('position-map-container');
        const infoEl = document.getElementById('position-map-info');
        const deviceIdEl = document.getElementById('position-device-id');

        if (!modal || !mapContainer) return;

        const azureMapsKey = mapContainer.dataset.azureMapsKey;
        if (!azureMapsKey || azureMapsKey.trim() === '') {
            if (infoEl) {
                infoEl.innerHTML = '<span class="text-danger">Azure Maps key not configured.</span>';
            }
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
            return;
        }

        if (deviceIdEl) {
            deviceIdEl.textContent = deviceId || callsign || 'Unknown';
        }

        if (infoEl) {
            const parts = [];
            if (gateway) parts.push(`GW: ${gateway}`);
            if (rssi) parts.push(`RSSI: ${rssi}`);
            if (snr) parts.push(`SNR: ${snr}`);
            if (timestamp) parts.push(`Time: ${formatLocalTimestamp(timestamp)}`);

            const metadata = parts.length > 0 ? parts.join(' · ') : '';
            infoEl.innerHTML = `<strong>${callsign}</strong> @ ${lat.toFixed(5)}, ${lon.toFixed(5)}${metadata ? '<br><small class="text-muted">' + metadata + '</small>' : ''}`;
        }

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        modal.addEventListener('shown.bs.modal', function initMap() {
            modal.removeEventListener('shown.bs.modal', initMap);

            if (positionMapInstance) {
                positionMapInstance.dispose();
                positionMapInstance = null;
            }

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

            positionMapInstance.events.add('ready', function() {
                const dataSource = new atlas.source.DataSource();
                positionMapInstance.sources.add(dataSource);

                const point = new atlas.data.Point([lon, lat]);
                dataSource.add(new atlas.data.Feature(point, { callsign: callsign }));

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

        modal.addEventListener('hide.bs.modal', function blurFocus() {
            if (document.activeElement && modal.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }, { once: true });

        modal.addEventListener('hidden.bs.modal', function cleanup() {
            if (positionMapInstance) {
                positionMapInstance.dispose();
                positionMapInstance = null;
            }
        }, { once: true });
    }

    /**
     * Verify a COT message by correlation_id
     */
    async function verifyMessage(correlationId, button) {
        if (!correlationId) {
            if (config.debug) console.error('[Message Handler] No correlation_id provided for verification');
            return;
        }

        // Get gateway PK from the card element
        const card = button.closest('.card[data-gateway-pk]');
        const gatewayPk = card ? card.dataset.gatewayPk : null;
        if (!gatewayPk) {
            if (config.debug) console.error('[Message Handler] Could not find gateway PK');
            alert('Error: Could not determine gateway ID');
            return;
        }

        // Disable button and show loading state
        const originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Verifying...';

        try {
            const response = await fetch(`/takservers/mqtt/${gatewayPk}/verify/${correlationId}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.verified) {
                // Update button to show success
                button.classList.remove('btn-outline-primary');
                button.classList.add('btn-success');
                button.innerHTML = '<i class="bi bi-check-circle me-1"></i>Verified';
                button.disabled = true;

                // Update the verification status in the detail section
                updateVerificationStatus(correlationId, data);
            } else {
                // Show error
                button.classList.remove('btn-outline-primary');
                button.classList.add('btn-danger');
                button.innerHTML = '<i class="bi bi-x-circle me-1"></i>Not Found';
                setTimeout(function() {
                    button.classList.remove('btn-danger');
                    button.classList.add('btn-outline-primary');
                    button.innerHTML = originalHtml;
                    button.disabled = false;
                }, 3000);
            }
        } catch (error) {
            if (config.debug) console.error('[Message Handler] Verification error:', error);
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-danger');
            button.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i>Error';
            setTimeout(function() {
                button.classList.remove('btn-danger');
                button.classList.add('btn-outline-primary');
                button.innerHTML = originalHtml;
                button.disabled = false;
            }, 3000);
        }
    }

    /**
     * Update verification status display after verification
     */
    function updateVerificationStatus(correlationId, verificationData) {
        // Find all rows with this correlation_id (could be in different buffers)
        const rows = document.querySelectorAll(`tr.message-row[data-correlation-id="${correlationId}"]`);
        rows.forEach(function(row) {
            const detailRow = row.nextElementSibling;
            if (detailRow && detailRow.classList.contains('collapse')) {
                // Find the verification section
                const verifySection = detailRow.querySelector('.verify-btn')?.closest('.mb-3');
                if (verifySection) {
                    // Update the verification status display
                    verifySection.innerHTML = `
                        <h6 class="small fw-bold mb-2">5. TAK Server Verification</h6>
                        <div class="mb-2">
                            <div class="d-flex align-items-center gap-2">
                                <strong>TAK Server Verification:</strong> <span class="badge bg-success">Verified</span>
                            </div>
                            ${verificationData.timestamp ? `<div class="small text-muted mt-1">Verified: ${formatLocalTimestamp(verificationData.timestamp)}</div>` : ''}
                            ${verificationData.method ? `<div class="small text-muted">Method: ${escapeHtml(verificationData.method)}</div>` : ''}
                        </div>
                    `;
                }
            }
        });
    }

    /**
     * Get CSRF token from cookies
     */
    function getCsrfToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue || '';
    }

    /**
     * Switch controls visibility on tab change
     */
    function switchControlsForTab(buffer) {
        // Stream controls (in tab row)
        document.getElementById('stream-controls-mqtt')?.classList.toggle('d-none', buffer !== 'mqtt');
        document.getElementById('stream-controls-tak')?.classList.toggle('d-none', buffer !== 'tak');
        document.getElementById('stream-status-mqtt')?.classList.toggle('d-none', buffer !== 'mqtt');
        document.getElementById('stream-status-tak')?.classList.toggle('d-none', buffer !== 'tak');
        // Forwarding controls (in header)
        document.getElementById('forwarding-controls-mqtt')?.classList.toggle('d-none', buffer !== 'mqtt');
        document.getElementById('forwarding-controls-tak')?.classList.toggle('d-none', buffer !== 'tak');
    }

    /**
     * Initialize
     */
    function init() {
        // Listen for batched messages from WebSocket
        document.addEventListener('mqttgateway:batch', handleBatch);

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

        // Tab change
        document.querySelectorAll('[data-bs-toggle="tab"][data-buffer]').forEach(function(tab) {
            tab.addEventListener('shown.bs.tab', function(event) {
                const buffer = event.target.dataset.buffer;
                if (buffer) switchControlsForTab(buffer);
            });
        });

        // Position map button handlers
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

            // Verify button handlers
            const verifyBtn = event.target.closest('.verify-btn');
            if (verifyBtn) {
                event.preventDefault();
                event.stopPropagation();
                const correlationId = verifyBtn.dataset.correlationId;
                if (correlationId) {
                    verifyMessage(correlationId, verifyBtn);
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
