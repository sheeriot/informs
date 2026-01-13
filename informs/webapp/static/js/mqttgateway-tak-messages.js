/**
 * mqttgateway-tak-messages.js
 * Handles TAK message enhancements: Azure Map popups and CallSign filtering
 */

(function() {
    'use strict';

    const config = {
        debug: false
    };

    // Map popup instance
    let mapPopup = null;
    let mapInstance = null;
    let positionDataSource = null;
    let positionLayer = null;

    /**
     * Get Azure Maps key from page
     */
    function getAzureMapsKey() {
        // Try multiple selectors to find the key
        const selectors = [
            '[data-azure-maps-key]',
            '#tak-message-map-popup[data-azure-maps-key]',
            '.bg-light.border-bottom[data-azure-maps-key]'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.dataset.azureMapsKey) {
                return el.dataset.azureMapsKey;
            }
        }
        return null;
    }

    /**
     * Initialize Azure Map popup for position messages
     */
    function initMapPopup() {
        if (!window.atlas) {
            return false;
        }

        // Get Azure Maps key from page
        const azureMapsKey = getAzureMapsKey();
        if (!azureMapsKey) {
            return false;
        }

        // Create popup container (hidden initially)
        let popupContainer = document.getElementById('tak-message-map-popup');
        if (!popupContainer) {
            popupContainer = document.createElement('div');
            popupContainer.id = 'tak-message-map-popup';
            popupContainer.className = 'position-fixed bg-white border shadow-lg rounded';
            popupContainer.style.cssText = 'width: 500px; height: 400px; z-index: 9999; display: none;';
            popupContainer.setAttribute('data-azure-maps-key', azureMapsKey);
            popupContainer.innerHTML = `
                <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
                    <strong class="small">Position Map</strong>
                    <button type="button" class="btn-close btn-close-sm" id="close-map-popup"></button>
                </div>
                <div id="tak-map-container" style="width: 100%; height: calc(100% - 40px);"></div>
            `;
            document.body.appendChild(popupContainer);

            // Close button handler
            document.getElementById('close-map-popup').addEventListener('click', closeMapPopup);
        }

        // Initialize map when first needed
        if (!mapInstance) {
            const mapContainer = document.getElementById('tak-map-container');
            if (!mapContainer) {
                return false;
            }

            mapInstance = new atlas.Map('tak-map-container', {
                authOptions: {
                    authType: 'subscriptionKey',
                    subscriptionKey: azureMapsKey
                },
                style: 'road',
                zoom: 15,
                showFeedbackLink: false,
                showLogo: false
            });

            mapInstance.events.add('ready', function() {
                // Create reusable data source
                positionDataSource = new atlas.source.DataSource();
                mapInstance.sources.add(positionDataSource);
            });
        }

        return true;
    }

    /**
     * Show map popup for a position
     */
    function showMapPopup(lat, lon, callsign) {
        if (!mapInstance) {
            const initialized = initMapPopup();
            if (!initialized || !mapInstance) {
                alert('Map not available. Please check Azure Maps configuration.');
                return;
            }
        }

        const popupContainer = document.getElementById('tak-message-map-popup');
        if (!popupContainer) {
            return;
        }

        // Ensure map is ready
        if (!mapInstance.getMapStyle()) {
            mapInstance.events.addOnce('ready', function() {
                showMapPopup(lat, lon, callsign);
            });
            return;
        }

        // Ensure data source exists
        if (!positionDataSource) {
            positionDataSource = new atlas.source.DataSource();
            mapInstance.sources.add(positionDataSource);
        }

        // Set map center
        mapInstance.setCamera({
            center: [lon, lat],
            zoom: 15
        });

        // Remove existing layer if present
        if (positionLayer) {
            mapInstance.layers.remove(positionLayer);
            positionLayer = null;
        }

        // Clear existing features from data source
        try {
            const shapes = positionDataSource.getShapes();
            if (shapes && shapes.length > 0) {
                shapes.forEach(shape => {
                    try {
                        positionDataSource.remove(shape);
                    } catch (e) {
                        console.error('[TAK Messages] Error removing shape:', e);
                    }
                });
            }
        } catch (e) {
            console.error('[TAK Messages] Error getting shapes:', e);
            // If clearing fails, create new data source
            mapInstance.sources.remove(positionDataSource);
            positionDataSource = new atlas.source.DataSource();
            mapInstance.sources.add(positionDataSource);
        }

        // Add marker
        positionDataSource.add(new atlas.data.Feature(
            new atlas.data.Point([lon, lat]),
            { callsign: callsign || 'Position' }
        ));

        // Add symbol layer
        positionLayer = new atlas.layer.SymbolLayer(positionDataSource, null, {
            iconOptions: {
                image: 'pin-blue',
                anchor: 'center'
            },
            textOptions: {
                textField: ['get', 'callsign'],
                offset: [0, -2],
                color: '#000',
                haloColor: '#fff',
                haloWidth: 1
            }
        });
        mapInstance.layers.add(positionLayer);

        // Position popup near center of screen
        const rect = document.body.getBoundingClientRect();
        popupContainer.style.display = 'block';
        popupContainer.style.left = `${rect.width / 2 - 250}px`;
        popupContainer.style.top = `${rect.height / 2 - 200}px`;
    }

    /**
     * Close map popup
     */
    function closeMapPopup() {
        const popupContainer = document.getElementById('tak-message-map-popup');
        if (popupContainer) {
            popupContainer.style.display = 'none';
        }
    }

    /**
     * Handle position map button clicks
     */
    function handlePositionMapClick(e) {
        // Check if click is on button or badge/icon inside button
        let btn = e.target.closest('.position-map-btn');

        // If not found, check if click is on badge/icon that's inside a button
        if (!btn) {
            const badge = e.target.closest('.badge');
            if (badge) {
                btn = badge.closest('.position-map-btn');
            }
        }

        // Also check if click is directly on icon
        if (!btn && e.target.classList.contains('bi-geo-alt')) {
            btn = e.target.closest('.position-map-btn');
        }

        if (!btn) {
            return; // Not a position map button click
        }

        e.preventDefault();
        e.stopPropagation();

        const lat = parseFloat(btn.dataset.latitude);
        const lon = parseFloat(btn.dataset.longitude);
        const callsign = btn.dataset.callsign || '';

        if (isNaN(lat) || isNaN(lon)) {
            return;
        }

        showMapPopup(lat, lon, callsign);
    }

    /**
     * Initialize CallSign filter
     */
    function initCallSignFilter() {
        const header = document.querySelector('.callsign-filter-header');
        if (!header) return;

        // Collect unique callsigns
        const callsigns = new Set();
        document.querySelectorAll('[data-callsign]').forEach(el => {
            const cs = el.dataset.callsign;
            if (cs) callsigns.add(cs);
        });

        if (callsigns.size === 0) return;

        // Create filter dropdown
        let filterDropdown = document.getElementById('callsign-filter-dropdown');
        if (!filterDropdown) {
            filterDropdown = document.createElement('div');
            filterDropdown.id = 'callsign-filter-dropdown';
            filterDropdown.className = 'position-absolute bg-white border shadow-lg rounded p-2';
            filterDropdown.style.cssText = 'z-index: 1000; max-height: 300px; overflow-y: auto; display: none;';
            document.body.appendChild(filterDropdown);
        }

        // Build checkbox list
        const sortedCallsigns = Array.from(callsigns).sort();
        filterDropdown.innerHTML = `
            <div class="small mb-2">
                <strong>Filter by CallSign:</strong>
                <button type="button" class="btn btn-sm btn-link p-0 ms-2" id="select-all-callsigns">Select All</button>
                <button type="button" class="btn btn-sm btn-link p-0" id="clear-all-callsigns">Clear</button>
            </div>
            ${sortedCallsigns.map(cs => `
                <div class="form-check">
                    <input class="form-check-input callsign-filter-checkbox" type="checkbox"
                           value="${cs}" id="filter-${cs.replace(/[^a-zA-Z0-9]/g, '-')}" checked>
                    <label class="form-check-label small" for="filter-${cs.replace(/[^a-zA-Z0-9]/g, '-')}">
                        ${cs}
                    </label>
                </div>
            `).join('')}
        `;

        // Header click handler
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const rect = header.getBoundingClientRect();
            filterDropdown.style.display = filterDropdown.style.display === 'none' ? 'block' : 'none';
            filterDropdown.style.left = `${rect.left}px`;
            filterDropdown.style.top = `${rect.bottom + 5}px`;
        });

        // Filter change handler
        filterDropdown.addEventListener('change', function(e) {
            if (e.target.classList.contains('callsign-filter-checkbox')) {
                applyCallSignFilter();
            }
        });

        // Select all / Clear handlers
        document.getElementById('select-all-callsigns')?.addEventListener('click', function() {
            filterDropdown.querySelectorAll('.callsign-filter-checkbox').forEach(cb => cb.checked = true);
            applyCallSignFilter();
        });

        document.getElementById('clear-all-callsigns')?.addEventListener('click', function() {
            filterDropdown.querySelectorAll('.callsign-filter-checkbox').forEach(cb => cb.checked = false);
            applyCallSignFilter();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!header.contains(e.target) && !filterDropdown.contains(e.target)) {
                filterDropdown.style.display = 'none';
            }
        });
    }

    /**
     * Apply CallSign filter
     */
    function applyCallSignFilter() {
        const checked = Array.from(document.querySelectorAll('.callsign-filter-checkbox:checked'))
            .map(cb => cb.value);

        document.querySelectorAll('.message-row').forEach(row => {
            const callsign = row.dataset.callsign || '';
            if (checked.length === 0 || checked.includes(callsign)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /**
     * Initialize all features
     */
    function init() {
        // Initialize map popup
        initMapPopup();

        // Handle position map button clicks - use capture phase to catch events early
        document.addEventListener('click', handlePositionMapClick, true);

        // Initialize CallSign filter
        initCallSignFilter();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Reinitialize after HTMX swaps
    document.body.addEventListener('htmx:afterSwap', function(event) {
        if (event.detail.target.id && event.detail.target.id.startsWith('buffer-content-')) {
            // Reattach position map button handler
            // Remove old listener and add new one
            document.removeEventListener('click', handlePositionMapClick, true);
            document.addEventListener('click', handlePositionMapClick, true);

            // Reinitialize CallSign filter
            initCallSignFilter();
        }
    });

})();
