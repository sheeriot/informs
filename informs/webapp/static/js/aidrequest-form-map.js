/*
 * Azure Maps location picker for AidRequest form
 */
const aidRequestFormMapConfig = {
    debug: false // Set to false for production
};

let map;
let marker;
let datasource;
let fieldOpMarker;
let locationSource = 'initial';

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

function initAidRequestLocationPicker(mapElementId) {
    if (aidRequestFormMapConfig.debug) {
        console.log('Initializing location picker map with params:', { mapElementId });
    }

    const mapElement = document.getElementById(mapElementId);
    if (!mapElement) {
        console.error(`Map element with id '${mapElementId}' not found`);
        return;
    }

    const azureMapsKey = mapElement.dataset.azureMapsKey;
    const geocodeUrl = mapElement.dataset.geocodeUrl;
    const reverseGeocodeUrl = mapElement.dataset.reverseGeocodeUrl;

    if (!azureMapsKey) {
        console.warn("Azure Maps key not provided via data-azure-maps-key attribute. Map will not initialize.");
        mapElement.innerHTML = '<div class="alert alert-warning m-0">Map is not available. Please configure Azure Maps key.</div>';
        return;
    }
    if (!geocodeUrl) {
         console.warn("Geocode URL not provided via data-geocode-url attribute. Map will not initialize.");
        return;
    }

    const initialLat = mapElement.dataset.initialLat ? parseFloat(mapElement.dataset.initialLat) : null;
    const initialLon = mapElement.dataset.initialLon ? parseFloat(mapElement.dataset.initialLon) : null;
    const fieldOpLat = mapElement.dataset.fieldopLat ? parseFloat(mapElement.dataset.fieldopLat) : null;
    const fieldOpLon = mapElement.dataset.fieldopLon ? parseFloat(mapElement.dataset.fieldopLon) : null;
    const fieldOpRingSize = mapElement.dataset.fieldopRingsize ? parseFloat(mapElement.dataset.fieldopRingsize) : null;

    const latInput = document.getElementById('id_latitude');
    const lonInput = document.getElementById('id_longitude');
    const streetAddressInput = document.getElementById('id_street_address');
    const cityInput = document.getElementById('id_city');
    const stateInput = document.getElementById('id_state');
    const countryInput = document.getElementById('id_country');
    const getLocationBtn = document.getElementById('get-location');
    const locationModifiedInput = document.getElementById('id_location_modified');
    const coordinatesInput = document.getElementById('id_coordinates');
    const locationNoteInput = document.getElementById('id_location_note');
    const confirmLocationBtn = document.getElementById('confirm-location');

    if (!latInput || !lonInput || !streetAddressInput || !cityInput || !stateInput || !getLocationBtn || !locationModifiedInput || !coordinatesInput || !locationNoteInput) {
        console.error('One or more required form fields or buttons are missing.');
        return;
    }

    // Function to perform reverse geocoding
    function reverseGeocode(position) {
        const reverseGeocodeUrl = `https://atlas.microsoft.com/search/address/reverse/json?api-version=1.0&query=${position[1]},${position[0]}&subscription-key=${azureMapsKey}`;
        fetch(reverseGeocodeUrl)
            .then(response => response.json())
            .then(data => {
                if (data.addresses && data.addresses.length > 0) {
                    const address = data.addresses[0].address;
                    if(cityInput) cityInput.value = address.municipality || '';
                    if(stateInput) stateInput.value = address.countrySubdivisionName || '';
                    if(streetAddressInput) streetAddressInput.value = address.streetNameAndNumber || '';
                }
            })
            .catch(error => console.error('Error during reverse geocoding:', error));
    }

    let cameraOptions = {};
    let initialPosition = null;
    let fieldOpPosition = null;

    if (fieldOpLat !== null && fieldOpLon !== null && !isNaN(fieldOpLat) && !isNaN(fieldOpLon)) {
        fieldOpPosition = [fieldOpLon, fieldOpLat];
    }

    if (initialLat !== null && initialLon !== null && !isNaN(initialLat) && !isNaN(initialLon)) {
        initialPosition = [initialLon, initialLat];
    }

    const hasDistinctInitialPosition = initialPosition && fieldOpPosition && (initialPosition[0] !== fieldOpPosition[0] || initialPosition[1] !== fieldOpPosition[1]);

    if (hasDistinctInitialPosition) {
        const positions = [initialPosition, fieldOpPosition];
        cameraOptions.bounds = atlas.data.BoundingBox.fromPositions(positions);
        cameraOptions.padding = { top: 100, bottom: 100, left: 100, right: 100 };
    } else if (fieldOpPosition) {
        cameraOptions.center = fieldOpPosition;
        if (fieldOpRingSize) {
            const radiusKm = fieldOpRingSize * 2;
            const latOffset = radiusKm / 111.1;
            const lonOffset = radiusKm / (111.32 * Math.cos(fieldOpLat * Math.PI / 180));
            cameraOptions.bounds = [
                fieldOpLon - lonOffset,
                fieldOpLat - latOffset,
                fieldOpLon + lonOffset,
                fieldOpLat + latOffset
            ];
            cameraOptions.padding = { top: 50, bottom: 50, left: 50, right: 50 };
        } else {
            cameraOptions.zoom = 8;
        }
    } else if (initialPosition) {
        cameraOptions.center = initialPosition;
        cameraOptions.zoom = 10;
    } else {
        cameraOptions.center = [-98.5795, 39.8283];
        cameraOptions.zoom = 3;
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
            scrollZoomInteraction: false,
            ...cameraOptions
        });

        map.events.add('ready', function () {
            if (aidRequestFormMapConfig.debug) {
                console.log('Map is ready.');
            }

            datasource = new atlas.source.DataSource();
            map.sources.add(datasource);

            map.controls.add(new atlas.control.ZoomControl(), {
                position: 'top-left'
            });

            // Only create the marker if we have a valid initial position
            if (initialPosition) {
                marker = new atlas.HtmlMarker({
                    position: initialPosition,
                    draggable: true,
                    visible: true
                });
                map.markers.add(marker);
            } else {
                // If there's no initial position, create a hidden marker that can be shown on click
                marker = new atlas.HtmlMarker({
                    position: fieldOpPosition || [0, 0], // Default to something valid if fieldOp is also missing
                    draggable: true,
                    visible: false
                });
                map.markers.add(marker);
            }

            if (fieldOpPosition) {
                fieldOpMarker = new atlas.HtmlMarker({
                    position: fieldOpPosition,
                    color: 'dodgerblue',
                    text: 'F',
                    draggable: false,
                    visible: true
                });
                map.markers.add(fieldOpMarker);
            }

            map.events.add('dragend', marker, function () {
                locationSource = 'manual_selection';
                const position = marker.getOptions().position;
                if (aidRequestFormMapConfig.debug) {
                    console.log('Marker dragged to:', position);
                }
                updateFormFields(position);
                updateDistance(position);
                reverseGeocode(position);
            });

            map.events.add('click', function (e) {
                locationSource = 'manual_selection';
                const position = e.position;
                if (aidRequestFormMapConfig.debug) {
                    console.log('Map clicked at:', position);
                }
                marker.setOptions({
                    position: position,
                    visible: true
                });
                updateFormFields(position);
                updateDistance(position);
                reverseGeocode(position);
            });

            getLocationBtn.addEventListener('click', function() {
                locationSource = 'device_location';
                getUserLocation();
            });

            coordinatesInput.addEventListener('input', function() {
                locationSource = 'manual_entry';
                updateMapFromForm();
            });

            if (confirmLocationBtn) {
                confirmLocationBtn.addEventListener('click', function() {
                    const position = marker.getOptions().position;
                    if (position) {
                        locationNoteInput.value = locationSource;
                        confirmLocationBtn.classList.remove('btn-success');
                        confirmLocationBtn.classList.add('btn-outline-success');
                        confirmLocationBtn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Location Confirmed';
                        if (aidRequestFormMapConfig.debug) {
                            console.log(`Location confirmed. Method: ${locationSource}, Position: ${position}. Note set to: ${locationNoteInput.value}`);
                        }
                    } else {
                        alert('Please select a location on the map first.');
                    }
                });
            }

            const debouncedGeocode = debounce(() => {
                const address = streetAddressInput.value;
                const city = cityInput.value;
                const state = stateInput.value;

                if (city && state) {
                    locationSource = 'geocoded_coordinates';
                    geocodeAndCenter();
                }
            }, 1500);

            if (streetAddressInput) streetAddressInput.addEventListener('input', debouncedGeocode);
            if (cityInput) cityInput.addEventListener('input', debouncedGeocode);
            if (stateInput) stateInput.addEventListener('input', debouncedGeocode);

        });

    } catch (error) {
        console.error('Error initializing map:', error);
    }

    function updateDistance(position) {
        if (!fieldOpPosition) return;
        const distance = atlas.math.getDistanceTo(position, fieldOpPosition, 'kilometers');
        const distanceDisplay = document.getElementById('distance-display');
        if (distanceDisplay) {
            distanceDisplay.innerHTML = `Distance from Field Op: <strong>${distance.toFixed(1)} km</strong>`;
        }
    }

    function updateFormFields(position) {
        const lat = position[1].toFixed(5);
        const lon = position[0].toFixed(5);
        latInput.value = lat;
        lonInput.value = lon;
        coordinatesInput.value = `${lat},${lon}`;

        if (aidRequestFormMapConfig.debug) {
            console.log('Form fields updated:', { latitude: lat, longitude: lon });
        }
        locationModifiedInput.value = 'true';
        document.dispatchEvent(new CustomEvent('locationUpdated', { detail: { source: locationSource } }));
    }

    function updateMapFromForm() {
        const parts = coordinatesInput.value.split(',');
        if (parts.length !== 2) return;

        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);

        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            latInput.value = lat.toFixed(5);
            lonInput.value = lon.toFixed(5);
            const position = [lon, lat];
            marker.setOptions({
                position: position,
                visible: true
            });
            updateMapViewAndDistance(position);
            if (aidRequestFormMapConfig.debug) {
                console.log('Map updated from form fields.');
            }
            document.dispatchEvent(new CustomEvent('locationUpdated', { detail: { source: locationSource } }));
        }
        locationModifiedInput.value = 'true';
    }

    function setMapLocation(position) {
        marker.setOptions({
            position: position,
            visible: true
        });
        updateMapViewAndDistance(position);
        updateFormFields(position);
    }

    function getUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const userPosition = [position.coords.longitude, position.coords.latitude];
                if (aidRequestFormMapConfig.debug) {
                    console.log('User location obtained:', userPosition);
                }
                setMapLocation(userPosition);
                reverseGeocode(userPosition);
            }, () => {
                alert('Unable to retrieve your location.');
            });
        } else {
            alert('Geolocation is not supported by your browser.');
        }
    }

    async function geocodeAndCenter() {
        const countryValue = countryInput ? countryInput.value : document.getElementById('id_country')?.value || 'USA';

        const address = [
            streetAddressInput.value,
            cityInput.value,
            stateInput.value,
            countryValue
        ].filter(Boolean).join(', ');

        if (!address) {
            return;
        }

        if (aidRequestFormMapConfig.debug) {
            console.log('Geocoding address:', address);
        }

        try {
            const response = await fetch(geocodeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Note: CSRF token would be needed if not exempt
                },
                body: JSON.stringify({ address: address })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Geocoding failed');
            }

            const data = await response.json();
            const position = [data.longitude, data.latitude];
            setMapLocation(position);

        } catch (error) {
            console.error('Error during geocoding:', error);
            alert('An error occurred while geocoding.');
        }
    }

    function updateMapViewAndDistance(newPosition) {
        if (!fieldOpPosition) {
            map.setCamera({
                center: newPosition,
                zoom: 14
            });
            return;
        }

        const positions = [newPosition, fieldOpPosition];
        const newBounds = atlas.data.BoundingBox.fromPositions(positions);
        map.setCamera({
            bounds: newBounds,
            padding: { top: 50, bottom: 80, left: 50, right: 50 }
        });

        updateDistance(newPosition);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const mapDiv = document.getElementById('aid-request-location-picker-map');
    if (mapDiv) {
        initAidRequestLocationPicker('aid-request-location-picker-map');
    }
});
