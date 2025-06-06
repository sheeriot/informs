/**
 * map_aidrequests.js
 *
 * Handles map initialization and display of aid request locations
 * Provides interactive map functionality for aid request visualization
 */

// Global map variable
let map;
let layersByType = {};  // Store layers by aid type

// Configuration
const mapRequestsConfig = {
    debug: true,  // Set to false in production
    initialized: false,
    config: null,
    aidLocations: [],
    aidTypesConfig: {},
    mapReady: false,  // Track map ready state
    performance: {    // Track timing metrics
        loadStart: null,
        configLoaded: null,
        mapInitialized: null,
        fullyReady: null
    }
};

// Load configuration and data
function loadMapConfiguration() {
    if (mapRequestsConfig.debug) {
        console.time('map-config-load');
        console.log('[Map] Loading configuration START');
    }
    mapRequestsConfig.performance.loadStart = performance.now();

    const mapContainer = document.getElementById('aid-request-map');
    if (!mapContainer) {
        console.error('[Map] CRITICAL: Map container (aid-request-map) not found in DOM.');
        throw new Error('Map container not found');
    }
    if (mapRequestsConfig.debug) {
        console.log('[Map] mapContainer found. Dataset:', JSON.parse(JSON.stringify(mapContainer.dataset)));
    }

    // Debug log raw dataset values
    if (mapRequestsConfig.debug) {
        console.log('[Map] Raw dataset values from mapContainer:', {
            azureMapsKey: mapContainer.dataset.azureMapsKey,
            boundsWest: mapContainer.dataset.boundsWest,
            boundsSouth: mapContainer.dataset.boundsSouth,
            boundsEast: mapContainer.dataset.boundsEast,
            boundsNorth: mapContainer.dataset.boundsNorth,
            centerLat: mapContainer.dataset.centerLat,
            centerLon: mapContainer.dataset.centerLon,
            allDataset: mapContainer.dataset
        });
    }

    // Robustly parse ringSize, ensuring it's a positive number.
    const rawRingSize = mapContainer.dataset.ringSize;
    let parsedRingSize = parseFloat(rawRingSize);
    const defaultRingSize = 10; // km
    const finalRingSize = (isNaN(parsedRingSize) || parsedRingSize <= 0) ? defaultRingSize : parsedRingSize;

    // Get configuration from data attributes
    const config = {
        key: mapContainer.dataset.azureMapsKey,
        bounds: [
            parseFloat(mapContainer.dataset.boundsWest),   // minLon
            parseFloat(mapContainer.dataset.boundsSouth),  // minLat
            parseFloat(mapContainer.dataset.boundsEast),   // maxLon
            parseFloat(mapContainer.dataset.boundsNorth)   // maxLat
        ],
        padding: 50,  // Default padding in pixels
        center: [
            parseFloat(mapContainer.dataset.centerLon),
            parseFloat(mapContainer.dataset.centerLat)
        ],
        fieldOpName: mapContainer.dataset.fieldOpName,
        fieldOpSlug: mapContainer.dataset.fieldOpSlug,
        ringSize: finalRingSize // Use validated finalRingSize
    };

    if (!config.key) {
        throw new Error('Azure Maps key not found in data attributes');
    }

    // Load aid locations data EARLY - needed to decide on bounds strategy
    const aidLocationsElement = document.getElementById('aid-locations-data');
    if (aidLocationsElement && aidLocationsElement.textContent.trim()) {
        try {
            mapRequestsConfig.aidLocations = JSON.parse(aidLocationsElement.textContent);
            if (mapRequestsConfig.debug) {
                console.log('[Map] Aid Locations loaded early:', {
                    count: mapRequestsConfig.aidLocations.length,
                    byType: mapRequestsConfig.aidLocations.reduce((acc, loc) => {
                        acc[loc.aid_type.slug] = (acc[loc.aid_type.slug] || 0) + 1;
                        return acc;
                    }, {})
                });
            }
        } catch (error) {
            console.warn('[Map] Error parsing aid locations data, proceeding with empty list:', error.message);
            mapRequestsConfig.aidLocations = []; // Default to empty list on error
        }
    } else {
        if (mapRequestsConfig.debug) {
            console.log('[Map] No aid-locations-data element found or it is empty. Defaulting to empty aid locations list.');
        }
        mapRequestsConfig.aidLocations = []; // Default to empty list if element not found or empty
    }

    // Fallback bounds logic:
    // If original bounds from dataset are invalid, or if there are too few aid locations,
    // calculate new bounds based on field op center and ring size.
    let originalBoundsFromDataset = [...config.bounds]; // Keep a copy for logging
    let useFallbackBounds = false;
    const areOriginalDatasetBoundsInvalid = originalBoundsFromDataset.some(isNaN) || originalBoundsFromDataset.every(val => val === 0);

    if (areOriginalDatasetBoundsInvalid || mapRequestsConfig.aidLocations.length <= 1) {
        useFallbackBounds = true;
        if (mapRequestsConfig.debug) {
            console.log('[Map] Using fallback bounds calculation.', {
                reason: areOriginalDatasetBoundsInvalid ? "Original dataset bounds invalid" : "Not enough aid locations (<=1)",
                originalDatasetBounds: originalBoundsFromDataset,
                aidLocationCount: mapRequestsConfig.aidLocations.length,
                fieldOpCenter: config.center,
                fieldOpRingSizeKm: config.ringSize
            });
        }

        // Validate center and ringSize before using them for fallback
        if (isNaN(config.center[0]) || isNaN(config.center[1])) {
            console.error('[Map] CRITICAL: Cannot calculate fallback bounds because center coordinates are invalid.', config.center);
            throw new Error('Invalid map center coordinates, cannot calculate fallback bounds.');
        }
        // config.ringSize is already ensured to be positive by `finalRingSize` logic

        const centerLon = config.center[0];
        const centerLat = config.center[1];
        const ringRadiusKm = config.ringSize; // This is already validated to be positive

        // Define a viewable area that includes the ring with some padding
        const viewDiameterPaddingFactor = 2.5; // Makes the view ~2.5x the ring diameter
        const viewRadiusKm = ringRadiusKm * (viewDiameterPaddingFactor / 2);

        const LAT_DEG_PER_KM = 1 / 111.32; // Approximate degrees latitude per km
        const lonDegPerKmAtCenterLat = 1 / (111.32 * Math.cos(centerLat * Math.PI / 180)); // Degrees longitude per km

        const deltaLat = viewRadiusKm * LAT_DEG_PER_KM;
        let deltaLon = viewRadiusKm * lonDegPerKmAtCenterLat;

        // Safety for extreme latitudes where Math.cos approaches 0
        if (Math.abs(centerLat) >= 89) { // Very close to poles
            // For extreme latitudes, longitude span can become excessively large or small.
            // Use a fallback based on latitude delta, assuming roughly square area.
            deltaLon = deltaLat;
            if (mapRequestsConfig.debug) {
                console.warn(`[Map] Center latitude ${centerLat} is very near a pole. Adjusted deltaLon for fallback bounds to ${deltaLon} (approx ${viewRadiusKm}km).`);
            }
        }

        config.bounds = [
            centerLon - deltaLon, // minLon
            centerLat - deltaLat, // minLat
            centerLon + deltaLon, // maxLon
            centerLat + deltaLat  // maxLat
        ];

        if (mapRequestsConfig.debug) {
            console.log('[Map] Calculated new fallback bounds:', JSON.parse(JSON.stringify(config.bounds)));
        }
    }

    // Enhanced bounds validation with detailed logging
    // This `boundsData` captures the state of `config.bounds` AFTER potential fallback.
    const boundsDataForLog = {
        rawFromDataset: { // Keep raw dataset values for context
            west: mapContainer.dataset.boundsWest,
            south: mapContainer.dataset.boundsSouth,
            east: mapContainer.dataset.boundsEast,
            north: mapContainer.dataset.boundsNorth
        },
        initiallyParsedFromDataset: originalBoundsFromDataset, // Bounds as parsed from dataset before fallback
        finalBoundsUsed: config.bounds, // The bounds that will actually be used (dataset or fallback)
        source: useFallbackBounds ? "fallback_calculation" : "dataset"
    };

    if (mapRequestsConfig.debug) {
        console.log('[Map] Bounds data for map initialization:', boundsDataForLog);
    }

    // Validate final `config.bounds` values (these could be from dataset or fallback)
    if (config.bounds.some(isNaN) || config.bounds.every(val => val === 0)) {
        console.error('[Map] CRITICAL: Invalid or missing bounds values after parsing and potential fallback.', {
            logContext: boundsDataForLog, // provides full context
            aidLocationCount: mapRequestsConfig.aidLocations.length
        });
        throw new Error('Invalid or missing map bounds coordinates (post-fallback).');
    }

    // Validate center coordinates
    if (isNaN(config.center[0]) || isNaN(config.center[1])) {
        console.error('[Map] CRITICAL: Invalid center coordinates after parsing:', {
            raw: {
                lon: mapContainer.dataset.centerLon,
                lat: mapContainer.dataset.centerLat
            },
            parsed: config.center
        });
        throw new Error('Invalid map center coordinates');
    }

    // Validate bounds format and values
    const [minLon, minLat, maxLon, maxLat] = config.bounds;

    // Check longitude values are in valid range (-180 to 180)
    if (minLon < -180 || maxLon > 180 || minLon > maxLon) {
        console.error('[Map] Invalid longitude values:', {
            minLon,
            maxLon,
            valid: 'Must be: -180 ≤ minLon ≤ maxLon ≤ 180'
        });
    }

    // Check latitude values are in valid range (-85 to 85 for Web Mercator)
    if (minLat < -85 || maxLat > 85 || minLat > maxLat) {
        console.error('[Map] Invalid latitude values:', {
            minLat,
            maxLat,
            valid: 'Must be: -85 ≤ minLat ≤ maxLat ≤ 85'
        });
    }

    // Calculate spans
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;

    if (mapRequestsConfig.debug) {
        console.log('[Map] Configuration details:', {
            bounds: {
                minLon, minLat, maxLon, maxLat
            },
            spans: {
                lat: latSpan,
                lon: lonSpan
            },
            center: {
                lon: config.center[0],
                lat: config.center[1]
            },
            padding: config.padding
        });
    }

    // Warn if spans seem unreasonably large
    if (latSpan > 10 || lonSpan > 10) {
        console.warn('[Map] Bounds span seems large for a field operation:', {
            latSpan,
            lonSpan,
            suggestion: 'Expected spans of less than 10 degrees for typical field operations'
        });
    }

    // Store configuration
    mapRequestsConfig.config = config;

    // Load aid types configuration
    const aidTypesElement = document.getElementById('aid-types-json');
    if (aidTypesElement) {
        try {
            const aidTypesArray = JSON.parse(aidTypesElement.textContent);
            mapRequestsConfig.aidTypesConfig = aidTypesArray.reduce((acc, type) => {
                acc[type.slug] = type;
                return acc;
            }, {});
            if (mapRequestsConfig.debug) {
                console.log('[Map] Aid Types loaded:', {
                    count: Object.keys(mapRequestsConfig.aidTypesConfig).length,
                    types: Object.keys(mapRequestsConfig.aidTypesConfig)
                });
            }
        } catch (error) {
            throw new Error('Error parsing aid types configuration: ' + error.message);
        }
    }

    mapRequestsConfig.performance.configLoaded = performance.now();
    if (mapRequestsConfig.debug) {
        console.timeEnd('map-config-load');
        console.log('[Map] Configuration load time:',
            (mapRequestsConfig.performance.configLoaded - mapRequestsConfig.performance.loadStart).toFixed(2), 'ms');
        console.log('[Map] Loading configuration END');
    }
}

// Main initialization function
async function initializeMapWithFilter(filterState) {
    if (mapRequestsConfig.debug) {
        console.log('[Map] initializeMapWithFilter START. Initialized already? ', mapRequestsConfig.initialized);
        console.log('[Map] Received filterState for initializeMapWithFilter:', JSON.parse(JSON.stringify(filterState)));
    }

    if (mapRequestsConfig.initialized) {
        if (mapRequestsConfig.debug) console.log('[Map] Already initialized, skipping');
        return;
    }

    try {
        if (mapRequestsConfig.debug) {
            console.time('map-full-init');
            console.log('[Map] Starting full initialization sequence in initializeMapWithFilter.');
            console.log('[Map] Current aidRequestsStore state (if available):', window.aidRequestsStore?.currentState);
        }

        // Load configuration first
        console.log('[Map] Calling loadMapConfiguration...');
        loadMapConfiguration();
        console.log('[Map] loadMapConfiguration complete. mapRequestsConfig.config:', JSON.parse(JSON.stringify(mapRequestsConfig.config)));

        // Initialize the map
        console.log('[Map] Calling initializeMap with config...');
        await initializeMap(mapRequestsConfig.config);
        console.log('[Map] initializeMap complete.');
        mapRequestsConfig.performance.mapInitialized = performance.now();

        // Mark as initialized
        mapRequestsConfig.initialized = true;
        mapRequestsConfig.performance.fullyReady = performance.now();

        // Apply initial filter state and update visibility
        if (filterState) {
            updateLayerVisibility(filterState.filterState, filterState.counts);
        } else if (window.aidRequestsStore?.currentState) {
            // Fallback to store state if available
            updateLayerVisibility(
                window.aidRequestsStore.currentState.filterState,
                window.aidRequestsStore.currentState.counts
            );
        }

        if (mapRequestsConfig.debug) {
            console.timeEnd('map-full-init');
            console.log('[Map] Performance metrics after initializeMapWithFilter:', {
                configLoad: (mapRequestsConfig.performance.configLoaded - mapRequestsConfig.performance.loadStart).toFixed(2) + 'ms',
                mapInit: (mapRequestsConfig.performance.mapInitialized - mapRequestsConfig.performance.configLoaded).toFixed(2) + 'ms',
                total: (mapRequestsConfig.performance.fullyReady - mapRequestsConfig.performance.loadStart).toFixed(2) + 'ms'
            });
        }
    } catch (error) {
        console.error('[Map] CRITICAL: Initialization failed in initializeMapWithFilter:', error);
        if (mapRequestsConfig.debug) {
            console.error('[Map] State at failure in initializeMapWithFilter:', {
                configLoaded: !!mapRequestsConfig.config,
                aidTypesLoaded: Object.keys(mapRequestsConfig.aidTypesConfig).length,
                locationsLoaded: mapRequestsConfig.aidLocations.length,
                filterState: filterState
            });
        }
        throw error;
    }
}

// Wait for DOM and check filter state
document.addEventListener('DOMContentLoaded', function() {
    if (mapRequestsConfig.debug) {
        console.time('map-init-sequence');
        console.log('[Map] DOM ready, checking filter state for map initialization.');
    }

    const initialFilterStateElement = document.getElementById('filter-state-initial');
    let initialFilterData = null;
    if (initialFilterStateElement) {
        try {
            initialFilterData = JSON.parse(initialFilterStateElement.textContent);
            if (mapRequestsConfig.debug) {
                console.log('[Map] Successfully parsed initial_filter_state from DOM:', initialFilterData);
            }
        } catch (e) {
            console.error('[Map] ERROR: Failed to parse initial_filter_state from DOM. Content was:', initialFilterStateElement.textContent, e);
        }
    }

    // Check if filter is already initialized (applies to aid_request_list page)
    if (window.aidRequestsStore?.initialized) {
        if (mapRequestsConfig.debug) {
            console.log('[Map] aidRequestsStore is already initialized. Initializing map with its current state:', JSON.parse(JSON.stringify(window.aidRequestsStore.currentState)));
        }
        initializeMapWithFilter(window.aidRequestsStore.currentState).catch(error => {
            console.error('[Map] CRITICAL: Failed to initialize with existing aidRequestsStore state:', error);
        });
    } else if (initialFilterData) { // For pages like field_op_detail that provide initial state directly
        if (mapRequestsConfig.debug) {
            console.log('[Map] aidRequestsStore not initialized. Using initialFilterData from DOM to initialize map:', JSON.parse(JSON.stringify(initialFilterData)));
        }
        initializeMapWithFilter({ filterState: initialFilterData, counts: {matched: 0, total:0} } ).catch(error => { // Pass a structure similar to store state
            console.error('[Map] CRITICAL: Failed to initialize map with initialFilterData from DOM:', error);
        });
    } else {
        if (mapRequestsConfig.debug) {
            console.warn('[Map] Neither aidRequestsStore initialized nor initialFilterData found. Waiting for aidRequestsFilterReady event (this might not fire on field_op_detail page).');
        }
        // Fallback: Wait for filter initialization event (primarily for aid_request_list page)
        document.addEventListener('aidRequestsFilterReady', function(event) {
            if (mapRequestsConfig.debug) {
                console.timeEnd('map-init-sequence');
                console.log('[Map] Filter ready event received:', {
                    filterState: event.detail,
                    initTime: (performance.now() - mapRequestsConfig.performance.loadStart).toFixed(2) + 'ms'
                });
            }
            initializeMapWithFilter(event.detail).catch(error => {
                console.error('[Map] Failed to initialize with filter event:', error);
            });
        });
    }
});

// Initialize the map with minimum configuration
function initializeMap(config) {
    if (mapRequestsConfig.debug) {
        console.log('[Map] initializeMap START with config:', JSON.parse(JSON.stringify(config)));
    }
    if (!config || !config.key) {
        console.error('[Map] CRITICAL: initializeMap called with invalid or incomplete config. API key missing?', JSON.parse(JSON.stringify(config)));
        return Promise.reject('Invalid map config provided to initializeMap');
    }

    return new Promise((resolve, reject) => {
        try {
            // Initialize map with bounds-based camera
            map = new atlas.Map('aid-request-map', {
                style: 'road',
                view: 'Auto',
                showFeedbackLink: false,
                showLogo: false,
                authOptions: {
                    authType: 'subscriptionKey',
                    subscriptionKey: config.key
                },
                // Properly set camera bounds using CameraBoundsOptions
                cameraBoundsOptions: {
                    bounds: config.bounds,
                    padding: config.padding,
                    maxZoom: 18  // Prevent zooming too far in
                }
            });

            if (mapRequestsConfig.debug) {
                console.log('[Map] Initialized with camera bounds:', {
                    bounds: config.bounds,
                    padding: config.padding,
                });
            }

            // Add zoom control (top-left)
            map.controls.add(new atlas.control.ZoomControl(), {
                position: 'top-left'
            });

            // Add compass control (top-left)
            map.controls.add(new atlas.control.CompassControl(), {
                position: 'top-left'
            });

            // Add style control (top-right)
            map.controls.add(new atlas.control.StyleControl({
                mapStyles: ['road', 'satellite', 'hybrid']
            }), {
                position: 'top-right'
            });

            // Add pitch control (top-right)
            map.controls.add(new atlas.control.PitchControl(), {
                position: 'top-right'
            });

            // Wait for the map to be ready before adding layers
            map.events.add('ready', async function() {
                if (mapRequestsConfig.debug) {
                    console.log('[Map] Map ready event fired. Current map camera:', map.getCamera());
                }

                try {
                    // Set the camera bounds again after map is ready to ensure they're applied
                    if (config.bounds && config.bounds.length === 4 && !config.bounds.some(isNaN)) {
                        map.setCamera({
                            bounds: config.bounds,
                            padding: config.padding || 50
                        });
                         if (mapRequestsConfig.debug) {
                            console.log('[Map] Map ready event: Camera bounds set to:', config.bounds, 'with padding:', config.padding || 50);
                        }
                    } else {
                        console.warn('[Map] Map ready event: Invalid or missing bounds in config, cannot set camera bounds. Config bounds:', config.bounds);
                    }

                    // Initialize field op layer first
                    console.log('[Map] Map ready event: Calling initializeFieldOpLayer...');
                    initializeFieldOpLayer();
                    console.log('[Map] Map ready event: initializeFieldOpLayer complete.');

                    // Then initialize aid request layer
                    console.log('[Map] Map ready event: Calling initializeAidRequestLayer...');
                    await initializeAidRequestLayer();
                    console.log('[Map] Map ready event: initializeAidRequestLayer complete.');

                    if (mapRequestsConfig.debug) {
                        console.log('[Map] All layers initialized in ready event. Final map camera:', map.getCamera());
                    }

                    // Listen for filter changes
                    document.addEventListener('aidRequestsFiltered', function(event) {
                        if (mapRequestsConfig.debug) {
                            console.log('Map View: Filter event received:', event.detail);
                        }

                        if (event.detail && event.detail.filterState) {
                            updateLayerVisibility(event.detail.filterState, event.detail.counts);
                        }
                    });

                    resolve();
                } catch (error) {
                    console.error('[Map] CRITICAL: Error within map ready event handler:', error);
                    reject(error);
                }
            });

            map.events.add('error', function(e) {
                console.error('[Map] CRITICAL: Map error event:', e.error);
                reject(e.error); // Reject the promise on map error
            });

        } catch (error) {
            console.error('[Map] CRITICAL: Error during atlas.Map instantiation in initializeMap:', error);
            reject(error);
        }
    });
}

// Update layer and point visibility based on filter state
function updateLayerVisibility(filterState, counts) {
    if (!map) {
        console.warn('Map View: Map not initialized yet, skipping visibility update');
        return;
    }

    if (mapRequestsConfig.debug) {
        console.log('Map View: Updating visibility with:', {
            filterState,
            counts,
            layerTypes: Object.keys(layersByType)
        });
    }

    // Ensure filterState exists with default values - match aidrequests-filter.js exactly
    filterState = filterState || {
        aid_types: 'all',
        statuses: 'all',
        priorities: 'all'
    };

    // First, handle aid type layer visibility
    Object.entries(layersByType).forEach(([aidType, layer]) => {
        if (!layer) {
            console.warn(`Layer for aid type ${aidType} not found`);
            return;
        }

        try {
            // Get the source for this layer
            const source = layer.getSource();
            if (!source) {
                console.warn(`Source for aid type ${aidType} not found`);
                return;
            }

            // Match exactly how aidrequests-filter.js checks aid types
            const showLayer = filterState.aid_types === 'all' ||
                            (filterState.aid_types && filterState.aid_types.includes(aidType));

            if (mapRequestsConfig.debug) {
                console.log(`Layer ${aidType} visibility check:`, {
                    showLayer,
                    aidType,
                    filterAidTypes: filterState.aid_types,
                    isAll: filterState.aid_types === 'all',
                    included: Array.isArray(filterState.aid_types) ? filterState.aid_types.includes(aidType) : 'n/a'
                });
            }

            // Build filter expression for other filters (status, priority)
            let filterExpr = ['all',
                ['boolean', showLayer],  // Layer visibility based on aid type
                // Status filter - match filter.js logic
                filterState.statuses === 'all' ?
                    ['boolean', true] :
                    ['in', ['get', 'status'], ['literal', filterState.statuses || []]],
                // Priority filter - match filter.js logic
                filterState.priorities === 'all' ?
                    ['boolean', true] :
                    ['in', ['get', 'priority'], ['literal', filterState.priorities || []]]
            ];

            // Set both the filter and visibility
            layer.setOptions({
                filter: filterExpr,
                visible: showLayer  // Explicitly set layer visibility based on aid type
            });

            if (mapRequestsConfig.debug) {
                const totalPoints = source.getShapes().length;
                const visiblePoints = source.getShapes().filter(shape => {
                    if (!showLayer) return false; // If layer is hidden, no points are visible

                    const props = shape.getProperties();
                    let visible = true;

                    // Match filter.js logic for status
                    if (filterState.statuses !== 'all') {
                        visible = visible && filterState.statuses.includes(props.status);
                    }

                    // Match filter.js logic for priority
                    if (filterState.priorities !== 'all') {
                        visible = visible && filterState.priorities.includes(props.priority);
                    }

                    return visible;
                }).length;

                console.log(`Layer ${aidType} visibility result:`, {
                    layerVisible: showLayer,
                    totalPoints,
                    visiblePoints,
                    filterState: {
                        aid_types: filterState.aid_types,
                        statuses: filterState.statuses,
                        priorities: filterState.priorities
                    }
                });
            }

        } catch (error) {
            console.error(`Error updating visibility for layer ${aidType}:`, error);
        }
    });

    // Update map summary card with both filter state and counts
    updateMapSummary(filterState, counts);
}

// Update the map card header with filter summary and counts
function updateMapSummary(filterState, counts) {
    const summaryElement = document.getElementById('map-filter-summary');
    if (!summaryElement) {
        console.warn('Map View: Summary element not found');
        return;
    }

    if (mapRequestsConfig.debug) {
        console.log('Map View: Updating summary with:', {
            filterState,
            counts
        });
    }

    // Build summary text
    const parts = [];
    let visibleCount = counts ? counts.matched : 0;
    let totalCount = counts ? counts.total : 0;

    // Create count element
    const countText = `${visibleCount} of ${totalCount} locations`;

    // Build filter parts - in order: Aid Type, Status, Priority
    if (filterState.aid_types === null) {
        parts.push('Type: None selected');
    } else if (filterState.statuses === null) {
        parts.push('Status: None selected');
    } else if (filterState.priorities === null) {
        parts.push('Priority: None selected');
    } else {
        // Only add other filters if no filter is null

        // 1. Aid Type
        if (filterState.aid_types !== 'all' && Array.isArray(filterState.aid_types) && filterState.aid_types.length > 0) {
            const typeLabels = filterState.aid_types.map(type => {
                if (type === null) {
                    return 'None';
                }
                const config = mapRequestsConfig.aidTypesConfig[type];
                return config ? config.name : type;
            });
            parts.push(`Type: ${typeLabels.join(', ')}`);
        }

        // 2. Status
        if (filterState.statuses !== 'all' && Array.isArray(filterState.statuses) && filterState.statuses.length > 0) {
            const statusLabels = filterState.statuses.map(status => {
                return status.charAt(0).toUpperCase() + status.slice(1);
            });
            parts.push(`Status: ${statusLabels.join(', ')}`);
        }

        // 3. Priority
        if (filterState.priorities !== 'all' && Array.isArray(filterState.priorities) && filterState.priorities.length > 0) {
            const priorityLabels = filterState.priorities.map(p => {
                if (p === null) {
                    return 'None';
                }
                return p.charAt(0).toUpperCase() + p.slice(1);
            });
            parts.push(`Priority: ${priorityLabels.join(', ')}`);
        }
    }

    // Create the summary HTML
    summaryElement.innerHTML = `
        <div class="small text-muted lh-1">
            <div class="mb-1">${countText}</div>
            ${parts.map(part => `<div class="mb-1">${part}</div>`).join('')}
        </div>
    `;

    if (mapRequestsConfig.debug) {
        console.log('Map View: Summary updated:', {
            visibleCount,
            totalCount,
            filters: parts,
            filterState
        });
    }
}

// Helper Functions

// Initialize the field operation layer and ring
function initializeFieldOpLayer() {
    if (mapRequestsConfig.debug) {
        console.log('=== Starting Field Op Layer Initialization ===', {
            center: mapRequestsConfig.config.center,
            ringSize: mapRequestsConfig.config.ringSize,
            config: mapRequestsConfig.config
        });
    }
    // will use 2 layers, one for symbol and one for polygon

    // Create the center position for both field op marker and ring
    const centerPosition = new atlas.data.Position(
        mapRequestsConfig.config.center[0],  // longitude
        mapRequestsConfig.config.center[1]   // latitude
    );

    // First Data Source for the Field Op Center Marker
    const fieldOpCenterSource = new atlas.source.DataSource();
    map.sources.add(fieldOpCenterSource);
    // Create the field op center feature with marker properties
    const foCenter = new atlas.data.Feature(
        new atlas.data.Point(centerPosition),
        {
            name: mapRequestsConfig.config.fieldOpName,
            slug: mapRequestsConfig.config.fieldOpSlug
        }
    );

    if (mapRequestsConfig.debug) {
        console.log('Created field op center:', {
            position: centerPosition,
            properties: foCenter.properties
        });
    }

    fieldOpCenterSource.add(foCenter);

    // Add Symbol Layer for the Field Op Center Marker
    map.layers.add(new atlas.layer.SymbolLayer(
        fieldOpCenterSource,
        'fieldop_center',
        {
            iconOptions: {
                image: 'pin-blue',
                anchor: 'center',
                size: 1.5,
                allowOverlap: true
            },
            textOptions: {
                textField: ['get', 'slug'],
                offset: [0, -2],
                anchor: 'top',
                font: ['StandardFont-Bold'],
                size: 12,
                color: 'black',
                haloColor: 'white',
                haloWidth: 2
            }
        }
    ));
    if (mapRequestsConfig.debug) console.log('Added field op center layer to map');

    // Get ring size from data attribute
    const mapContainer = document.getElementById('aid-request-map');
    const ringSize = parseFloat(mapContainer.dataset.ringSize) || 10; // Default to 10km if not specified

    if (mapRequestsConfig.debug) {
        console.log('Ring configuration:', {
            ringSize: ringSize,
            dataAttribute: mapContainer.dataset.ringSize,
            center: centerPosition
        });
    }

    const fieldOpRingSource = new atlas.source.DataSource();
    map.sources.add(fieldOpRingSource);

    // Create a Ring feature around the field op
    const fieldOpRing = new atlas.data.Feature(
        new atlas.data.Point(centerPosition),
        {
            subType: 'Circle',
            radius: ringSize * 1000  // Convert km to meters
        }
    );

    if (mapRequestsConfig.debug) {
        console.log('Created field op ring:', {
            feature: fieldOpRing,
            properties: fieldOpRing.properties,
            geometry: fieldOpRing.geometry,
            radius: ringSize * 1000
        });
    }

    fieldOpRingSource.add(fieldOpRing);

    if (mapRequestsConfig.debug) {
        console.log('Added field op ring to source:', {
            sourceId: fieldOpRingSource.getId(),
            shapeCount: fieldOpRingSource.getShapes().length
        });
    }

    // Add ring PolygonLayer
    const ringLayer = new atlas.layer.PolygonLayer(
        fieldOpRingSource,
        'fieldop_ring',
        {
            filter: ['==', ['get', 'subType'], 'Circle'],  // Only show the circle
            fillColor: 'rgba(255, 0, 0, 0.2)',
            strokeColor: 'red',
            strokeWidth: 2
        }
    );

    if (mapRequestsConfig.debug) {
        console.log('Ring layer configuration:', {
            layerId: ringLayer.getId(),
            options: ringLayer.getOptions()
        });
    }

    map.layers.add(ringLayer);
    if (mapRequestsConfig.debug) console.log('Added field op ring layer to map');
}

// Initialize aid request layer with icons and points
async function initializeAidRequestLayer() {
    if (mapRequestsConfig.debug) {
        console.log('=== Starting Aid Request Layer Initialization ===');
        console.log('Aid Types Config:', mapRequestsConfig.aidTypesConfig);
        console.log('Aid Locations:', mapRequestsConfig.aidLocations);

        // Add console.table for marker positions
        const markerPositions = mapRequestsConfig.aidLocations.map(request => ({
            id: request.id,
            type: request.aid_type.slug,
            status: request.status,
            priority: request.priority || 'none',
            lat: request.location?.latitude,
            lon: request.location?.longitude,
            address: request.address.full
        }));
        console.table(markerPositions, ['id', 'type', 'status', 'priority', 'lat', 'lon']);
    }

    // Create icons first
    await createAidTypeIcons();

    // Create a data source and layer for each aid type
    Object.entries(mapRequestsConfig.aidTypesConfig).forEach(([slug, aidTypeConfig]) => {
        // Create source
        const source = new atlas.source.DataSource(undefined, {
            cluster: false
        });
        map.sources.add(source);

        // Add ALL points for this aid type, regardless of status
        const validRequests = mapRequestsConfig.aidLocations
            .filter(request =>
                request.aid_type.slug === slug &&
                request.location &&
                typeof request.location.latitude === 'number' &&
                typeof request.location.longitude === 'number');

        if (mapRequestsConfig.debug) {
            console.log(`Processing ${slug} layer:`, {
                total: mapRequestsConfig.aidLocations.filter(r => r.aid_type.slug === slug).length,
                valid: validRequests.length,
                invalid: mapRequestsConfig.aidLocations.filter(r => r.aid_type.slug === slug).length - validRequests.length
            });
        }

        validRequests.forEach(request => {
            const position = new atlas.data.Position(
                request.location.longitude,
                request.location.latitude
            );
            const point = new atlas.data.Feature(new atlas.data.Point(position), {
                id: request.id,
                aid_type: slug,
                status: request.status,
                priority: request.priority || null,
                latitude: request.location.latitude,
                longitude: request.location.longitude,
                address: request.address.full,
                requester_name: request.requester_name
            });
            source.add(point);
        });

        // Create layer with initial visibility based on status
        const layer = new atlas.layer.SymbolLayer(source, slug, {
            iconOptions: {
                ignorePlacement: false,
                allowOverlap: true,
                anchor: "bottom",
                image: slug,
                size: 1.0,
                visible: true
            },
            textOptions: {
                textField: ['get', 'id'],
                offset: [0, 1],
                anchor: 'top',
                allowOverlap: true,
                ignorePlacement: false,
                font: ['StandardFont-Bold'],
                size: 12,
                color: 'black',
                haloColor: 'white',
                haloWidth: 2
            }
        });

        // Store layer reference
        layersByType[slug] = layer;

        if (mapRequestsConfig.debug) {
            console.log(`Added layer: ${slug} (${validRequests.length} points)`);
        }

        map.layers.add(layer);
        addAidRequestPopup(layer);
    });

    // Mark map as ready
    mapRequestsConfig.mapReady = true;

    if (mapRequestsConfig.debug) {
        const totalPoints = Object.values(layersByType)
            .reduce((sum, layer) => sum + layer.getSource().getShapes().length, 0);
        console.log('=== Layer Initialization Complete ===');
        console.log(`Total points: ${totalPoints}`);
    }
}

// Create icon templates for each aid type
async function createAidTypeIcons() {
    const startTime = Date.now();

    if (mapRequestsConfig.debug) {
        console.log('=== Starting Icon Creation ===');
        const aidTypeCount = mapRequestsConfig.aidTypesConfig ? Object.keys(mapRequestsConfig.aidTypesConfig).length : 0;
        console.log(`Processing ${aidTypeCount} aid types`);
    }

    const iconSettings = {
        'evac': { name: 'marker-arrow', color: '#FF0000' },     // Red arrow for evacuation
        'supply': { name: 'marker-circle', color: '#800080' },  // Purple circle for supply
        'check': { name: 'marker-arrow', color: '#008000' }     // Green arrow for welfare check
    };

    try {
        if (mapRequestsConfig.aidTypesConfig) {
            const iconPromises = Object.entries(mapRequestsConfig.aidTypesConfig).map(([slug, aidTypeConfig]) => {
                const settings = iconSettings[slug] || { name: 'marker-circle', color: '#1B87EC' };
                return map.imageSprite.createFromTemplate(
                    slug,
                    settings.name,
                    settings.color,
                    '#ffffff'  // White outline
                ).catch(error => {
                    console.error(`Error creating template for ${slug}:`, error);
                    return null;
                });
            });

            // Wait for all icon templates to be created
            await Promise.all(iconPromises);

            if (mapRequestsConfig.debug) {
                const duration = Date.now() - startTime;
                console.log(`Icon creation complete - ${iconPromises.length} templates created in ${duration}ms`);
                console.log('Available icons:', map.imageSprite.getImageIds());
            }
        } else {
            console.warn('No aid types configuration found');
        }
    } catch (error) {
        console.error('Error in icon creation:', error);
    }
}

// Add aid request points to the source
function addAidRequestPoints(aidRequestsSource) {
    if (!aidRequestsSource || !mapRequestsConfig.aidLocations) {
        console.error('Source or aid locations not available');
        return;
    }

    // Create points by aid type
    const pointsByType = {};

    mapRequestsConfig.aidLocations.forEach(request => {
        // Skip if location data is missing or invalid
        if (!request.location ||
            !request.location.latitude ||
            !request.location.longitude ||
            isNaN(request.location.latitude) ||
            isNaN(request.location.longitude)) {
            console.warn(`Skipping aid request ${request.id} due to invalid location data:`, request.location);
            return;
        }

        const aidType = request.aid_type.slug;
        if (!pointsByType[aidType]) {
            pointsByType[aidType] = [];
        }

        // Create point feature with validated coordinates
        const point = new atlas.data.Feature(
            new atlas.data.Point([
                parseFloat(request.location.longitude),
                parseFloat(request.location.latitude)
            ]), {
                id: request.id,
                title: `${request.aid_type.name} Request`,
                aid_type: aidType,
                status: request.status,
                priority: request.priority,
                description: `Status: ${request.status_display}<br>Priority: ${request.priority_display}`,
                address: request.address.full
            }
        );

        pointsByType[aidType].push(point);
    });

    // Add points to source by type
    Object.entries(pointsByType).forEach(([aidType, points]) => {
        if (mapRequestsConfig.debug) {
            console.log(`Added layer: ${aidType} (${points.length} points)`);
        }
        aidRequestsSource.add(points);
    });

    if (mapRequestsConfig.debug) {
        console.log('=== Layer Initialization Complete ===');
        console.log('Total points:', Object.values(pointsByType).flat().length);
    }
}

// Create and add the aid request layer
function createAidRequestLayer(aidRequestsSource) {
    const aidRequestsLayer = new atlas.layer.SymbolLayer(
        aidRequestsSource,
        'aid-requests',
        {
            iconOptions: {
                image: 'pin-blue',  // Use Azure Maps built-in pin-blue icon as default
                allowOverlap: true,
                size: 1.0,
                anchor: 'center'
            },
            minZoom: 0,
            maxZoom: 24,
            visible: true
        }
    );

    if (mapRequestsConfig.debug) {
        console.log('=== Layer Creation Details ===');
        console.log('Layer ID:', aidRequestsLayer.getId());
        console.log('Layer options:', aidRequestsLayer.getOptions());
    }

    map.layers.add(aidRequestsLayer);

    // Add mouse events for the aid requests layer
    addAidRequestPopup(aidRequestsLayer);

    if (mapRequestsConfig.debug) {
        console.log('Aid request layer added to map');
    }
}

// Add popup functionality to the aid request layer
function addAidRequestPopup(aidRequestsLayer) {
    const popup = new atlas.Popup({
        pixelOffset: [0, -20]
    });

    map.events.add('mouseover', aidRequestsLayer, (e) => {
        if (e.shapes && e.shapes[0] && e.shapes[0].properties) {
            const prop = e.shapes[0].properties;
            const aidTypeConfig = mapRequestsConfig.aidTypesConfig[prop.aid_type];
            const priorityLabel = window.aidRequestsStore.data.priorityChoices[prop.priority === null ? 'null' : prop.priority] || 'None';
            const content = `
                <div style="padding: 10px;">
                    <strong>Status:</strong> ${prop.status || 'None'}<br>
                    <strong>Priority:</strong> ${priorityLabel}<br>
                    <strong>Type:</strong> ${aidTypeConfig ? aidTypeConfig.name : prop.aid_type || 'None'}
                </div>`;
            popup.setOptions({
                content: content,
                position: e.position
            });
            popup.open(map);
        }
    });

    map.events.add('mouseout', aidRequestsLayer, () => {
        popup.close();
    });
}
