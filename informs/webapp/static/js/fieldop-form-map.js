/*
 * Azure Maps location picker for FieldOp form
 */
const fieldOpFormMapConfig = {
    debug: true // Set to false for production
};

let map;
let marker;

function initLocationPickerMap(mapElementId, azureMapsKey, initialLat, initialLon) {
    if (fieldOpFormMapConfig.debug) {
        console.log('Initializing location picker map with params:', { mapElementId, azureMapsKey, initialLat, initialLon });
    }

    const mapElement = document.getElementById(mapElementId);
    if (!mapElement) {
        console.error(`Map element with id '${mapElementId}' not found`);
        return;
    }

    const latInput = document.getElementById('id_latitude');
    const lonInput = document.getElementById('id_longitude');

    if (!latInput || !lonInput) {
        console.error('Latitude or Longitude input fields not found.');
        return;
    }

    let center;
    let zoom;
    let initialPosition = null;

    if (initialLat !== null && initialLon !== null && !isNaN(initialLat) && !isNaN(initialLon)) {
        initialPosition = [parseFloat(initialLon), parseFloat(initialLat)];
        center = initialPosition;
        zoom = 10;
    } else {
        // Default to center of the US
        center = [-98.5795, 39.8283];
        zoom = 3;
    }

    try {
        map = new atlas.Map(mapElementId, {
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: azureMapsKey
            },
            style: 'road',
            showFeedbackLink: false,
            showLogo: false,
            center: center,
            zoom: zoom
        });

        map.events.add('ready', function () {
            if (fieldOpFormMapConfig.debug) {
                console.log('Map is ready.');
            }

            map.controls.add(new atlas.control.ZoomControl(), {
                position: 'top-left'
            });

            marker = new atlas.HtmlMarker({
                position: initialPosition,
                draggable: true,
                visible: !!initialPosition
            });

            map.markers.add(marker);

            map.events.add('dragend', marker, function () {
                const position = marker.getOptions().position;
                if (fieldOpFormMapConfig.debug) {
                    console.log('Marker dragged to:', position);
                }
                updateFormFields(position);
            });

            map.events.add('click', function (e) {
                if (fieldOpFormMapConfig.debug) {
                    console.log('Map clicked at:', e.position);
                }
                marker.setOptions({
                    position: e.position,
                    visible: true
                });
                updateFormFields(e.position);
            });

            latInput.addEventListener('input', updateMapFromForm);
            lonInput.addEventListener('input', updateMapFromForm);
        });

    } catch (error) {
        console.error('Error initializing map:', error);
    }

    function updateFormFields(position) {
        const lat = position[1].toFixed(5);
        const lon = position[0].toFixed(5);
        latInput.value = lat;
        lonInput.value = lon;

        if (fieldOpFormMapConfig.debug) {
            console.log('Form fields updated:', { latitude: lat, longitude: lon });
        }
    }

    function updateMapFromForm() {
        const lat = parseFloat(latInput.value);
        const lon = parseFloat(lonInput.value);

        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            const position = [lon, lat];
            marker.setOptions({
                position: position,
                visible: true
            });
            if (map.getCamera().center.join(',') !== position.join(',')) {
                map.setCamera({ center: position });
            }
            if (fieldOpFormMapConfig.debug) {
                console.log('Map updated from form fields.');
            }
        }
    }
}
