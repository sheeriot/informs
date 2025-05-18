// Debug flag
const fieldOpsConfig = {
    debug: false
};

let map;

function initFieldOpsMap(fieldOpsData) {
    if (fieldOpsConfig.debug) {
        console.log('Initializing field ops map with data:', fieldOpsData);
    }

    const mapContainer = document.getElementById('field-ops-map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // Get Azure Maps key
    const apiKey = mapContainer.dataset.azureMapsKey;
    if (!apiKey) {
        console.error('Azure Maps key not found');
        return;
    }

    // Initialize the map
    map = new atlas.Map('field-ops-map', {
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: apiKey
        },
        style: 'road',
        center: [-97, 39], // Center of US as default
        zoom: 4
    });

    // Wait for the map to be ready before adding data
    map.events.add('ready', () => {
        try {
            // Create a data source for field ops
            const dataSource = new atlas.source.DataSource();
            map.sources.add(dataSource);

            // Add field ops to the data source
            fieldOpsData.forEach(fieldOp => {
                const point = new atlas.data.Feature(
                    new atlas.data.Point([fieldOp.longitude, fieldOp.latitude]),
                    {
                        name: fieldOp.name,
                        slug: fieldOp.slug,
                        ring_size: fieldOp.ring_size
                    }
                );
                dataSource.add(point);

                // Add ring around field op
                const ring = new atlas.data.Feature(
                    new atlas.data.Point([fieldOp.longitude, fieldOp.latitude]),
                    {
                        subType: 'Circle',
                        radius: fieldOp.ring_size * 1000 // Convert km to meters
                    }
                );
                dataSource.add(ring);
            });

            // Add a symbol layer for field op points
            map.layers.add(new atlas.layer.SymbolLayer(
                dataSource,
                'fieldops-points',
                {
                    filter: ['!', ['has', 'subType']], // Only show points, not rings
                    iconOptions: {
                        image: 'pin-blue',
                        anchor: 'center',
                        size: 1.0,
                        allowOverlap: true
                    },
                    textOptions: {
                        textField: ['get', 'name'],
                        offset: [0, -2],
                        anchor: 'top',
                        font: ['StandardFont-Bold'],
                        size: 12,
                        color: 'black',
                        haloColor: 'white',
                        haloWidth: 1
                    }
                }
            ));

            // Add a polygon layer for the rings
            map.layers.add(new atlas.layer.PolygonLayer(
                dataSource,
                'fieldops-rings',
                {
                    filter: ['==', ['get', 'subType'], 'Circle'],
                    fillColor: 'rgba(255, 0, 0, 0.1)',
                    strokeColor: 'red',
                    strokeWidth: 2
                }
            ));

            // Calculate bounds to show all field ops
            if (fieldOpsData.length > 0) {
                const bounds = new atlas.data.BoundingBox(
                    Math.min(...fieldOpsData.map(fo => fo.longitude)),
                    Math.min(...fieldOpsData.map(fo => fo.latitude)),
                    Math.max(...fieldOpsData.map(fo => fo.longitude)),
                    Math.max(...fieldOpsData.map(fo => fo.latitude))
                );

                // Set the camera to show all field ops
                map.setCamera({
                    bounds: bounds,
                    padding: 50
                });
            }

            // Add click events for field ops
            map.events.add('click', 'fieldops-points', (e) => {
                if (e.shapes && e.shapes[0]) {
                    const properties = e.shapes[0].getProperties();
                    // Navigate to field op detail page
                    window.location.href = `/fieldop/${properties.id}/`;
                }
            });

            if (fieldOpsConfig.debug) {
                console.log('Map initialization complete');
            }

        } catch (error) {
            console.error('Error initializing map:', error);
        }
    });
}
