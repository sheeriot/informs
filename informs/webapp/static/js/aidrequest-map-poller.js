const pollerConfig = {
    debug: false,
};

document.addEventListener('DOMContentLoaded', function() {
    const configElement = document.getElementById('aid-request-config');
    if (!configElement) {
        if (pollerConfig.debug) console.error('[MapPoller] Config element not found.');
        return;
    }

    const checkMapStatusUrl = configElement.dataset.urlCheckMapStatus;
    if (!checkMapStatusUrl) {
        if (pollerConfig.debug) console.log('[MapPoller] No map status URL found, poller will not run.');
        return;
    }

    function pollForMap(locationId, retries = 3, delay = 3000) {
        if (retries <= 0) {
            if (pollerConfig.debug) console.error(`[MapPoll] Stopped polling for map ${locationId} after max retries.`);
            const mapArea = document.getElementById(`map-area-${locationId}`);
            if(mapArea) {
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

        if (pollerConfig.debug) console.log(`[MapPoll] Checking map for location ${locationId}. Retries left: ${retries}`);
        const url = checkMapStatusUrl.replace('0', locationId);

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'ready') {
                    if (pollerConfig.debug) console.log(`[MapPoll] Map is ready for ${locationId}.`);
                    const mapArea = document.getElementById(`map-area-${locationId}`);
                    if (mapArea && data.map_html) {
                        mapArea.innerHTML = data.map_html;
                    }
                } else {
                    setTimeout(() => pollForMap(locationId, retries - 1, delay), delay);
                }
            })
            .catch(error => console.error(`[MapPoll] Error for location ${locationId}:`, error));
    }

    function checkAndPollCard(card) {
        const locationIdMatch = card.id.match(/al(\d+)-loc/);
        if (!locationIdMatch) return;
        const locationId = locationIdMatch[1];

        const mapArea = card.querySelector(`#map-area-${locationId}`);
        if (!mapArea || mapArea.querySelector('img')) {
            return;
        }

        const statusBadge = card.querySelector('.location-status-badge');
        const status = statusBadge ? statusBadge.textContent.trim().toLowerCase() : '';

        if (status === 'new') {
            if (pollerConfig.debug) console.log(`[Polling] Card for location ${locationId} is 'new' and has no map. Starting poll.`);
            pollForMap(locationId);
        }
    }

    function initializeMapPolling() {
        const locationCards = document.querySelectorAll('.card[id*="-loc"]');
        locationCards.forEach(card => {
            checkAndPollCard(card);
        });
        if (pollerConfig.debug) console.log('[MapPoller] Initialized map polling for existing locations.');
    }

    // Make functions globally accessible
    window.pollForMap = pollForMap;
    window.checkAndPollCard = checkAndPollCard;

    // Run initialization
    initializeMapPolling();
});
