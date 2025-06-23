/*
 * Azure Maps location picker for AidRequest form
 */
const aidRequestFormMapConfig = {
    debug: true,
};

function initAidRequestLocationPicker(wrapper) {
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

    if (!wrapper) {
        if (aidRequestFormMapConfig.debug) console.log('[initAidRequestLocationPicker] No wrapper element provided.');
        return;
    }
    if (aidRequestFormMapConfig.debug) console.log(`[initAidRequestLocationPicker] Called with wrapper:`, wrapper);

    const mapContainer = document.getElementById('aid-request-location-picker-map');
    if (!mapContainer) {
        if (aidRequestFormMapConfig.debug) console.error(`[initAidRequestLocationPicker] Map container #aid-request-location-picker-map not found.`);
        return;
    }
    if (aidRequestFormMapConfig.debug) console.log(`[initAidRequestLocationPicker] Map container found:`, mapContainer);

    const geocodeUrl = mapContainer.dataset.geocodeUrl;
    if (!geocodeUrl) {
        if (aidRequestFormMapConfig.debug) console.error('[initAidRequestLocationPicker] Geocode URL not provided via data-geocode-url attribute on map container.');
        return;
    }
    if (aidRequestFormMapConfig.debug) console.log(`[initAidRequestLocationPicker] Geocode URL: ${geocodeUrl}`);

    const initialLat = parseFloat(mapContainer.dataset.initialLat);
    const initialLon = parseFloat(mapContainer.dataset.initialLon);
    const fieldOpLat = parseFloat(mapContainer.dataset.fieldopLat);
    const fieldOpLon = parseFloat(mapContainer.dataset.fieldopLon);

    if (aidRequestFormMapConfig.debug) console.log("[initAidRequestLocationPicker] Initial Lat/Lon from container data:", initialLat, initialLon);
    if (aidRequestFormMapConfig.debug) console.log("[initAidRequestLocationPicker] Field Op Lat/Lon from container data:", fieldOpLat, fieldOpLon);

    const subscriptionKey = mapContainer.dataset.azureMapsKey;
    if (!subscriptionKey) {
        if (aidRequestFormMapConfig.debug) console.error('[initAidRequestLocationPicker] Azure Maps subscription key not found on map container.');
        return;
    }
    if (aidRequestFormMapConfig.debug) console.log(`[initAidRequestLocationPicker] Azure Maps Key found.`);

    const config = {
        latInputId: 'id_latitude',
        lonInputId: 'id_longitude',
        streetAddressInputId: 'id_street_address',
        cityInputId: 'id_city',
        stateInputId: 'id_state',
        countryInputId: 'id_country',
        getLocationBtnId: 'get-location',
        locationModifiedInputId: 'id_location_modified',
        coordinatesInputId: 'id_coordinates',
        locationNoteInputId: 'id_location_note',
        locationSourceInputId: 'id_location_source',
        confirmLocationBtnId: 'confirm-location',
    };

    const latInput = document.getElementById(config.latInputId);
    const lonInput = document.getElementById(config.lonInputId);
    const streetAddressInput = document.getElementById(config.streetAddressInputId);
    const cityInput = document.getElementById(config.cityInputId);
    const stateInput = document.getElementById(config.stateInputId);
    const countryInput = document.getElementById(config.countryInputId);
    const getLocationBtn = document.getElementById(config.getLocationBtnId);
    const locationModifiedInput = document.getElementById(config.locationModifiedInputId);
    const coordinatesInput = document.getElementById(config.coordinatesInputId);
    const locationNoteInput = document.getElementById(config.locationNoteInputId);
    const locationSourceInput = document.getElementById(config.locationSourceInputId);
    const confirmLocationBtn = document.getElementById(config.confirmLocationBtnId);

    if (!latInput || !lonInput || !streetAddressInput || !cityInput || !stateInput || !getLocationBtn || !locationModifiedInput || !coordinatesInput || !locationNoteInput || !locationSourceInput) {
        console.error('One or more required form fields or buttons are missing.');
        return;
    }

    function reverseGeocode(position) {
        const reverseGeocodeUrl = `https://atlas.microsoft.com/search/address/reverse/json?api-version=1.0&query=${position[1]},${position[0]}&subscription-key=${subscriptionKey}`;
        return fetch(reverseGeocodeUrl)
            .then(response => response.json())
            .then(data => {
                if (data.addresses && data.addresses.length > 0) {
                    const address = data.addresses[0].address;
                    if(cityInput) cityInput.value = address.municipality || '';
                    if(stateInput) stateInput.value = address.countrySubdivisionName || '';
                    if(streetAddressInput) streetAddressInput.value = address.streetNameAndNumber || address.streetName || '';
                }
                return data;
            })
            .catch(error => {
                console.error('Error during reverse geocoding:', error);
                return null;
            });
    }

    let cameraOptions = {};
    let initialPosition = null;
    let fieldOpPosition = null;

    if (initialLat && initialLon && !isNaN(initialLat) && !isNaN(initialLon)) {
        initialPosition = [initialLon, initialLat];
    }
    if (fieldOpLat && fieldOpLon && !isNaN(fieldOpLat) && !isNaN(fieldOpLon)) {
        fieldOpPosition = [fieldOpLon, fieldOpLat];
    }

    const arePointsIdentical = initialPosition && fieldOpPosition &&
        initialPosition[0] === fieldOpPosition[0] &&
        initialPosition[1] === fieldOpPosition[1];

    if (initialPosition && fieldOpPosition && !arePointsIdentical) {
        cameraOptions.bounds = atlas.data.BoundingBox.fromPositions([initialPosition, fieldOpPosition]);
        cameraOptions.padding = { top: 100, bottom: 100, left: 100, right: 100 };
    } else if (initialPosition) {
        cameraOptions.center = initialPosition;
        cameraOptions.zoom = 10;
    } else if (fieldOpPosition) {
        cameraOptions.center = fieldOpPosition;
        cameraOptions.zoom = 8;
    } else {
        cameraOptions.center = [-98.5795, 39.8283];
        cameraOptions.zoom = 3;
    }

    try {
        map = new atlas.Map(mapContainer.id, {
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: subscriptionKey
            },
            style: 'road',
            showFeedbackLink: false,
            showLogo: false,
            scrollZoomInteraction: false,
            ...cameraOptions
        });

        const controls = [new atlas.control.ZoomControl()];
        map.controls.add(controls, { position: 'top-left' });

        map.events.add('ready', onMapReady);
    } catch (error) {
        console.error('Error initializing map:', error);
    }

    document.addEventListener('resetLocationView', () => {
        if (aidRequestFormMapConfig.debug) console.log('[resetLocationView] Event received. Resetting map state.');

        if (marker) {
            marker.setOptions({ visible: false });
        }

        if (datasource) {
            datasource.clear();
        }

        const distanceDisplay = document.getElementById('distance-display');
        if (distanceDisplay) {
            distanceDisplay.innerHTML = '';
        }

        if (map) {
            if (fieldOpPosition) {
                map.setCamera({
                    center: fieldOpPosition,
                    zoom: 8
                });
            } else {
                map.setCamera({
                    center: [-98.5795, 39.8283],
                    zoom: 3
                });
            }
        }
    });

    function onMapReady() {
        if (aidRequestFormMapConfig.debug) console.log('[initAidRequestLocationPicker] Map is ready.');

        datasource = new atlas.source.DataSource();
        map.sources.add(datasource);

        map.layers.add(new atlas.layer.LineLayer(datasource, null, {
            strokeColor: '#2272B9',
            strokeWidth: 5,
            lineDash: [2, 2]
        }));

        if (initialPosition) {
            marker = new atlas.HtmlMarker({
                position: initialPosition,
                draggable: true,
                visible: true
            });
            map.markers.add(marker);
        } else {
            marker = new atlas.HtmlMarker({
                position: fieldOpPosition || [0, 0],
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

        if (initialPosition && fieldOpPosition) {
            updateMapViewAndDistance(initialPosition);
        }

        // If there's an address in the form, geocode it on load.
        if (cityInput.value && stateInput.value) {
            geocodeAndCenter();
        }

        map.events.add('dragend', marker, async function () {
            locationSource = 'user_picked';
            const position = marker.getOptions().position;
            const geocodeData = await reverseGeocode(position);
            updateFormFields(position, geocodeData, 'reverse_geocoded');
            updateMapViewAndDistance(position);
        });

        map.events.add('click', async function (e) {
            locationSource = 'user_picked';
            const position = e.position;
            marker.setOptions({ position: position, visible: true });
            const geocodeData = await reverseGeocode(position);
            updateFormFields(position, geocodeData, 'reverse_geocoded');
            updateMapViewAndDistance(position);
        });

        getLocationBtn.addEventListener('click', function() {
            locationSource = 'device_location';
            getUserLocation();
        });

        const debouncedUpdate = debounce(geocodeAndCenter, 500);
        streetAddressInput.addEventListener('input', debouncedUpdate);
        cityInput.addEventListener('input', debouncedUpdate);
        stateInput.addEventListener('input', debouncedUpdate);
    }

    function updateMapViewAndDistance(newPosition) {
        if (map && newPosition && fieldOpPosition) {
            const newBounds = atlas.data.BoundingBox.fromPositions([newPosition, fieldOpPosition]);
            map.setCamera({
                bounds: newBounds,
                padding: { top: 100, bottom: 100, left: 100, right: 100 }
            });

            const line = new atlas.data.LineString([newPosition, fieldOpPosition]);
            datasource.clear();
            datasource.add(line);
            updateDistance(newPosition);
        }
    }

    function updateDistance(position) {
        const distanceDisplay = document.getElementById('distance-display');
        if (!distanceDisplay || !fieldOpPosition) return;

        const R = 6371; // Radius of the Earth in km
        const dLat = (position[1] - fieldOpPosition[1]) * Math.PI / 180;
        const dLon = (position[0] - fieldOpPosition[0]) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(fieldOpPosition[1] * Math.PI / 180) * Math.cos(position[1] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance in km

        const distanceInMiles = distance * 0.621371;
        distanceDisplay.innerHTML = `Distance from Field Op: ${distanceInMiles.toFixed(2)} miles`;
    }

    function updateFormFields(position, geocodeData, geocodeType) {
        const detail = {
            source: locationSource,
            position: position,
            geocodeData: geocodeData,
            geocodeType: geocodeType,
            log: [
                '--------------------',
                `Timestamp: ${new Date().toISOString()}`,
                `Source: ${locationSource}`
            ]
        };
        document.dispatchEvent(new CustomEvent('locationUpdated', { detail: detail }));
    }

    function updateMapFromForm() {
        const lat = parseFloat(latInput.value);
        const lon = parseFloat(lonInput.value);

        if (!isNaN(lat) && !isNaN(lon)) {
            const newPosition = [lon, lat];
            marker.setOptions({ position: newPosition, visible: true });
            updateMapViewAndDistance(newPosition);
        }
    }

    function setMapLocation(position) {
        marker.setOptions({ position: position, visible: true });
        updateMapViewAndDistance(position);
    }

    function getUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async position => {
                    const userPosition = [position.coords.longitude, position.coords.latitude];
                    marker.setOptions({ position: userPosition, visible: true });
                    const geocodeData = await reverseGeocode(userPosition);
                    updateFormFields(userPosition, geocodeData, 'reverse_geocoded');
                    updateMapViewAndDistance(userPosition);
                },
                () => {
                    alert('Unable to retrieve your location. Please enter it manually or click on the map.');
                }
            );
        } else {
            alert('Geolocation is not supported by this browser.');
        }
    }

    async function geocodeAndCenter() {
        const street = streetAddressInput.value;
        const city = cityInput.value;
        const state = stateInput.value;

        if (!city || !state) return;

        locationSource = 'user_typed';

        try {
            const response = await fetch(geocodeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // The CSRF token is not needed because the view is decorated with @csrf_exempt
                },
                body: JSON.stringify({
                    street_address: street,
                    city: city,
                    state: state
                })
            });
            const data = await response.json();

            if (response.ok && data.status === 'Success' && data.latitude && data.longitude) {
                const position = [data.longitude, data.latitude];
                marker.setOptions({
                    position: position,
                    visible: true
                });
                updateMapViewAndDistance(position);
                updateFormFields(position, data, 'geocoded');
            } else {
                if (aidRequestFormMapConfig.debug) console.warn('Geocoding was not successful for the address:', `${street}, ${city}, ${state}`);
            }
        } catch (error) {
            console.error('Error during geocoding request:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('aid-request-location-picker-map');
    if (mapContainer) {
        initAidRequestLocationPicker(mapContainer);
    }
});
