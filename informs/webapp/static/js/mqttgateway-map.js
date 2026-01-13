/**
 * mqttgateway-map.js
 * Handles mesh message selection and Azure Maps display for position messages.
 */

(function() {
    'use strict';

    // Configuration
    const config = {
        debug: false
    };

    // Map instance
    let meshMap = null;
    let meshDataSource = null;
    let meshLayer = null;
    let meshPopup = null;

    /**
     * Parse lat/lon from summary string
     * Handles formats like:
     * - "callsign [device_id] @ gateway_id @ lat, lon"
     * - "callsign @ lat, lon"
     * - "callsign [device_id] @ lat, lon"
     */
    function parsePositionFromSummary(summary) {
        if (!summary) return null;

        // Match pattern: find the last "@ lat, lon" occurrence (coordinates are always last)
        // This handles: "callsign [device_id] @ gateway_id @ lat, lon"
        const match = summary.match(/@\s*([-\d.]+),\s*([-\d.]+)(?:\s|$)/);
        if (match) {
            const lat = parseFloat(match[1]);
            const lon = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
                return { lat, lon };
            }
        }
        return null;
    }

    /**
     * Extract callsign from summary string
     * Handles formats like:
     * - "callsign [device_id] @ gateway_id @ lat, lon"
     * - "callsign @ lat, lon"
     * - "callsign [device_id] @ lat, lon"
     */
    function parseCallsignFromSummary(summary) {
        if (!summary) return 'Unknown';

        // Extract everything before the first "@" (which could be gateway_id or coordinates)
        // Then remove device_id in brackets if present
        const match = summary.match(/^([^@]+?)(?:\s*@|$)/);
        if (match) {
            let callsign = match[1].trim();
            // Remove device_id in brackets: "callsign [device_id]" -> "callsign"
            callsign = callsign.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
            return callsign || 'Unknown';
        }
        return summary.substring(0, 10);
    }

    /**
     * Collect selected position data from checkboxes
     */
    function collectSelectedPositions() {
        const positions = [];
        const checkboxes = document.querySelectorAll('.position-checkbox:checked');

        checkboxes.forEach(checkbox => {
            const summary = checkbox.dataset.summary;
            const timestamp = checkbox.dataset.timestamp;
            const position = parsePositionFromSummary(summary);

            // Get device_id and gateway_id from row data attributes if available
            const row = checkbox.closest('tr');
            const deviceId = row ? row.dataset.deviceId || null : null;
            const gatewayId = row ? row.dataset.gatewayId || null : null;

            if (position) {
                positions.push({
                    lat: position.lat,
                    lon: position.lon,
                    callsign: parseCallsignFromSummary(summary),
                    device_id: deviceId,
                    gateway_id: gatewayId,
                    summary: summary,
                    timestamp: timestamp
                });
            }
        });

        return positions;
    }

    /**
     * Update the Map It button state based on selections
     */
    function updateMapItButton() {
        const mapItBtn = document.getElementById('map-it-btn');
        const countBadge = document.getElementById('map-selection-count');

        if (!mapItBtn) return;

        const positions = collectSelectedPositions();
        const count = positions.length;

        mapItBtn.disabled = count === 0;
        if (countBadge) {
            countBadge.textContent = count;
        }
    }

    /**
     * Update select all checkbox state
     */
    function updateSelectAllCheckbox() {
        const selectAll = document.getElementById('select-all-positions');
        if (!selectAll) return;

        const checkboxes = document.querySelectorAll('.position-checkbox');
        const checkedBoxes = document.querySelectorAll('.position-checkbox:checked');

        if (checkboxes.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        } else if (checkedBoxes.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        } else if (checkedBoxes.length === checkboxes.length) {
            selectAll.checked = true;
            selectAll.indeterminate = false;
        } else {
            selectAll.checked = false;
            selectAll.indeterminate = true;
        }
    }

    /**
     * Initialize the Azure Map in the modal
     */
    function initializeMeshMap(positions) {
        const mapContainer = document.getElementById('mesh-map-container');
        if (!mapContainer) {
            console.error('[MeshMap] Map container not found');
            return;
        }

        const azureMapsKey = mapContainer.dataset.azureMapsKey;
        if (!azureMapsKey) {
            console.error('[MeshMap] Azure Maps key not found');
            document.getElementById('map-status-text').textContent = 'Error: Azure Maps key not configured';
            return;
        }

        // Update point count
        const pointCountEl = document.getElementById('modal-point-count');
        if (pointCountEl) {
            pointCountEl.textContent = positions.length + ' point' + (positions.length !== 1 ? 's' : '');
        }

        // Dispose existing map if any
        if (meshMap) {
            meshMap.dispose();
            meshMap = null;
        }

        // Calculate bounds
        let bounds = null;
        if (positions.length > 0) {
            let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
            positions.forEach(p => {
                minLat = Math.min(minLat, p.lat);
                maxLat = Math.max(maxLat, p.lat);
                minLon = Math.min(minLon, p.lon);
                maxLon = Math.max(maxLon, p.lon);
            });
            bounds = [minLon, minLat, maxLon, maxLat];
        }

        // Initialize map
        meshMap = new atlas.Map(mapContainer, {
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: azureMapsKey
            },
            style: 'road',
            zoom: 10,
            center: positions.length > 0 ? [positions[0].lon, positions[0].lat] : [-98.5795, 39.8283]
        });

        meshMap.events.add('ready', function() {
            // Add controls
            meshMap.controls.add([
                new atlas.control.ZoomControl(),
                new atlas.control.StyleControl({
                    mapStyles: ['road', 'satellite_road_labels', 'grayscale_dark']
                })
            ], { position: 'top-left' });

            meshMap.controls.add(new atlas.control.ScaleControl(), { position: 'bottom-left' });

            // Create data source
            meshDataSource = new atlas.source.DataSource();
            meshMap.sources.add(meshDataSource);

            // Add points
            positions.forEach((pos, index) => {
                const point = new atlas.data.Feature(
                    new atlas.data.Point([pos.lon, pos.lat]),
                    {
                        callsign: pos.callsign,
                        device_id: pos.device_id || null,
                        gateway_id: pos.gateway_id || null,
                        summary: pos.summary,
                        timestamp: pos.timestamp,
                        index: index
                    }
                );
                meshDataSource.add(point);
            });

            // Create symbol layer
            meshLayer = new atlas.layer.SymbolLayer(meshDataSource, 'mesh-positions', {
                iconOptions: {
                    image: 'marker-blue',
                    allowOverlap: true,
                    ignorePlacement: true,
                    anchor: 'bottom'
                },
                textOptions: {
                    textField: ['get', 'callsign'],
                    anchor: 'top',
                    offset: [0, 0.5],
                    color: '#000',
                    haloColor: '#fff',
                    haloWidth: 1,
                    size: 11,
                    allowOverlap: true,
                    ignorePlacement: true,
                    font: ['SegoeUi-Bold']
                }
            });

            meshMap.layers.add(meshLayer);

            // Create popup
            meshPopup = new atlas.Popup({
                pixelOffset: [0, -30],
                closeButton: true
            });

            // Click handler for markers
            meshMap.events.add('click', meshLayer, function(e) {
                if (e.shapes && e.shapes.length > 0) {
                    const props = e.shapes[0].getProperties();
                    const coords = e.shapes[0].getCoordinates();

                    let deviceInfo = '';
                    if (props.device_id) {
                        deviceInfo += `<div class="text-muted mb-1 small">
                            <i class="bi bi-cpu me-1"></i>Device: <code>${props.device_id}</code>
                        </div>`;
                    }
                    if (props.gateway_id) {
                        deviceInfo += `<div class="text-muted mb-1 small">
                            <i class="bi bi-router me-1"></i>Gateway: <code>${props.gateway_id}</code>
                        </div>`;
                    }

                    const content = `
                        <div style="padding: 10px; min-width: 200px;">
                            <h6 class="mb-2"><i class="bi bi-geo-alt me-1"></i>${props.callsign}</h6>
                            <div class="small">
                                ${deviceInfo}
                                <div class="text-muted mb-1">
                                    <i class="bi bi-clock me-1"></i>${props.timestamp ? props.timestamp.substring(0, 19) : 'N/A'}
                                </div>
                                <div class="font-monospace">
                                    ${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}
                                </div>
                            </div>
                        </div>
                    `;

                    meshPopup.setOptions({
                        content: content,
                        position: coords
                    });
                    meshPopup.open(meshMap);
                }
            });

            // Cursor change on hover
            meshMap.events.add('mouseenter', meshLayer, function() {
                meshMap.getCanvasContainer().style.cursor = 'pointer';
            });
            meshMap.events.add('mouseleave', meshLayer, function() {
                meshMap.getCanvasContainer().style.cursor = 'grab';
            });

            // Fit bounds
            if (bounds) {
                // Add padding for single point
                if (positions.length === 1) {
                    const padding = 0.01;
                    bounds = [
                        bounds[0] - padding,
                        bounds[1] - padding,
                        bounds[2] + padding,
                        bounds[3] + padding
                    ];
                }
                meshMap.setCamera({
                    bounds: bounds,
                    padding: 50
                });
            }

            document.getElementById('map-status-text').textContent =
                'Showing ' + positions.length + ' position' + (positions.length !== 1 ? 's' : '');
        });

        meshMap.events.add('error', function(e) {
            console.error('[MeshMap] Map error:', e.error);
            document.getElementById('map-status-text').textContent = 'Map error: ' + e.error;
        });
    }

    /**
     * Fit map to all points
     */
    function fitMapToBounds() {
        if (!meshMap || !meshDataSource) return;

        const shapes = meshDataSource.getShapes();
        if (shapes.length === 0) return;

        const bounds = atlas.data.BoundingBox.fromData(shapes);
        meshMap.setCamera({
            bounds: bounds,
            padding: 50
        });
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Use event delegation for dynamically loaded content
        document.addEventListener('change', function(e) {
            if (e.target.classList.contains('position-checkbox')) {
                updateMapItButton();
                updateSelectAllCheckbox();
            }

            if (e.target.id === 'select-all-positions') {
                const checkboxes = document.querySelectorAll('.position-checkbox');
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                });
                updateMapItButton();
            }
        });

        // Modal show event - initialize map with selected positions
        const meshMapModal = document.getElementById('meshMapModal');
        if (meshMapModal) {
            meshMapModal.addEventListener('shown.bs.modal', function() {
                const positions = collectSelectedPositions();
                if (positions.length > 0) {
                    initializeMeshMap(positions);
                } else {
                    document.getElementById('map-status-text').textContent = 'No positions selected';
                }
            });

            meshMapModal.addEventListener('hidden.bs.modal', function() {
                // Clean up map on modal close
                if (meshMap) {
                    meshMap.dispose();
                    meshMap = null;
                }
            });
        }

        // Fit bounds button
        const fitBoundsBtn = document.getElementById('fit-bounds-btn');
        if (fitBoundsBtn) {
            fitBoundsBtn.addEventListener('click', fitMapToBounds);
        }

        // Re-initialize after HTMX content swap
        document.body.addEventListener('htmx:afterSwap', function(e) {
            if (e.detail.target.id === 'buffer-content-mqtt') {
                updateMapItButton();
                updateSelectAllCheckbox();
            }
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupEventListeners);
    } else {
        setupEventListeners();
    }

})();
