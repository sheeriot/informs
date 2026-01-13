/**
 * mqttgateway-message-detail.js
 * Handles message detail modal population and interactions.
 */

(function() {
    'use strict';

    // Configuration
    const config = {
        debug: false
    };

    /**
     * Format timestamp for display
     */
    function formatTimestamp(timestamp) {
        if (!timestamp) return '-';
        try {
            const date = new Date(timestamp);
            return date.toLocaleString();
        } catch (e) {
            return timestamp;
        }
    }

    /**
     * Format message type badge
     */
    function formatMessageType(msgType) {
        const typeMap = {
            'position': '<span class="badge bg-primary"><i class="bi bi-geo-alt"></i> Position</span>',
            'text': '<span class="badge bg-secondary"><i class="bi bi-chat"></i> Text</span>',
            'chat': '<span class="badge bg-warning text-dark"><i class="bi bi-chat-dots"></i> Chat</span>',
            'nodeinfo': '<span class="badge bg-info"><i class="bi bi-info-circle"></i> Node Info</span>',
            'telemetry': '<span class="badge bg-success"><i class="bi bi-speedometer2"></i> Telemetry</span>'
        };
        return typeMap[msgType] || `<span class="badge bg-light text-dark"><i class="bi bi-question"></i> ${msgType || 'Unknown'}</span>`;
    }

    /**
     * Format source badge
     */
    function formatSource(source) {
        if (source === 'mqtt') {
            return '<span class="badge bg-info"><i class="bi bi-broadcast"></i> MQTT</span>';
        } else if (source === 'tak') {
            return '<span class="badge bg-success"><i class="bi bi-hdd-rack"></i> TAK</span>';
        }
        return source || '-';
    }

    /**
     * Format coordinates
     */
    function formatCoordinates(lat, lon) {
        if (lat === null || lon === null || lat === undefined || lon === undefined) {
            return '-';
        }
        return `${parseFloat(lat).toFixed(5)}, ${parseFloat(lon).toFixed(5)}`;
    }

    /**
     * Format distance
     */
    function formatDistance(distanceKm, distanceM) {
        if (distanceKm === null || distanceKm === undefined) {
            return '<span class="text-muted">-</span>';
        }
        if (distanceKm < 1) {
            return `<span class="badge bg-info-subtle text-dark">${Math.round(distanceM)}m</span>`;
        } else if (distanceKm < 10) {
            return `<span class="badge bg-info-subtle text-dark">${distanceKm.toFixed(2)}km</span>`;
        } else {
            return `<span class="badge bg-info-subtle text-dark">${Math.round(distanceKm)}km</span>`;
        }
    }

    /**
     * Format JSON payload for display
     */
    function formatPayload(payloadJson) {
        if (!payloadJson) return '-';
        try {
            // The payload comes as a JSON string in the data attribute
            // It may be double-encoded, so try parsing twice if needed
            let payload = payloadJson;
            if (typeof payloadJson === 'string') {
                // Try parsing once
                try {
                    payload = JSON.parse(payloadJson);
                } catch (e1) {
                    // If that fails, it might already be an object (from HTMX)
                    payload = payloadJson;
                }
            }
            // If it's still a string, try parsing again
            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload);
                } catch (e2) {
                    // If all parsing fails, return as-is
                    return payload;
                }
            }
            return JSON.stringify(payload, null, 2);
        } catch (e) {
            console.error('[Message Detail] Payload format error:', e, payloadJson);
            return String(payloadJson);
        }
    }

    /**
     * Generate Google Maps link
     */
    function generateMapLink(lat, lon) {
        if (!lat || !lon) return '#';
        return `https://www.google.com/maps?q=${lat},${lon}`;
    }

    /**
     * Populate modal with message data
     */
    function populateModal(button) {
        const timestamp = button.getAttribute('data-timestamp') || '-';
        const source = button.getAttribute('data-source') || '-';
        const msgType = button.getAttribute('data-msg-type') || '-';
        const summary = button.getAttribute('data-summary') || '-';
        const topic = button.getAttribute('data-topic') || '-';
        const latitude = button.getAttribute('data-latitude');
        const longitude = button.getAttribute('data-longitude');
        const distanceKm = button.getAttribute('data-distance-km');
        const distanceM = button.getAttribute('data-distance-m');
        const payloadJson = button.getAttribute('data-payload-json') || '{}';

        // Basic info
        document.getElementById('detail-timestamp').textContent = formatTimestamp(timestamp);
        document.getElementById('detail-type').innerHTML = formatMessageType(msgType);
        document.getElementById('detail-source').innerHTML = formatSource(source);
        document.getElementById('detail-topic').textContent = topic || '-';
        document.getElementById('detail-summary').textContent = summary || '-';

        // Location info
        const locationSection = document.getElementById('location-section');
        if (latitude && longitude) {
            locationSection.style.display = 'block';
            document.getElementById('detail-coordinates').textContent = formatCoordinates(latitude, longitude);
            document.getElementById('detail-distance').innerHTML = formatDistance(
                distanceKm ? parseFloat(distanceKm) : null,
                distanceM ? parseFloat(distanceM) : null
            );
            const mapLink = document.getElementById('detail-map-link');
            mapLink.href = generateMapLink(latitude, longitude);
        } else {
            locationSection.style.display = 'none';
        }

        // Payload
        const payloadElement = document.getElementById('detail-payload');
        const codeElement = payloadElement.querySelector('code');
        codeElement.textContent = formatPayload(payloadJson);
    }

    /**
     * Initialize event listeners
     */
    function init() {
        // Listen for modal show event
        const modal = document.getElementById('messageDetailModal');
        if (modal) {
            modal.addEventListener('show.bs.modal', function(event) {
                // Find the button that triggered the modal
                const button = event.relatedTarget;
                if (button && button.classList.contains('message-detail-btn')) {
                    populateModal(button);
                }
            });
        }

    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
