// informs/webapp/static/js/aidrequest-submitted-map.js

const scriptConfig = {
    debug: false, // Set to true for development logging
};

document.addEventListener('DOMContentLoaded', function () {
    const mapElement = document.getElementById('aid-request-submitted-map');
    if (!mapElement) {
        console.log('Submitted map element not found.');
        return;
    }

    const config = {
        azureMapsKey: mapElement.dataset.azureMapsKey,
        requestLat: parseFloat(mapElement.dataset.requestLat),
        requestLon: parseFloat(mapElement.dataset.requestLon),
        fieldOpLat: parseFloat(mapElement.dataset.fieldopLat),
        fieldOpLon: parseFloat(mapElement.dataset.fieldopLon),
        fieldOpRingSize: parseFloat(mapElement.dataset.fieldopRingsize),
        debug: scriptConfig.debug,
    };

    if (config.debug) {
        console.log('Submitted map config:', config);
    }

    const map = initializeMap(mapElement.id, config.azureMapsKey, {
        center: [config.requestLon, config.requestLat],
        zoom: 12,
        style: 'satellite_road_labels',
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: config.azureMapsKey
        }
    });

    map.events.add('ready', function () {
        // Create data sources
        const requestDataSource = new atlas.source.DataSource();
        const fieldOpDataSource = new atlas.source.DataSource();
        map.sources.add([requestDataSource, fieldOpDataSource]);

        // Add points to data sources
        const requestPoint = new atlas.data.Point([config.requestLon, config.requestLat]);
        requestDataSource.add(new atlas.data.Feature(requestPoint, { name: 'Aid Request' }));

        const fieldOpPoint = new atlas.data.Point([config.fieldOpLon, config.fieldOpLat]);
        fieldOpDataSource.add(new atlas.data.Feature(fieldOpPoint, { name: 'Field Op' }));

        // Create and add layers
        const requestLayer = new atlas.layer.SymbolLayer(requestDataSource, null, {
            iconOptions: { image: 'marker-red' },
            textOptions: {
                textField: ['get', 'name'],
                offset: [0, -1.5],
                color: '#fff',
                haloColor: '#000',
                haloWidth: 1
            }
        });

        const fieldOpLayer = new atlas.layer.SymbolLayer(fieldOpDataSource, null, {
            iconOptions: { image: 'marker-blue' },
             textOptions: {
                textField: ['get', 'name'],
                offset: [0, 1.5],
                color: '#fff',
                haloColor: '#000',
                haloWidth: 1
            }
        });

        // Add radius circle for Field Op
        if (config.fieldOpRingSize > 0) {
            const radiusInMeters = config.fieldOpRingSize * 1000; // km to meters
            fieldOpDataSource.add(new atlas.data.Feature(new atlas.data.Polygon([[
                atlas.data.getPointFeaturesWithinDistance(fieldOpPoint, radiusInMeters)[0].geometry.coordinates[0]
            ]])));

            const radiusLayer = new atlas.layer.PolygonLayer(fieldOpDataSource, null, {
                fillColor: 'rgba(0, 150, 255, 0.2)',
                strokeColor: 'rgba(0, 150, 255, 0.8)',
                strokeWidth: 2
            });
            map.layers.add(radiusLayer, 'labels');
        }

        map.layers.add([requestLayer, fieldOpLayer]);

        // Set camera to view both points
        const bounds = atlas.data.BoundingBox.fromData([requestPoint, fieldOpPoint]);
        map.setCamera({
            bounds: bounds,
            padding: 100
        });

        // Add legend
        const legend = new atlas.control.LegendControl({
            title: 'Legend',
            legends: [
                {
                    type: 'image',
                    label: 'Aid Request',
                    marker: 'marker-red'
                },
                {
                    type: 'image',
                    label: 'Field Op',
                    marker: 'marker-blue'
                },
                {
                    type: 'shape',
                    label: 'Op Radius',
                    shapeColor: 'rgba(0, 150, 255, 0.2)'
                }
            ]
        });
        map.controls.add(legend, { position: 'bottom-right' });
    });
});
