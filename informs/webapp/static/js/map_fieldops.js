// Debug flag
const mapFieldOpsConfig = {
    debug: false
};

let map;

function initFieldOpsMap(fieldOpsData) {
    if (!fieldOpsData || fieldOpsData.length === 0) {
        console.error('No field ops data provided');
        return;
    }

    // Calculate and set bounds
    const mapElement = document.getElementById('field-ops-map');
    if (!mapElement) {
        console.error('Map container not found');
        return;
    }

    // Set bounds data attributes for map_init.js
    mapElement.dataset.boundsWest = Math.min(...fieldOpsData.map(fo => fo.longitude));
    mapElement.dataset.boundsSouth = Math.min(...fieldOpsData.map(fo => fo.latitude));
    mapElement.dataset.boundsEast = Math.max(...fieldOpsData.map(fo => fo.longitude));
    mapElement.dataset.boundsNorth = Math.max(...fieldOpsData.map(fo => fo.latitude));

    // Initialize map using shared initialization
    map = initializeMap('field-ops-map');
    if (!map) {
        console.error('Failed to initialize map');
        return;
    }

    // Add zoom control
    map.controls.add(new atlas.control.ZoomControl(), {
        position: 'top-left'
    });

    // Wait for the map to be ready before adding data
    map.events.add('ready', function() {
        try {
            // Create a data source for field ops
            const dataSource = new atlas.source.DataSource(undefined, {
                cluster: true
            });
            map.sources.add(dataSource);

            // Add field ops to the data source
            fieldOpsData.forEach(fieldOp => {
                const point = new atlas.data.Feature(
                    new atlas.data.Point([fieldOp.longitude, fieldOp.latitude]),
                    {
                        name: fieldOp.name,
                        slug: fieldOp.slug,
                        id: fieldOp.id
                    }
                );
                dataSource.add(point);
            });

            // Add a cluster layer
            const clusterLayer = new atlas.layer.BubbleLayer(dataSource, 'clusters', {
                radius: 12,
                color: '#1B87EC',
                strokeColor: 'white',
                strokeWidth: 2,
                filter: ['has', 'point_count'],
                maxZoom: 14
            });
            map.layers.add(clusterLayer);

            // Add a number count to the cluster
            const clusterLabelLayer = new atlas.layer.SymbolLayer(dataSource, 'cluster-labels', {
                iconOptions: {
                    image: 'none'
                },
                textOptions: {
                    textField: ['get', 'point_count_abbreviated'],
                    offset: [0, 0.4],
                    color: 'white',
                    size: 12,
                    font: ['StandardFont-Bold'],
                    ignorePlacement: true,
                    allowOverlap: true
                },
                filter: ['has', 'point_count']
            });
            map.layers.add(clusterLabelLayer);

            // Create the symbol layer for individual points
            const symbolLayer = new atlas.layer.SymbolLayer(
                dataSource,
                'fieldops-points',
                {
                    iconOptions: {
                        image: 'pin-round-blue',
                        anchor: 'center',
                        allowOverlap: true,
                        ignorePlacement: false,
                        size: 1.0
                    },
                    textOptions: {
                        textField: ['get', 'name'],
                        offset: [0, -2],
                        anchor: 'top',
                        font: ['StandardFont-Bold'],
                        size: 12,
                        color: '#000000',
                        haloColor: '#FFFFFF',
                        haloWidth: 1,
                        allowOverlap: true,
                        ignorePlacement: false
                    },
                    filter: ['!', ['has', 'point_count']], // Only show individual points
                    minZoom: 0,
                    maxZoom: 24
                }
            );
            map.layers.add(symbolLayer);

            // Add click events for clusters
            map.events.add('click', clusterLayer, (e) => {
                if (e.shapes && e.shapes[0].properties.cluster) {
                    // Get the cluster expansion zoom level
                    dataSource.getClusterExpansionZoom(e.shapes[0].properties.cluster_id).then((zoom) => {
                        // Update the map camera to zoom into the cluster
                        map.setCamera({
                            center: e.position,
                            zoom: zoom,
                            type: 'ease',
                            duration: 200
                        });
                    });
                }
            });

            // Add popups
            const popup = new atlas.Popup({
                pixelOffset: [0, -20]
            });

            // Add mouse events
            map.events.add('mouseover', symbolLayer, function(e) {
                map.getCanvasContainer().style.cursor = 'pointer';
                if (e.shapes && e.shapes[0]) {
                    const properties = e.shapes[0].getProperties();
                    popup.setOptions({
                        content: `<div style="padding: 10px;"><strong>${properties.name}</strong></div>`,
                        position: e.position
                    });
                    popup.open(map);
                }
            });

            map.events.add('mouseout', symbolLayer, function() {
                map.getCanvasContainer().style.cursor = 'grab';
                popup.close();
            });

            map.events.add('click', symbolLayer, function(e) {
                if (e.shapes && e.shapes[0]) {
                    const properties = e.shapes[0].getProperties();
                    if (properties.slug) {
                        window.location.href = `/fieldop/${properties.slug}/`;
                    }
                }
            });

        } catch (error) {
            console.error('Error in map ready handler:', error);
        }
    });
}
