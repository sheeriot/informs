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

    // Get map container and its data attributes
    const mapContainer = document.getElementById('aid-request-map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // Get configuration from data attributes
    const config = transformDataset(mapContainer.dataset);
    if (!config.azureMapsKey) {
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

    // Set up load map button click handler
    const loadButton = document.getElementById('load-map-button');
    if (loadButton) {
        loadButton.onclick = function() {
            this.style.display = 'none';
            initializeMap(mapConfig.config);
        };
    }
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
        if (mapConfig.debug) {
            console.log('Map Initialization', 'font-weight: bold; color: #2196F3;');
            console.table({
                'Container ID': 'aid-request-map',
                'Center': [parseFloat(config.centerLon), parseFloat(config.centerLat)],
                'Zoom': config.mapZoom,
                'Field Op': config.fieldOpName,
                'Locations': mapConfig.aidLocations.length
            });
        }

        // Initialize a map instance
        map = new atlas.Map('aid-request-map', {
            center: [parseFloat(config.centerLon), parseFloat(config.centerLat)],
            zoom: parseInt(config.mapZoom),
            style: 'road',
            view: 'Auto',
            showFeedbackLink: false,
            showLogo: false,
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: config.azureMapsKey
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
