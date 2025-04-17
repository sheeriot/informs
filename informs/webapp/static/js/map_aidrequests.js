/**
 * map_aidrequests.js
 *
 * Handles map initialization and display of aid request locations
 * Provides interactive map functionality for aid request visualization
 */

// Global map variable
let map;

// Configuration
const mapRequestsConfig = {
    debug: true,  // Set to false in production
    initializationAttempted: false,
    config: null,
    aidLocations: [],
    aidTypesConfig: {}
};

// Main program
document.addEventListener('DOMContentLoaded', function() {
    if (mapRequestsConfig.debug) {
        console.log('Map View: Starting map initialization...');
    }

    const mapContainer = document.getElementById('aid-request-map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // Get configuration from data attributes
    const config = {
        key: mapContainer.dataset.azureMapsKey,
        center: [
            parseFloat(mapContainer.dataset.centerLon),
            parseFloat(mapContainer.dataset.centerLat)
        ],
        zoom: parseInt(mapContainer.dataset.mapZoom),
        ringSize: parseInt(mapContainer.dataset.ringSize),
        fieldOpName: mapContainer.dataset.fieldOpName,
        fieldOpSlug: mapContainer.dataset.fieldOpSlug
    };

    if (!config.key) {
        console.error('Azure Maps key not found in data attributes');
        return;
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
                console.log('Aid Types Configuration loaded:', mapRequestsConfig.aidTypesConfig);
            }
        } catch (error) {
            console.error('Error parsing aid types configuration:', error);
        }
    }

    // Get aid locations data
    const aidLocationsElement = document.getElementById('aid-locations-data');
    if (aidLocationsElement && aidLocationsElement.textContent.trim()) {
        try {
            mapRequestsConfig.aidLocations = JSON.parse(aidLocationsElement.textContent);
            if (mapRequestsConfig.debug) {
                console.log('Aid Locations Data:', mapRequestsConfig.aidLocations.length, 'locations found');
            }
        } catch (error) {
            console.error('Error parsing aid locations data:', error);
            mapRequestsConfig.aidLocations = [];
        }
    }

    // Initialize map immediately
    initializeMap(config);
});

// Initialize the map with minimum configuration
function initializeMap(config) {
    if (mapRequestsConfig.debug) {
        console.log('Map View: Initializing map with config:', config);
    }

    try {
        // Initialize map with validated values
        map = new atlas.Map('aid-request-map', {
            center: config.center,
            zoom: config.zoom,
            style: 'road',
            view: 'Auto',
            showFeedbackLink: false,
            showLogo: false,
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: config.key
            }
        });

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
                console.log('Map ready event fired');
            }

            // Initialize field op layer first
            initializeFieldOpLayer();

            // Then initialize aid request layer
            await initializeAidRequestLayer();

            // Get initial filter state from the store
            const filterState = window.aidRequestsStore ? window.aidRequestsStore.filterState : {
                statuses: 'all',
                aidTypes: 'all',
                priorities: 'all'
            };

            // Update visibility based on initial filter state
            updateLayerVisibility(filterState);
        });

    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Listen for filter change events
document.addEventListener('aidRequestsFiltered', function(event) {
    if (mapRequestsConfig.debug) {
        console.log('Map View: Filter event received:', event.detail);
    }

    updateLayerVisibility(event.detail.filterState);
});

// Update layer visibility based on filter state
function updateLayerVisibility(filterState) {
    if (mapRequestsConfig.debug) {
        console.log('Map View: Updating layer visibility with filter state:', filterState);
    }

    const aidRequestsLayer = map.layers.getLayerById('aid-requests');
    if (!aidRequestsLayer) return;

    // If filterState is null or undefined, show all markers
    if (!filterState) {
        aidRequestsLayer.setOptions({ filter: ['boolean', true] });
        return;
    }

    // If all filter arrays are empty, show no markers
    const allFiltersEmpty = (
        (!Array.isArray(filterState.aidTypes) || filterState.aidTypes.length === 0) &&
        (!Array.isArray(filterState.statuses) || filterState.statuses.length === 0) &&
        (!Array.isArray(filterState.priorities) || filterState.priorities.length === 0)
    );

    if (allFiltersEmpty) {
        aidRequestsLayer.setOptions({ filter: ['boolean', false] });
        return;
    }

    // Build filter expression
    let filterExpr = ['all'];
    const filters = [];

    // Add aid type filter if specified
    if (Array.isArray(filterState.aidTypes) && filterState.aidTypes.length > 0) {
        filters.push(['in', ['get', 'aid_type'], ['literal', filterState.aidTypes]]);
    }

    // Add status filter if specified
    if (Array.isArray(filterState.statuses) && filterState.statuses.length > 0) {
        filters.push(['in', ['get', 'status'], ['literal', filterState.statuses]]);
    }

    // Add priority filter if specified
    if (Array.isArray(filterState.priorities) && filterState.priorities.length > 0) {
        filters.push(['in', ['get', 'priority'], ['literal', filterState.priorities]]);
    }

    // If we have any filters, apply them
    if (filters.length > 0) {
        filterExpr = ['all', ...filters];
    } else {
        // If no filters are specified, show all markers
        filterExpr = ['boolean', true];
    }

    if (mapRequestsConfig.debug) {
        console.log('Map View: Applying filter:', filterExpr);
    }

    // Apply the filter
    aidRequestsLayer.setOptions({
        filter: filterExpr
    });
}

// Helper Functions

// Initialize the field operation layer and ring
function initializeFieldOpLayer() {
    if (mapRequestsConfig.debug) {
        console.log('=== Starting Field Op Layer Initialization ===');
    }
    // will use 2 layers, one for symbol and one for polygon

    // Create the center position for both field op marker and ring
    const centerPosition = new atlas.data.Position(
        parseFloat(mapRequestsConfig.config.center[0]),
        parseFloat(mapRequestsConfig.config.center[1])
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
            // filter: ['==', ['get', 'subType'], undefined],  // Only show the point, not the circle
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

    const fieldOpRingSource = new atlas.source.DataSource();
    map.sources.add(fieldOpRingSource);

    // Create a Ring feature around the field op
    const fieldOpRing = new atlas.data.Feature(
        new atlas.data.Point(centerPosition),
        {
            subType: 'Circle',
            radius: mapRequestsConfig.config.ringSize * 1000
        }
    );
    if (mapRequestsConfig.debug) console.log('Created field op ring:', fieldOpRing);


    fieldOpRingSource.add(fieldOpRing);
    if (mapRequestsConfig.debug) console.log('Added field op ring to source');
    // Add ring PolygonLayer
    ringLayer = new atlas.layer.PolygonLayer(
        fieldOpRingSource,
        'fieldop_ring',
        {
            // filter: ['==', ['get', 'subType'], 'Circle'],  // Only show the circle
            fillColor: 'rgba(255, 0, 0, 0.2)',
            strokeColor: 'red',
            strokeWidth: 2
        }
    );
    map.layers.add(ringLayer);
    if (mapRequestsConfig.debug) console.log('Added field op ring layer to map');
}

// Initialize aid request layer with icons and points
async function initializeAidRequestLayer() {
    if (mapRequestsConfig.debug) {
        console.log('=== Starting Aid Request Layer Initialization ===');
    }

    // Create icons first
    await createAidTypeIcons();

    // Create a data source for each aid type
    const aidTypeSources = {};

    if (mapRequestsConfig.debug) {
        console.log('Creating data sources for each aid type...');
    }

    // Initialize sources for each aid type
    Object.keys(mapRequestsConfig.aidTypesConfig).forEach(slug => {
        aidTypeSources[slug] = new atlas.source.DataSource(undefined, {
            cluster: false
        });
        map.sources.add(aidTypeSources[slug]);
    });

    // Sort aid requests into their respective sources
    mapRequestsConfig.aidLocations
        .filter(location => location.latitude && location.longitude)
        .forEach(location => {
            const aidType = location.aid_type;
            if (aidType && aidTypeSources[aidType]) {
                const position = new atlas.data.Position(
                    parseFloat(location.longitude),
                    parseFloat(location.latitude)
                );
                const point = new atlas.data.Feature(new atlas.data.Point(position), location);
                aidTypeSources[aidType].add(point);
            } else if (mapRequestsConfig.debug) {
                console.warn('Invalid aid type or missing source:', aidType);
            }
        });

    if (mapRequestsConfig.debug) {
        console.log('Created aid request sources:', Object.keys(aidTypeSources));
    }

    // Create a layer for each aid type
    Object.entries(mapRequestsConfig.aidTypesConfig).forEach(([slug, aidTypeConfig]) => {
        if (mapRequestsConfig.debug) {
            console.log(`Creating layer for aid type: ${slug}`);
        }

        const layer = new atlas.layer.SymbolLayer(aidTypeSources[slug], slug, {
            iconOptions: {
                ignorePlacement: false,
                allowOverlap: true,
                anchor: "bottom",
                image: slug,
                size: aidTypeConfig.icon_scale || 1.0,
                visible: true
            },
            textOptions: {
                // Only show text if priority exists
                textField: ['case',
                    ['has', 'priority'],
                    ['get', 'pk'],
                    ''  // Don't show text for null priority
                ],
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
        if (mapRequestsConfig.debug) console.log('Added layer for aid type:', slug);
        if (mapRequestsConfig.debug) console.log('Layer options:', layer.getOptions());
        if (mapRequestsConfig.debug) console.log('Source contains:', aidTypeSources[slug].getShapes().length, 'points');
        if (mapRequestsConfig.debug) console.log('Layer:', layer);
        map.layers.add(layer);

        // Add popup functionality for this layer
        addAidRequestPopup(layer);

        if (mapRequestsConfig.debug) {
            console.log(`Added layer for ${slug} with options:`, layer.getOptions());
            console.log(`Source contains ${aidTypeSources[slug].getShapes().length} points`);
        }
    });

    if (mapRequestsConfig.debug) {
        console.log('=== Aid Request Layer Initialization Complete ===');
        const totalPoints = Object.values(aidTypeSources)
            .reduce((sum, source) => sum + source.getShapes().length, 0);
        console.log('Total points across all sources:', totalPoints);
        console.log('Created layers:', Object.keys(mapRequestsConfig.aidTypesConfig));
    }
}

// Create icon templates for each aid type
async function createAidTypeIcons() {
    if (mapRequestsConfig.debug) {
        console.log('=== Starting Icon Creation ===');
        console.log('Aid types config:', mapRequestsConfig.aidTypesConfig);
        const aidTypeCount = mapRequestsConfig.aidTypesConfig ? Object.keys(mapRequestsConfig.aidTypesConfig).length : 0;
        console.log(`Found ${aidTypeCount} aid types to process`);
    }

    try {
        if (mapRequestsConfig.aidTypesConfig) {
            console.log('Creating icon templates...');
            const iconPromises = Object.entries(mapRequestsConfig.aidTypesConfig).map(([slug, aidTypeConfig]) => {
                console.log(`Creating template for ${slug}:`, aidTypeConfig);
                return map.imageSprite.createFromTemplate(
                    slug,  // Use the slug as the icon ID
                    aidTypeConfig.icon_name || 'pin-round',
                    aidTypeConfig.icon_color || '#1B87EC',
                    '#fff'  // White outline
                ).catch(error => {
                    console.error(`Error creating template for ${slug}:`, error);
                    return null;
                });
            });

            // Wait for all icon templates to be created
            await Promise.all(iconPromises);

            if (mapRequestsConfig.debug) {
                console.log(`=== Icon Creation Complete ===`);
                console.log(`Created ${iconPromises.length} icons`);
                console.log('Aid types with icons:', Object.keys(mapRequestsConfig.aidTypesConfig));
                console.log('Icon templates:', map.imageSprite.getImageIds());
                // console.log('Icon templates:', map.imageSprite.getImage('evac'));
            }
        } else {
            console.warn('No aid types configuration found');
        }
    } catch (error) {
        console.error('Error in icon creation:', error);
        if (mapRequestsConfig.debug) {
            console.log('Icon creation failed, will use default pin-round markers');
        }
    }
}

// Add aid request points to the source
function addAidRequestPoints(aidRequestsSource) {
    const validLocations = mapRequestsConfig.aidLocations.filter(location => {
        const isValid = location &&
                       location.latitude &&
                       location.longitude &&
                       !isNaN(parseFloat(location.latitude)) &&
                       !isNaN(parseFloat(location.longitude));
        if (!isValid && mapRequestsConfig.debug) {
            console.log('Invalid location:', location);
        }
        return isValid;
    });

    if (mapRequestsConfig.debug) {
        console.log('Filtered valid locations:', validLocations.length);
    }

    const aidPoints = validLocations.map(location => {
        const point = new atlas.data.Feature(
            new atlas.data.Point([
                parseFloat(location.longitude),
                parseFloat(location.latitude)
            ]),
            {
                id: location.id || null,
                aid_type: location.aid_type || 'unknown',
                status: location.status || 'unknown',
                priority: location.priority || 'none',
                latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude)
            }
        );
        return point;
    });

    if (mapRequestsConfig.debug) {
        console.log('Created aid points:', aidPoints.length);
    }

    aidRequestsSource.add(aidPoints);

    if (mapRequestsConfig.debug) {
        console.log('Added points to source');
        const shapes = aidRequestsSource.getShapes();
        console.log('Source shapes:', shapes ? shapes.length : 0);
        if (shapes && shapes.length > 0) {
            console.log('Sample shape:', {
                coordinates: shapes[0].getCoordinates(),
                properties: shapes[0].getProperties()
            });
        }
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
            const content = `
                <div style="padding: 10px;">
                    <strong>Status:</strong> ${prop.status || 'None'}<br>
                    <strong>Priority:</strong> ${prop.priority || 'None'}<br>
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
