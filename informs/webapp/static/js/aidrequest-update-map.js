(function() {
    'use strict';

    const modalMapConfig = {
        debug: true,
    };

    window.initializeModalMap = function() {
        if (modalMapConfig.debug) console.log('[ModalMap] Attempting to initialize...');

        const wrapper = document.getElementById('form-c-content-modal');
        if (!wrapper) { if (modalMapConfig.debug) console.error('[ModalMap] Wrapper #form-c-content-modal not found.'); return; }

        const mapContainer = document.getElementById('map-container-modal');
        if (!mapContainer) { if (modalMapConfig.debug) console.error('[ModalMap] Map container #map-container-modal not found.'); return; }

        const subscriptionKey = wrapper.dataset.azureMapsKey;
        const geocodeUrl = wrapper.dataset.geocodeUrl;
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
        const fieldOpLat = parseFloat(wrapper.dataset.fieldopLat);
        const fieldOpLon = parseFloat(wrapper.dataset.fieldopLon);
        const fieldOpPosition = (!isNaN(fieldOpLat) && !isNaN(fieldOpLon)) ? [fieldOpLon, fieldOpLat] : null;

        if (!subscriptionKey) { if (modalMapConfig.debug) console.error('[ModalMap] Azure Maps key not found on wrapper.'); return; }
        if (!geocodeUrl) { if (modalMapConfig.debug) console.error('[ModalMap] Geocode URL not found on wrapper.'); return; }
        if (!csrfToken) { if (modalMapConfig.debug) console.error('[ModalMap] CSRF token not found.'); return; }

        const latInput = document.getElementById('id_latitude_modal');
        const lonInput = document.getElementById('id_longitude_modal');
        const coordinatesInput = document.getElementById('id_coordinates');
        const cityInput = document.getElementById('id_city');
        const stateInput = document.getElementById('id_state');
        const streetInput = document.getElementById('id_address_line_1');
        const noteInput = document.getElementById('id_note_modal');
        const resetMapBtn = document.getElementById('reset-map-modal');
        const distanceDisplay = document.getElementById('distance-display');
        const sourceInput = document.getElementById('id_location_source_modal');

        if (!latInput || !lonInput || !coordinatesInput || !cityInput || !stateInput || !streetInput || !noteInput || !resetMapBtn || !distanceDisplay || !sourceInput) {
            if (modalMapConfig.debug) console.error('[ModalMap] A required form input or button was not found.');
            return;
        }

        const dbPosition = [parseFloat(lonInput.value), parseFloat(latInput.value)];

        const map = new atlas.Map(mapContainer.id, {
            authOptions: { authType: 'subscriptionKey', subscriptionKey: subscriptionKey },
            center: dbPosition.some(isNaN) ? fieldOpPosition || [-98.5, 39.8] : dbPosition,
            zoom: dbPosition.some(isNaN) ? (fieldOpPosition ? 8 : 3) : 10,
            style: 'road',
            showFeedbackLink: false,
            showLogo: false,
        });

        map.controls.add(new atlas.control.ZoomControl(), { position: 'top-left' });

        map.events.add('ready', async function() {
            if (modalMapConfig.debug) console.log('[ModalMap] Map ready.');

            function updateDistance(requestPosition) {
                if (!fieldOpPosition || !requestPosition) {
                    distanceDisplay.innerHTML = '';
                    return;
                }
                const distance = atlas.math.getDistanceTo(requestPosition, fieldOpPosition, 'kilometers');
                distanceDisplay.innerHTML = `Distance from Field Op: <strong>${distance.toFixed(1)} km</strong>`;
            }

            function updateForm(position, note = null) {
                const lat = position[1].toFixed(5);
                const lon = position[0].toFixed(5);
                latInput.value = lat;
                lonInput.value = lon;
                coordinatesInput.value = `${lat}, ${lon}`;
                sourceInput.value = 'manual';
                if (note) noteInput.value = note;
                if (modalMapConfig.debug) console.log(`[ModalMap] Form updated: lat=${lat}, lon=${lon}, source=manual`);
                updateDistance(position);
            }

            async function reverseGeocode(position) {
                const url = `https://atlas.microsoft.com/search/address/reverse/json?api-version=1.0&query=${position[1]},${position[0]}&subscription-key=${subscriptionKey}`;
                try {
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.addresses && data.addresses.length > 0) return data.addresses[0].address.freeformAddress;
                } catch (error) { console.error('[ModalMap] Reverse geocode fetch error:', error); }
                return 'N/A';
            }

            async function geocodeAddress() {
                if (!cityInput.value || !stateInput.value) {
                    if (modalMapConfig.debug) console.log('[ModalMap] Not enough address info to geocode.');
                    return dbPosition.some(isNaN) ? null : dbPosition;
                }
                try {
                    const response = await fetch(geocodeUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                        body: JSON.stringify({ city: cityInput.value, state: stateInput.value, street_address: streetInput.value })
                    });
                    const data = await response.json();
                    if (response.ok && data.latitude && data.longitude) {
                        const position = [data.longitude, data.latitude];
                        const note = `Geocoded from address: ${cityInput.value}, ${stateInput.value}.`;
                        updateForm(position, note);
                        return position;
                    }
                    console.error('[ModalMap] Geocode failed:', data.error);
                } catch (error) { console.error('[ModalMap] Geocode fetch error:', error); }
                return dbPosition.some(isNaN) ? null : dbPosition;
            }

            const initialPosition = await geocodeAddress();
            if (!initialPosition || !Array.isArray(initialPosition) || initialPosition.some(isNaN)) {
                if (modalMapConfig.debug) console.error('[ModalMap] No valid initial position found after geocoding. Aborting map setup.', initialPosition);
                return;
            }

            // --- Set Camera ---
            if (fieldOpPosition && initialPosition) {
                const positions = [initialPosition, fieldOpPosition];
                const bounds = atlas.data.BoundingBox.fromPositions(positions);
                map.setCamera({
                    bounds: bounds,
                    padding: { top: 50, bottom: 80, left: 50, right: 50 }
                });
                 if (modalMapConfig.debug) console.log('[ModalMap] Setting camera to bounds containing both points.');
            } else {
                map.setCamera({ center: initialPosition, zoom: 14 });
                 if (modalMapConfig.debug) console.log('[ModalMap] Setting camera to initial position.');
            }

            const requestMarker = new atlas.HtmlMarker({ position: initialPosition, draggable: true });
            map.markers.add(requestMarker);

            if (fieldOpPosition) {
                if (modalMapConfig.debug) console.log('[ModalMap] Creating Field Op marker at:', fieldOpPosition);
                const fieldOpMarker = new atlas.HtmlMarker({
                    position: fieldOpPosition,
                    color: 'dodgerblue',
                    text: 'F',
                    draggable: false
                });
                map.markers.add(fieldOpMarker);
                updateDistance(initialPosition);
            }

            map.events.add('dragend', requestMarker, async () => {
                const pos = requestMarker.getOptions().position;
                const address = await reverseGeocode(pos);
                updateForm(pos, `User dragged pin. Reverse geocoded to: ${address}`);
            });

            map.events.add('click', async (e) => {
                const pos = e.position;
                requestMarker.setOptions({ position: pos });
                const address = await reverseGeocode(pos);
                updateForm(pos, `User clicked map. Reverse geocoded to: ${address}`);
            });

            resetMapBtn.addEventListener('click', async () => {
                if (modalMapConfig.debug) console.log('[ModalMap] Reset button clicked.');
                const resetPosition = await geocodeAddress();
                if (resetPosition) {
                    requestMarker.setOptions({ position: resetPosition });
                    map.setCamera({ center: resetPosition, zoom: 14 });
                }
            });
        });
    };
})();
