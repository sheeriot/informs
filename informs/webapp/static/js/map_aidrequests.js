/**
 * map_aidrequests.js
 *
 * Handles map initialization and display of aid request locations
 * Provides interactive map functionality for aid request visualization
 */

// Global map variable
let map;

// Configuration
const mapConfig = {
    debug: true,
    initializationAttempted: false,
    config: null,
    aidLocations: []
};

// Main program
document.addEventListener('DOMContentLoaded', function() {
    if (mapConfig.debug) {
        console.log('Starting map initialization...');
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
    mapConfig.config = config;

    // Get aid locations data
    const aidLocationsElement = document.getElementById('aid-locations-data');
    if (aidLocationsElement && aidLocationsElement.textContent.trim()) {
        try {
            const rawData = aidLocationsElement.textContent.trim();
            mapConfig.aidLocations = JSON.parse(rawData);
            if (mapConfig.debug) {
                console.log('Aid Locations Data:', mapConfig.aidLocations.length, 'locations found');
                if (mapConfig.aidLocations.length > 0) {
                    console.log('Sample location format:', mapConfig.aidLocations[0]);
                    const simplifiedData = mapConfig.aidLocations.map(loc => ({
                        id: loc.pk || loc.id,
                        status: loc.status,
                        priority: loc.priority,
                        aidType: loc.aid_type,
                        lat: loc.latitude,
                        lon: loc.longitude
                    }));
                    console.table(simplifiedData);
                }
            }
        } catch (error) {
            console.error('Error parsing aid locations data:', error);
            console.log('Raw data:', aidLocationsElement.textContent);
            mapConfig.aidLocations = [];
        }
    } else {
        console.log('No aid locations data found or empty data');
        mapConfig.aidLocations = [];
    }

    // Initialize map immediately
    initializeMap(config);
});

// Functions in order of execution

// Initialize configuration and data
function initializeConfig() {
    if (mapConfig.debug) {
        console.log('Initializing configuration...');
    }

    try {
        // Get map container and its data attributes
        const mapData = document.getElementById('aid-request-map-data');
        if (!mapData) {
            console.error('Map Data not found');
            return false;
        }

        // Transform and store the dataset
        const config = transformDataset(mapData.dataset);
        if (mapConfig.debug) {
            console.log('Map Configuration', 'font-weight: bold; color: #2196F3;');
            console.table({
                'Field Op Name': config.fieldOpName,
                'Field Op Slug': config.fieldOpSlug,
                'Center Latitude': config.centerLat,
                'Center Longitude': config.centerLon,
                'Map Zoom': config.mapZoom,
                'Ring Size (km)': config.ringSize
            });
        }

        // Validate required configuration
        if (!config.azureMapsKey) {
            console.error('Azure Maps key not found');
            return false;
        }

        // Get aid locations data
        const aidLocationsElement = document.getElementById('aid-locations-data');
        if (!aidLocationsElement) {
            console.error('Aid locations data element not found');
            return false;
        }

        try {
            mapConfig.aidLocations = JSON.parse(aidLocationsElement.textContent);
            if (mapConfig.debug) {
                console.log('Aid Locations Data', 'font-weight: bold; color: #2196F3;');
                const simplifiedData = mapConfig.aidLocations.map(loc => ({
                    id: loc.pk,
                    status: loc.status,
                    priority: loc.priority,
                    aidType: loc.aid_type,
                    lat: loc.latitude,
                    lon: loc.longitude
                }));
                console.table(simplifiedData);
            }
        } catch (error) {
            console.error('Error parsing aid locations data:', error);
            return false;
        }

        // Store configuration
        mapConfig.config = config;
        return true;
    } catch (error) {
        console.error('Error initializing configuration:', error);
        return false;
    }
}

// Initialize the map with minimum configuration
function initializeMap(config) {
    try {
        // Validate and parse configuration values
        const centerLon = parseFloat(config.center[0]);
        const centerLat = parseFloat(config.center[1]);
        const zoomLevel = parseInt(config.zoom);

        if (isNaN(centerLon) || isNaN(centerLat) || isNaN(zoomLevel)) {
            console.error('Invalid map configuration:', {
                centerLon,
                centerLat,
                zoomLevel,
                rawConfig: config
            });
            return;
        }

        if (mapConfig.debug) {
            console.log('Map Initialization with parsed values:', {
                centerLon,
                centerLat,
                zoomLevel,
                locations: mapConfig.aidLocations.length
            });
        }

        // Initialize map with validated values
        map = new atlas.Map('aid-request-map', {
            center: [centerLon, centerLat],
            zoom: zoomLevel,
            style: 'road',
            view: 'Auto',
            showFeedbackLink: false,
            showLogo: false,
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: config.key
            }
        });

        // Add a ready event to confirm map loaded
        map.events.add('ready', function() {
            console.log('Map is ready');

            // Disable scroll zoom
            map.setUserInteraction({ scrollZoomInteraction: false });

            // Add life preserver icon
            map.imageSprite.add('life-preserver', '/static/images/icons/t_life-preserver.svg');

            // Create and add legend control
            const legend = new atlas.control.LegendControl({
                title: 'Field Op Legend',
                style: 'light'
            });
            map.controls.add(legend, { position: 'top-left' });

            // Add style control
            map.controls.add(new atlas.control.StyleControl({
                mapStyles: ['road', 'satellite', 'hybrid'],
                style: 'light',
                layout: 'list'
            }), {
                position: 'top-left'
            });

            // Add navigation controls group
            map.controls.add([
                new atlas.control.ZoomControl(),
                new atlas.control.PitchControl(),
                new atlas.control.CompassControl(),
                new atlas.control.FullscreenControl()
            ], {
                position: 'top-right'
            });

            // Add layer control
            const layerControl = new atlas.control.LayerControl({
                legendControl: legend,
                style: 'light',
                showToggle: true,
                dynamicLayerGroup: {
                    groupTitle: 'Show:',
                    layout: 'checkbox'
                }
            });
            map.controls.add(layerControl, { position: 'bottom-left' });

            // Add scale control
            map.controls.add(new atlas.control.ScaleControl(), {
                position: 'bottom-right'
            });

            // Add field op location marker
            var fopoint_data = []
            var fopos = new atlas.data.Position(parseFloat(config.centerLon), parseFloat(config.centerLat))
            var fopoint = new atlas.data.Feature(new atlas.data.Point(fopos), {
                name: config.fieldOpName,
                slug: config.fieldOpSlug,
                lat: config.centerLat,
                lon: config.centerLon
            });

            fopoint_data.push(fopoint);
            var fodataSource = new atlas.source.DataSource();
            map.sources.add(fodataSource);
            fodataSource.add(fopoint_data);

            var foLayer = new atlas.layer.SymbolLayer(fodataSource, config.fieldOpName, {
                iconOptions: {
                    image: "pin-blue",
                    anchor: "bottom",
                    size: 1.5,
                    allowOverlap: true
                }
            });

            map.layers.add(foLayer);

            // Mark an Aid Ring
            const dataSourceC = new atlas.source.DataSource()
            map.sources.add(dataSourceC)
            //Create a circle
            dataSourceC.add(new atlas.data.Feature(
                new atlas.data.Point([parseFloat(config.centerLon), parseFloat(config.centerLat)]),
                {
                    subType: "Circle",
                    radius: config.ringSize * 1000
                }
            ))
            // console.log("Ring in KM", ring_size)
            const ringLayer = new atlas.layer.PolygonLayer(dataSourceC, config.ringSize + 'km Aid Ring', {
                fillColor: 'rgba(255, 0, 0, 0.1)',
                strokeColor: 'red',
                strokeWidth: 2
            })
            map.layers.add(ringLayer)

            // Add aid request locations
            const dataSource2 = new atlas.source.DataSource(undefined, {
                cluster: false
            });
            map.sources.add(dataSource2);

            // Create points from pre-parsed aid locations
            const points = mapConfig.aidLocations
                .filter(location => location.latitude && location.longitude)
                .map(location => {
                    const position = new atlas.data.Position(
                        parseFloat(location.longitude),
                        parseFloat(location.latitude)
                    );
                    return new atlas.data.Feature(new atlas.data.Point(position), location);
                });

            dataSource2.add(points);

            // Get aid type configuration
            const aidTypesElement = document.getElementById('aid-types-json');
            let aidTypesConfig = {};
            if (aidTypesElement) {
                try {
                    const aidTypesArray = JSON.parse(aidTypesElement.textContent);
                    // Convert array to object with slug as key
                    aidTypesConfig = aidTypesArray.reduce((acc, type) => {
                        acc[type.slug] = type;
                        return acc;
                    }, {});

                    if (mapConfig.debug) {
                        console.log('Aid Types Configuration loaded:', aidTypesConfig);
                        console.log('Number of aid types:', Object.keys(aidTypesConfig).length);
                    }
                } catch (error) {
                    console.error('Error parsing aid types configuration:', error);
                    console.log('Raw content:', aidTypesElement.textContent);
                }
            } else {
                console.warn('Aid types element not found in DOM');
            }

            // Create custom icon templates for each aid type
            console.log('Creating icon templates...');
            const iconPromises = Object.entries(aidTypesConfig).map(([slug, config]) => {
                console.log(`Creating template for ${slug}:`, config);
                return map.imageSprite.createFromTemplate(
                    slug,  // Use the slug as the icon ID
                    config.icon_name,
                    config.icon_color,
                    '#fff'  // White outline
                ).catch(error => {
                    console.error(`Error creating template for ${slug}:`, error);
                    return null;
                });
            });

            // Wait for all icons to be created before adding the layers
            console.log('Waiting for icon templates to be created...');
            Promise.all(iconPromises).then(function(results) {
                console.log('Icon templates created:', results);

                // Create a data source for each aid type
                const aidTypeSources = {};
                Object.keys(aidTypesConfig).forEach(slug => {
                    aidTypeSources[slug] = new atlas.source.DataSource(undefined, {
                        cluster: false
                    });
                    map.sources.add(aidTypeSources[slug]);
                });

                // Distribute points to their respective data sources
                points.forEach(point => {
                    const aidType = point.properties.aid_type;
                    if (aidTypeSources[aidType]) {
                        aidTypeSources[aidType].add(point);
                    } else {
                        console.warn(`Unknown aid type: ${aidType}`);
                    }
                });

                // Create a layer for each aid type
                Object.entries(aidTypesConfig).forEach(([slug, config]) => {
                    console.log(`Creating layer for aid type: ${slug}`);
                    const layer = new atlas.layer.SymbolLayer(aidTypeSources[slug], config.name, {
                        iconOptions: {
                            ignorePlacement: false,
                            allowOverlap: true,
                            anchor: "bottom",
                            image: slug,
                            size: config.icon_scale
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

                    map.layers.add(layer);
                    console.log(`Added layer for ${slug}`);

                    // Add mouse events for this layer
                    const popup = new atlas.Popup({
                        pixelOffset: [0, -20]
                    });

                    map.events.add('mouseover', layer, (e) => {
                        if (e.shapes && e.shapes[0].properties) {
                            const prop = e.shapes[0].properties;
                            const content = `
                                <div style="padding: 10px;">
                                    <strong>Status:</strong> ${prop.status}<br>
                                    <strong>Priority:</strong> ${prop.priority}<br>
                                    <strong>Type:</strong> ${config.name}
                                </div>`;
                            popup.setOptions({
                                content: content,
                                position: e.position
                            });
                            popup.open(map);
                        }
                    });

                    map.events.add('mouseout', layer, () => {
                        popup.close();
                    });
                });

                // Log layer information
                const layers = map.layers.getLayers();
                console.log('Current map layers:', layers);
            });
        });

    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Helper function to transform dataset keys
function transformDataset(dataset) {
    return Object.entries(dataset).reduce((acc, [key, value]) => {
        const displayKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
        acc[displayKey] = value;
        return acc;
    }, {});
}
