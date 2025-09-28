// informs/webapp/static/js/map-poller.js

const mapPollerConfig = {
    debug: true,
};

function pollForMap(locationId, checkMapStatusUrl) {
    let retries = 5;
    const delay = 3000;

    if (mapPollerConfig.debug) console.log(`[MapPoller] Starting poll for location ${locationId} with URL ${checkMapStatusUrl}`);

    function poll() {
        if (retries <= 0) {
            if (mapPollerConfig.debug) console.error(`[MapPoll] Stopped polling for map ${locationId} after max retries.`);
            const mapArea = document.getElementById(`map-area-${locationId}`);
            if (mapArea) {
                mapArea.innerHTML = `
                    <div class="text-center p-3">
                        <p class="text-danger small mb-2">Map generation timed out.</p>
                        <button type="button" class="btn btn-sm btn-light generate-map-btn" title="Generate Map" data-location-id="${locationId}" data-action="remap">
                            <i class="bi bi-arrow-clockwise"></i> Generate Map
                        </button>
                    </div>
                `;
            }
            return;
        }

        if (mapPollerConfig.debug) console.log(`[MapPoll] Checking map for location ${locationId}. Retries left: ${retries}`);

        if (!checkMapStatusUrl || typeof checkMapStatusUrl.replace !== 'function') {
            if (mapPollerConfig.debug) console.error(`[MapPoll] Invalid checkMapStatusUrl provided:`, checkMapStatusUrl);
            return;
        }
        const url = checkMapStatusUrl.replace('/0/', `/${locationId}/`);
        if (mapPollerConfig.debug) console.log(`[MapPoll] Fetching URL: ${url}`);

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok, status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (mapPollerConfig.debug) console.log(`[MapPoll] Received data for location ${locationId}:`, data);
                if (data.status === 'ready') {
                    if (mapPollerConfig.debug) console.log(`[MapPoll] Map is ready for ${locationId}.`);
                    const mapArea = document.getElementById(`map-area-${locationId}`);
                    if (mapArea && data.map_html) {
                        mapArea.innerHTML = data.map_html;
                    }
                } else {
                    retries--;
                    if (mapPollerConfig.debug) console.log(`[MapPoll] Map not ready for ${locationId}. Retrying in ${delay / 1000}s.`);
                    setTimeout(poll, delay);
                }
            })
            .catch(error => {
                console.error(`[MapPoll] Error for location ${locationId}:`, error);
                retries = 0; // Stop polling on error
            });
    }

    poll();
}

function pollForMapCard(card, checkMapStatusUrl) {
    const locationIdMatch = card.id.match(/al(\d+)-loc/);
    if (!locationIdMatch) return;
    const locationId = locationIdMatch[1];

    const mapArea = card.querySelector(`#map-area-${locationId}`);
    if (!mapArea || mapArea.querySelector('img')) {
        return; // Map already exists or no map area
    }

    const statusBadge = card.querySelector('.location-status-badge');
    const status = statusBadge ? statusBadge.textContent.trim().toLowerCase() : '';

    if (status === 'new' || status === 'confirmed') {
        if (mapPollerConfig.debug) console.log(`[Polling] Card for location ${locationId} is '${status}' and has no map. Starting poll.`);
        pollForMap(locationId, checkMapStatusUrl);
    }
}

function initializePolling() {
    const configElement = document.getElementById('aid-request-config');
    if (!configElement) {
        if (mapPollerConfig.debug) console.error('[MapPoller] Config element not found.');
        return;
    }

    const checkMapStatusUrl = configElement.dataset.urlCheckMapStatus;
    if (!checkMapStatusUrl) {
        if (mapPollerConfig.debug) console.log('[MapPoller] No map status URL found, poller will not run.');
        return;
    }

    // Case 1: Detail/Update page with multiple location cards
    const locationCards = document.querySelectorAll('.card[id*="-loc"]');
    if (locationCards.length > 0) {
        if (mapPollerConfig.debug) console.log(`[MapPoller] Found ${locationCards.length} location cards. Initializing card polling.`);
        locationCards.forEach(card => {
            pollForMapCard(card, checkMapStatusUrl);
        });
        return; // Done
    }

    // Case 2: Submitted page with a single location
    const locationId = configElement.dataset.locationId;
    if (locationId) {
        if (mapPollerConfig.debug) console.log(`[MapPoller] No cards found. Found single locationId ${locationId}. Initializing direct polling.`);
        pollForMap(locationId, checkMapStatusUrl);
        return; // Done
    }

    if (mapPollerConfig.debug) console.log('[MapPoller] No location cards or single location ID found to poll.');
}

// Make functions globally accessible if needed for dynamic content
window.pollForMap = pollForMap;
window.pollForMapCard = pollForMapCard;

document.addEventListener('DOMContentLoaded', function() {
    initializePolling();
});
