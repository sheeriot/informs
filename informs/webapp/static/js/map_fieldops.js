// Debug flag
const mapFieldOpsConfig = {
    debug: false
};

let map;

function initFieldOpsMap() {
    const mapElement = document.getElementById('fieldops-map');
    if (!mapElement) {
        if (mapFieldOpsConfig.debug) console.log('Map container with id "fieldops-map" not found');
        return;
    }

    const azureMapsKey = mapElement.dataset.azureMapsKey;
    if (!azureMapsKey) {
        console.error('Azure Maps key not found in data attributes');
        return;
    }

    // Determine data source: JSON array (list page) or single field op (detail page)
    let fieldOpsData = [];

    if (mapElement.dataset.fieldopsJson) {
        // List page: parse JSON array of field ops
        try {
            fieldOpsData = JSON.parse(mapElement.dataset.fieldopsJson);
            if (mapFieldOpsConfig.debug) console.log('Loaded field ops from JSON:', fieldOpsData.length);
        } catch (e) {
            console.error('Failed to parse fieldops JSON:', e);
            return;
        }
    } else if (mapElement.dataset.fieldOpName && mapElement.dataset.fieldOpSlug) {
        // Detail page: single field op from data attributes
        fieldOpsData = [{
            id: mapElement.dataset.fieldOpId || null,
            name: mapElement.dataset.fieldOpName,
            slug: mapElement.dataset.fieldOpSlug,
            latitude: parseFloat(mapElement.dataset.centerLat) || 0,
            longitude: parseFloat(mapElement.dataset.centerLon) || 0
        }];
        if (mapFieldOpsConfig.debug) console.log('Loaded single field op from attributes:', fieldOpsData[0].name);
    } else {
        if (mapFieldOpsConfig.debug) console.log('No field op data found - map will not initialize');
        return;
    }

    if (fieldOpsData.length === 0) {
        if (mapFieldOpsConfig.debug) console.log('No field ops to display');
        return;
    }

    // Initialize map
    map = new atlas.Map('fieldops-map', {
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: azureMapsKey
        },
        style: 'road',
        showFeedbackLink: false,
        showLogo: false
    });

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
            // --- Draw the Operational Ring (detail page only) ---
            const ringSize = parseFloat(mapElement.dataset.ringSize) || 0;
            const centerLon = parseFloat(mapElement.dataset.centerLon);
            const centerLat = parseFloat(mapElement.dataset.centerLat);

            if (!isNaN(centerLon) && !isNaN(centerLat) && ringSize > 0) {
                const centerPosition = new atlas.data.Position(centerLon, centerLat);
                const ringSource = new atlas.source.DataSource();
                map.sources.add(ringSource);

                const fieldOpRing = new atlas.data.Feature(
                    new atlas.data.Point(centerPosition), {
                        subType: 'Circle',
                        radius: ringSize * 1000 // Convert km to meters
                    }
                );
                ringSource.add(fieldOpRing);

                map.layers.add(new atlas.layer.PolygonLayer(ringSource, null, {
                    fillColor: 'rgba(255, 0, 0, 0.2)',
                    strokeColor: 'red',
                    strokeWidth: 2
                }));

                // Set camera to focus on the ring
                map.setCamera({
                    center: [centerLon, centerLat],
                    zoom: 8,
                    type: 'fly'
                });
            }

            // Create a data source for field ops
            const dataSource = new atlas.source.DataSource(undefined, {
                cluster: true
            });
            map.sources.add(dataSource);

            // Add field ops to the data source
            const bounds = [];
            fieldOpsData.forEach(fieldOp => {
                const lon = parseFloat(fieldOp.longitude) || 0;
                const lat = parseFloat(fieldOp.latitude) || 0;
                if (lon !== 0 || lat !== 0) {
                    const point = new atlas.data.Feature(
                        new atlas.data.Point([lon, lat]),
                        {
                            name: fieldOp.name,
                            slug: fieldOp.slug,
                            id: fieldOp.id
                        }
                    );
                    dataSource.add(point);
                    bounds.push([lon, lat]);
                }
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
                    filter: ['!', ['has', 'point_count']],
                    minZoom: 0,
                    maxZoom: 24
                }
            );
            map.layers.add(symbolLayer);

            // Fit bounds for list view (multiple points, no ring)
            if (bounds.length > 1 && ringSize === 0) {
                map.setCamera({
                    bounds: atlas.data.BoundingBox.fromPositions(bounds),
                    padding: 50
                });
            } else if (bounds.length === 1 && ringSize === 0) {
                // Single point without ring
                map.setCamera({
                    center: bounds[0],
                    zoom: 10
                });
            }

            // Add click events for clusters
            map.events.add('click', clusterLayer, (e) => {
                if (e.shapes && e.shapes[0].properties.cluster) {
                    dataSource.getClusterExpansionZoom(e.shapes[0].properties.cluster_id).then((zoom) => {
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

            // Zoom to fit button
            const zoomToFitBtn = document.getElementById('zoom-to-fit');
            if (zoomToFitBtn && bounds.length > 0) {
                zoomToFitBtn.addEventListener('click', function() {
                    if (bounds.length > 1) {
                        map.setCamera({
                            bounds: atlas.data.BoundingBox.fromPositions(bounds),
                            padding: 50,
                            type: 'fly'
                        });
                    } else {
                        map.setCamera({
                            center: bounds[0],
                            zoom: 10,
                            type: 'fly'
                        });
                    }
                });
            }

        } catch (error) {
            console.error('Error in map ready handler:', error);
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('fieldops-map')) {
        initFieldOpsMap();
    }
});
