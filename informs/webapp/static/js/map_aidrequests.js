// Configuration options
const mapConfig = {
    debug: true // Set to false to disable debug logging
};

// Global variables for marker management
let aidMarkers = {};
let allAidRequestIds = []; // Store all aid request IDs
let map2; // Global map reference

// Helper function to conditionally log messages based on debug setting
function mapLog(message, isError) {
    if (mapConfig.debug || isError) {
        console.log(message);
    }
}

// Helper function to update marker visibility based on filtered aid requests
function updateMapMarkerVisibility(visibleIds) {
    // Fail fast with clear error messages
    if (!window.map2) {
        console.error('Map not initialized yet');
        return;
    }

    if (!aidMarkers || typeof aidMarkers !== 'object') {
        console.error('Aid markers not properly initialized');
        return;
    }

    try {
        mapLog('updateMapMarkerVisibility called with ' + (visibleIds ? visibleIds.length : 0) + ' IDs');

        // Convert visibleIds to numbers if they're strings
        const visibleIdsNumeric = (visibleIds || []).map(id => typeof id === 'string' ? parseInt(id, 10) : id);

        mapLog(`Updating marker visibility for ${visibleIdsNumeric.length} of ${allAidRequestIds.length} markers`);

        // If no filter is applied or all markers should be visible, show all markers
        if (visibleIdsNumeric.length === 0) {
            mapLog('No filter applied - showing all markers');
            for (const id of allAidRequestIds) {
                if (aidMarkers[id]) {
                    aidMarkers[id].setOptions({ visible: true });
                }
            }
            return;
        }

        // Hide all markers first, then show only the visible ones
        // More efficient to use a Set for fast lookups
        const visibleIdsSet = new Set(visibleIdsNumeric);

        for (const id of allAidRequestIds) {
            if (aidMarkers[id]) {
                aidMarkers[id].setOptions({ visible: visibleIdsSet.has(id) });
            }
        }

        mapLog('Marker visibility update complete');
    } catch (error) {
        console.error('Error updating marker visibility:', error);
    }
}

// Listen for our custom filter event
document.addEventListener('aidRequestsFiltered', function(event) {
    mapLog('aidRequestsFiltered event received');
    if (!event.detail || !Array.isArray(event.detail.visibleAidRequests)) {
        mapLog('Invalid event detail structure in aidRequestsFiltered event', true);
        return;
    }

    mapLog(`Filter event contains ${event.detail.visibleAidRequests.length} visible requests`);
    updateMapMarkerVisibility(event.detail.visibleAidRequests);
});

// Make touchstart events passive to prevent performance warnings
const setupPassiveTouchEvents = function() {
    mapLog('Setting up passive touch events');
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'touchstart') {
            options = options || {};
            if (typeof options === 'object') {
                options.passive = true;
            } else {
                options = { passive: true };
            }
        }
        return originalAddEventListener.call(this, type, listener, options);
    };
};

function initMap(context) {
    // Fail fast
    if (!context || typeof context !== 'object') {
        console.error('Invalid map context provided.');
        return;
    }

    mapLog('initMap called');

    // Setup passive touch events
    setupPassiveTouchEvents();

    const {
        fieldop_lat,
        fieldop_lon,
        apiKey,
        aid_locations: locations,
        map_zoom,
        center_lat,
        center_lon
    } = context;

    // Validate required parameters
    if (!apiKey) {
        console.error('API key is required for map initialization');
        return;
    }

    // Log map parameters
    mapLog(`fieldop coordinates: [${fieldop_lon}, ${fieldop_lat}]`);
    mapLog(`center coordinates: [${center_lon}, ${center_lat}], zoom: ${map_zoom}`);

    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) {
        console.error('Map container element not found');
        return;
    }

    // Create map instance
    const map = new atlas.Map('mapContainer', {
        center: [parseFloat(center_lon), parseFloat(center_lat)],
        zoom: parseInt(map_zoom),
        style: 'road_shaded_relief',
        view: 'Auto',
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: apiKey
        }
    });

    //Wait until the map resources are ready
    map.events.add('ready', function () {
        mapLog('Map is READY');
        map.setUserInteraction({ scrollZoomInteraction: false });

        // Add controls
        map.controls.add(new atlas.control.ZoomControl(), { position: 'top-right' });
        map.controls.add(
            new atlas.control.StyleControl({
                mapStyles: ['terra', 'road', 'satellite', 'hybrid', 'road_shaded_relief', 'satellite_road_labels'],
                layout: 'list'
            }),
            { position: 'top-left' }
        );

        // Add field op marker
        map.markers.add(new atlas.HtmlMarker({
            htmlContent: "<div id='fieldop'><div class='pin bounce'></div><div class='pulse'></div>{text}</div>",
            text: 'FO',
            position: [parseFloat(fieldop_lon), parseFloat(fieldop_lat)],
            pixelOffset: [5, -18]
        }));

        // Set field op marker color
        const fieldopElement = document.getElementById('fieldop');
        if (fieldopElement) {
            fieldopElement.style.setProperty('--pin-color', 'green');
        }

        // Add location markers
        if (Array.isArray(locations) && locations.length > 0) {
            mapLog(`Adding ${locations.length} aid location markers`);

            for (let i = 0; i < locations.length; i++) {
                const location = locations[i];
                if (location.latitude && location.longitude) {
                    map.markers.add(new atlas.HtmlMarker({
                        htmlContent: "<div><div class='pin bounce'></div><div class='pulse'></div></div>",
                        position: [parseFloat(location.longitude), parseFloat(location.latitude)],
                        pixelOffset: [5, -18]
                    }));
                }
            }
        } else {
            console.error('No valid locations provided for markers');
        }
    });

    // Handle map errors
    map.events.add('error', function(e) {
        console.error('Map error occurred:', e);
    });
}

function initMap2(context) {
    // Fail fast
    if (!context || typeof context !== 'object') {
        console.error('Invalid map context provided.');
        return;
    }

    mapLog('initMap2 called');

    // Destructure context for cleaner code
    const {
        center_lat,
        center_lon,
        fieldop_name,
        fieldop_slug,
        fieldop_lat,
        fieldop_lon,
        azure_maps_key,
        map_zoom,
        ring_size
    } = context;

    // Validate required parameters
    if (!azure_maps_key) {
        console.error('Azure Maps key is required');
        return;
    }

    if (!fieldop_name || !fieldop_slug) {
        console.error('Field operation name and slug are required');
        return;
    }

    if (isNaN(parseFloat(fieldop_lat)) || isNaN(parseFloat(fieldop_lon))) {
        console.error('Invalid field operation coordinates');
        return;
    }

    const mapContainer = document.getElementById('map2Container');
    if (!mapContainer) {
        console.error('Map container element not found');
        return;
    }

    mapLog(`Map parameters: coordinates: [${center_lon}, ${center_lat}], zoom: ${map_zoom}, ring: ${ring_size}km`);

    // Setup passive touch events
    setupPassiveTouchEvents();

    // Create map
    var map2 = new atlas.Map('map2Container', {
        center: [parseFloat(center_lon), parseFloat(center_lat)],
        zoom: parseInt(map_zoom) || 8,
        style: 'road_shaded_relief',
        view: "Auto",
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: azure_maps_key,
        }
    });

    // Store as global for marker visibility updates
    window.map2 = map2;

    // Prepare map style control
    const map2StyleControl = new atlas.control.StyleControl({
        mapStyles: [
            'terra',
            'road',
            'satellite',
            'hybrid',
            'road_shaded_relief',
            'satellite_road_labels'
        ],
        layout: 'list'
    });

    //Wait until the map resources are ready, then add layers
    map2.events.add('ready', function () {
        mapLog('Map2 is READY');

        // Disable scroll wheel zoom
        map2.setUserInteraction({ scrollZoomInteraction: false });

        // Add special icons
        map2.imageSprite.add('life-preserver', '/static/images/icons/t_life-preserver.svg');

        // Add legend control if available
        try {
            if (atlas.control && atlas.control.LegendControl) {
                const legend = new atlas.control.LegendControl({
                    title: 'Field Op Legend',
                });
                map2.controls.add(legend, { position: 'top-left' });

                const lc = new atlas.control.LayerControl({
                    legendControl: legend,
                    dynamicLayerGroup: {
                        groupTitle: 'Show:',
                        layout: 'checkbox'
                    }
                });
                map2.controls.add(lc, { position: 'bottom-left' });
            }
        } catch (e) {
            console.error('Error creating legend control:', e);
        }

        // Add standard controls
        map2.controls.add(map2StyleControl, { position: 'top-left' });
        map2.controls.add([
            new atlas.control.ZoomControl(),
            new atlas.control.PitchControl(),
            new atlas.control.CompassControl(),
            new atlas.control.FullscreenControl(),
        ], { position: 'top-right' });
        map2.controls.add([
            new atlas.control.ScaleControl(),
        ], { position: 'bottom-right' });

        // Add field op marker
        const foPointData = [];
        const foPos = new atlas.data.Position(parseFloat(fieldop_lon), parseFloat(fieldop_lat));
        const foPoint = new atlas.data.Feature(new atlas.data.Point(foPos), {
            name: fieldop_name,
            slug: fieldop_slug,
            lat: fieldop_lat,
            lon: fieldop_lon
        });
        foPointData.push(foPoint);

        const foDataSource = new atlas.source.DataSource();
        map2.sources.add(foDataSource);
        foDataSource.add(foPointData);

        const foLayer = new atlas.layer.SymbolLayer(foDataSource, fieldop_name, {
            iconOptions: {
                ignorePlacement: false,
                allowOverlap: true,
                image: "pin-blue",
                anchor: "bottom",
                size: 1.5
            },
            textOptions: {
                textField: ['get', 'slug'],
                offset: [0, 0.5],
                allowOverlap: true,
                ignorePlacement: false,
                font: ['StandardFont-Bold'],
                size: 12,
                color: 'black',
                haloColor: 'white',
                haloWidth: 2
            }
        });
        map2.layers.add(foLayer);

        // Add ring around field op
        const dataSourceC = new atlas.source.DataSource();
        map2.sources.add(dataSourceC);

        dataSourceC.add(new atlas.data.Feature(
            new atlas.data.Point([parseFloat(fieldop_lon), parseFloat(fieldop_lat)]),
            {
                subType: "Circle",
                radius: ring_size * 1000
            }
        ));

        const ringLayer = new atlas.layer.PolygonLayer(dataSourceC, ring_size + 'km Aid Ring', {
            fillColor: 'rgba(255, 0, 0, 0.1)',
            strokeColor: 'red',
            strokeWidth: 2
        });
        map2.layers.add(ringLayer);

        // Set up field op popup
        const foPopupTemplate = '<div class="fieldop-popup">{name}<hr class="m-0">{slug}<div><hr class="m-0">{lat},{lon}</div></div>';
        const foPopup = new atlas.Popup({
            pixelOffset: [0, -18],
            closeButton: false
        });

        // Add hover events for field op
        map2.events.add('mouseover', foLayer, function (e) {
            if (e.shapes && e.shapes.length > 0) {
                const properties = e.shapes[0].getProperties();
                const content = foPopupTemplate
                    .replace(/{name}/g, properties.name)
                    .replace(/{slug}/g, properties.slug)
                    .replace(/{lat}/g, properties.lat)
                    .replace(/{lon}/g, properties.lon);
                const coordinate = e.shapes[0].getCoordinates();

                foPopup.setOptions({
                    content: content,
                    position: coordinate
                });
                foPopup.open(map2);
            }
        });

        map2.events.add('mouseleave', foLayer, function () {
            foPopup.close();
        });

        // Load aid locations from DOM
        let locations = [];
        try {
            const locationsJson = document.getElementById('aid-locations-data');
            if (!locationsJson || !locationsJson.textContent) {
                console.error('Aid locations data element not found');
            } else {
                locations = JSON.parse(locationsJson.textContent);
                if (!Array.isArray(locations)) {
                    console.error('Aid locations data is not an array');
                    locations = [];
                } else {
                    mapLog(`Successfully parsed ${locations.length} aid locations`);
                }
            }
        } catch (error) {
            console.error('Error parsing aid locations JSON:', error);
            locations = [];
        }

        // Prepare aid request markers
        const points = [];
        aidMarkers = {};
        allAidRequestIds = [];

        // Process each location
        if (locations.length > 0) {
            for (const location of locations) {
                if (location && location.latitude && location.longitude) {
                    const position = new atlas.data.Position(
                        parseFloat(location.longitude),
                        parseFloat(location.latitude)
                    );
                    const point = new atlas.data.Feature(new atlas.data.Point(position), location);
                    points.push(point);

                    // Store ID for filtering
                    if (location.pk) {
                        allAidRequestIds.push(location.pk);
                    }
                }
            }
        }

        mapLog(`Created ${points.length} map points from ${locations.length} aid locations`);

        // Create data source for aid locations
        const dataSource2 = new atlas.source.DataSource(undefined, {
            cluster: false
        });

        map2.sources.add(dataSource2);
        dataSource2.add(points);

        // Load aid type definitions
        let aidTypesData = {};
        try {
            const aidTypesElement = document.getElementById('aid-types-map-data');
            if (!aidTypesElement || !aidTypesElement.textContent) {
                console.error('Aid types data element not found');
            } else {
                aidTypesData = JSON.parse(aidTypesElement.textContent);
                mapLog(`Successfully parsed ${Object.keys(aidTypesData).length} aid types`);
            }
        } catch (error) {
            console.error('Error parsing aid types data:', error);
        }

        // Create icon sprites for aid types
        const aidTypeKeys = Object.keys(aidTypesData);
        const iconPromises = aidTypeKeys.map(key => {
            try {
                const aidType = aidTypesData[key];
                return map2.imageSprite.createFromTemplate(
                    key,
                    aidType.icon_name || 'pin',
                    aidType.icon_color || 'blue',
                    '#fff'
                );
            } catch (error) {
                console.error(`Error creating icon for ${key}:`, error);
                return Promise.resolve();
            }
        });

        // Build icon map for aid types
        const iconMap = ['match', ['get', 'aid_type']];

        if (aidTypeKeys.length > 0) {
            for (const key of aidTypeKeys) {
                iconMap.push(key, key);
            }
        } else {
            iconMap.push('default', 'marker-blue');
        }

        // Default fallback icon
        iconMap.push('marker-yellow');

        // Wait for icons to be created, then add aid request layer
        Promise.all(iconPromises)
            .then(function () {
                const aidLayer = new atlas.layer.SymbolLayer(dataSource2, 'Aid Requests', {
                    iconOptions: {
                        ignorePlacement: false,
                        allowOverlap: true,
                        anchor: "bottom",
                        image: iconMap
                    },
                    textOptions: {
                        textField: ['get', 'pk'],
                        offset: [0, 0.5],
                        allowOverlap: true,
                        ignorePlacement: false,
                        font: ['StandardFont-Bold'],
                        size: 12,
                        color: 'black',
                        haloColor: 'white',
                        haloWidth: 2
                    }
                });
                map2.layers.add(aidLayer);

                // Store marker references for filtering
                const shapes = dataSource2.getShapes();
                mapLog(`Processing ${shapes.length} shapes for marker visibility control`);

                for (const shape of shapes) {
                    const properties = shape.getProperties();
                    if (properties && properties.pk) {
                        aidMarkers[properties.pk] = shape;
                    }
                }

                mapLog(`Stored ${Object.keys(aidMarkers).length} markers for visibility control`);

                // Apply any existing filters
                if (window.filteredAidRequestIds && window.filteredAidRequestIds.length > 0) {
                    updateMapMarkerVisibility(window.filteredAidRequestIds);
                }
            })
            .catch(function(error) {
                console.error('Error loading icon sprites:', error);
            });
    });

    // Handle map errors
    map2.events.add('error', function(e) {
        console.error('Map2 error occurred:', e);
    });
}

// Auto-initialization when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    mapLog('DOM loaded, auto-initializing map');
    try {
        // Get field op data from hidden elements
        const fieldOpName = document.getElementById('field-op-name')?.textContent;
        const fieldOpSlug = document.getElementById('field-op-slug')?.textContent;

        if (!fieldOpName || !fieldOpSlug) {
            console.error('Required field op elements not found in DOM. Make sure field-op-name and field-op-slug elements exist.');
            return;
        }

        // Get configuration data directly from meta tags
        const fieldopLat = parseFloat(document.getElementById('fieldop-lat')?.content || 0);
        const fieldopLon = parseFloat(document.getElementById('fieldop-lon')?.content || 0);
        const azureMapsKey = document.getElementById('azure-maps-key')?.content;
        const mapZoom = parseInt(document.getElementById('map-zoom')?.content || 8);
        const centerLat = parseFloat(document.getElementById('center-lat')?.content || fieldopLat);
        const centerLon = parseFloat(document.getElementById('center-lon')?.content || fieldopLon);
        const ringSize = parseInt(document.getElementById('ring-size')?.content || 5);

        // Validate required data
        if (isNaN(fieldopLat) || isNaN(fieldopLon)) {
            console.error('Invalid coordinates. fieldop-lat and fieldop-lon meta tags must contain valid numbers.');
            return;
        }

        if (!azureMapsKey) {
            console.error('Azure Maps API key not found. Make sure azure-maps-key meta tag exists.');
            return;
        }

        // Map container check
        if (!document.getElementById('map2Container')) {
            console.error('Map container element not found. Make sure there is a div with id "map2Container".');
            return;
        }

        // Prepare context object
        const mapContext = {
            fieldop_name: fieldOpName,
            fieldop_slug: fieldOpSlug,
            fieldop_lat: fieldopLat,
            fieldop_lon: fieldopLon,
            azure_maps_key: azureMapsKey,
            map_zoom: mapZoom,
            center_lat: centerLat,
            center_lon: centerLon,
            ring_size: ringSize
        };

        // Initialize the map
        initMap2(mapContext);
    } catch (error) {
        console.error('Error auto-initializing map:', error);
    }
});
