(function() {
    'use strict';

    const locationPickerConfig = {
        debug: true,
    };

    // Make this function globally available to be called from other scripts
    window.initializeLocationPicker = function(mapContainerId) {
        if (locationPickerConfig.debug) console.log(`[LocationPicker] Initializing for map container #${mapContainerId}`);

        const mapContainer = document.getElementById(mapContainerId);
        if (!mapContainer) {
            if (locationPickerConfig.debug) console.error(`[LocationPicker] Map container #${mapContainerId} not found.`);
            return;
        }

        // --- All the logic from initAidRequestLocationPicker goes here ---
        // I will adapt it to read config from the mapContainer's data attributes
        // instead of hardcoded IDs.

        const subscriptionKey = mapContainer.dataset.azureMapsKey;
        const geocodeUrl = mapContainer.dataset.geocodeUrl;
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value; // This can stay global

        const latInput = document.getElementById(mapContainer.dataset.latInputId);
        const lonInput = document.getElementById(mapContainer.dataset.lonInputId);
        const sourceInput = document.getElementById(mapContainer.dataset.sourceInputId);
        const noteInput = document.getElementById(mapContainer.dataset.noteInputId);

        // Address fields are optional for some implementations
        const cityInput = document.getElementById('id_city');
        const stateInput = document.getElementById('id_state');
        const streetInput = document.getElementById('id_street_address');
        const confirmLocationBtn = document.getElementById('confirm-location');

        // Remove highlight on manual input to indicate user override
        [cityInput, stateInput, streetInput].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    input.classList.remove('field-highlight');
                });
            }
        });

        if (locationPickerConfig.debug) {
            console.log('[LocationPicker] Checking required data and elements...');
            console.log(`  - subscriptionKey: ${subscriptionKey ? 'Found' : 'Missing'}`);
            console.log(`  - geocodeUrl: ${geocodeUrl ? 'Found' : 'Missing'}`);
            console.log(`  - latInput (${mapContainer.dataset.latInputId}): ${latInput ? 'Found' : 'Missing'}`);
            console.log(`  - lonInput (${mapContainer.dataset.lonInputId}): ${lonInput ? 'Found' : 'Missing'}`);
            // Optional fields
            console.log(`  - sourceInput (${mapContainer.dataset.sourceInputId}): ${sourceInput ? 'Found' : 'Missing'}`);
            console.log(`  - noteInput (${mapContainer.dataset.noteInputId}): ${noteInput ? 'Found' : 'Missing'}`);
        }

        // Only the key and the core lat/lon inputs are absolutely required.
        if (!subscriptionKey || !latInput || !lonInput) {
            console.error('[LocationPicker] Critical data or element missing. Check for a valid Azure Maps key and lat/lon input field IDs.');
            return;
        }

        const initialLat = parseFloat(mapContainer.dataset.initialLat);
        const initialLon = parseFloat(mapContainer.dataset.initialLon);
        const fieldOpLat = parseFloat(mapContainer.dataset.fieldopLat);
        const fieldOpLon = parseFloat(mapContainer.dataset.fieldopLon);
        const fieldOpPosition = (!isNaN(fieldOpLat) && !isNaN(fieldOpLon)) ? [fieldOpLon, fieldOpLat] : null;
        let initialPosition = (!isNaN(initialLat) && !isNaN(initialLon)) ? [initialLon, initialLat] : null;

        function getZoomFromRingSize(ringSizeInKm, latitude) {
            if (!ringSizeInKm || ringSizeInKm <= 0) return 8; // Default zoom if no ring size

            // The visible diameter should be ~3x the ring's diameter for context.
            // ringSize is a radius in KM. Diameter in meters is radius * 2 * 1000.
            const desiredDiameter = ringSizeInKm * 2 * 1000 * 3;
            const earthCircumference = 40075016.686; // in meters
            const latitudeRadians = latitude * (Math.PI / 180);

            // Adjust circumference for latitude
            const circumferenceAtLat = earthCircumference * Math.cos(latitudeRadians);

            // Calculate the required meters-per-pixel to fit the desired diameter in the map view
            const mapWidthPixels = mapContainer.offsetWidth || 512; // Use actual or a fallback width
            const requiredMetersPerPixel = desiredDiameter / mapWidthPixels;

            // Calculate the zoom level
            let zoom = Math.log2(circumferenceAtLat / (256 * requiredMetersPerPixel));

            return Math.max(1, Math.min(20, zoom)); // Clamp zoom level between 1 and 20
        }

        let cameraOptions = {};
        if (initialPosition && fieldOpPosition && (initialPosition[0] !== fieldOpPosition[0] || initialPosition[1] !== fieldOpPosition[1])) {
            cameraOptions.bounds = atlas.data.BoundingBox.fromPositions([initialPosition, fieldOpPosition]);
            cameraOptions.padding = 100;
        } else {
            const fieldOpRingSize = parseFloat(mapContainer.dataset.fieldopRingsize);
            cameraOptions.center = initialPosition || fieldOpPosition || [-98.5, 39.8];
            if (fieldOpPosition && fieldOpRingSize > 0) {
                cameraOptions.zoom = getZoomFromRingSize(fieldOpRingSize, fieldOpPosition[1]);
            } else {
                cameraOptions.zoom = initialPosition ? 10 : (fieldOpPosition ? 8 : 3);
            }
        }

        const map = new atlas.Map(mapContainer.id, {
            authOptions: { authType: 'subscriptionKey', subscriptionKey: subscriptionKey },
            style: 'road',
            showFeedbackLink: false,
            showLogo: false,
            ...cameraOptions
        });

        map.controls.add(new atlas.control.ZoomControl(), { position: 'top-left' });

        map.events.add('ready', function() {
            const datasource = new atlas.source.DataSource();
            map.sources.add(datasource);

            const fieldOpRingSize = parseFloat(mapContainer.dataset.fieldopRingsize);

            // Helper function to create a circle polygon
            function createCirclePolygon(center, radiusInMeters, numPoints = 64) {
                const earthRadius = 6378137; // in meters
                const lat = center[1] * Math.PI / 180;
                const lon = center[0] * Math.PI / 180;
                const d = radiusInMeters / earthRadius;
                const positions = [];

                for (let i = 0; i <= numPoints; i++) {
                    const brng = i * 2 * Math.PI / numPoints;
                    let newLat = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brng));
                    let newLon = lon + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(newLat));

                    newLon = (newLon * 180 / Math.PI + 540) % 360 - 180; // normalize to -180 to 180
                    newLat = newLat * 180 / Math.PI;
                    positions.push([newLon, newLat]);
                }
                return new atlas.data.Polygon([positions]);
            }

            if (fieldOpPosition) {
                // Add the center point for the bubble marker
                datasource.add(new atlas.data.Feature(new atlas.data.Point(fieldOpPosition), { type: 'fieldop_center' }));

                // If there's a ring size, create and add the circle polygon for the ring
                if (fieldOpRingSize && fieldOpRingSize > 0) {
                    const ringRadiusInMeters = fieldOpRingSize * 1000;
                    const ringPolygon = new atlas.data.Feature(createCirclePolygon(fieldOpPosition, ringRadiusInMeters), { type: 'fieldop_ring' });
                    datasource.add(ringPolygon);
                }
            }

            // Add layers for the Field Op marker (center and ring)
            map.layers.add([
                new atlas.layer.PolygonLayer(datasource, 'fieldop-ring-polygon', {
                    filter: ['==', ['get', 'type'], 'fieldop_ring'],
                    fillColor: 'dodgerblue',
                    fillOpacity: 0.25,
                }),
                new atlas.layer.BubbleLayer(datasource, 'fieldop-center', {
                    filter: ['==', ['get', 'type'], 'fieldop_center'],
                    color: 'dodgerblue',
                    radius: 8,
                    strokeColor: 'white',
                    strokeWidth: 2
                })
            ]);

            const requestMarker = new atlas.HtmlMarker({ position: initialPosition || map.getCamera().center, draggable: true, visible: !!initialPosition });
            map.markers.add(requestMarker);

            document.addEventListener('updateMapFromGeocode', function(e) {
                const { position, address } = e.detail;
                if (locationPickerConfig.debug) console.log('[LocationPicker] Received updateMapFromGeocode event:', e.detail);

                requestMarker.setOptions({ position: position, visible: true });
                map.setCamera({ center: position, zoom: 12 });

                // We have the address object, so we can populate the note directly
                updateForm(position, 'forward_geocoded', address, address.freeformAddress);

                // We can also show the preview
                const noteModal = document.getElementById('location-note-modal');
                const rawPre = document.getElementById('geocode-raw-results-pre');
                const formContainer = document.getElementById('form-c-container');
                const isAuthenticated = formContainer.dataset.isAuthenticated === 'true';

                if (isAuthenticated && noteModal && rawPre) {
                    noteModal.style.maxWidth = '350px';
                    rawPre.textContent = JSON.stringify(address, null, 2);
                    noteModal.classList.remove('d-none');
                }
            });

            function updateDistance(requestPos) {
                 // Simplified distance logic for brevity
            }

            function updateForm(position, source, geocodeData = {}, formattedAddress = '') {
                latInput.value = position[1].toFixed(5);
                lonInput.value = position[0].toFixed(5);
                if (sourceInput) {
                    sourceInput.value = source;
                }
                if (noteInput) {
                    // Always store the full JSON object in the note field
                    noteInput.value = JSON.stringify(geocodeData);
                }

                const freeformAddressInput = document.getElementById('id_location_freeform_address');
                if (freeformAddressInput) {
                    freeformAddressInput.value = formattedAddress;
                }

                const geocodeDetailsContainer = document.getElementById('geocode-details-container');
                if (geocodeDetailsContainer) {
                    const geocodeRawResultsPre = document.getElementById('geocode-raw-results-pre');
                    if(geocodeRawResultsPre) {
                        geocodeRawResultsPre.textContent = JSON.stringify(geocodeData, null, 2);
                    }
                }

                const event = new CustomEvent('locationUpdated', {
                    detail: {
                        source: source,
                        position: position,
                        geocodeData: geocodeData
                    }
                });
                document.dispatchEvent(event);
                if (locationPickerConfig.debug) console.log('[LocationPicker] Fired locationUpdated event.');

                if(confirmLocationBtn) confirmLocationBtn.classList.remove('d-none');
                updateDistance(position);
            }

            async function reverseGeocode(position, persistentHighlight = false) {
                const url = `https://atlas.microsoft.com/search/address/reverse/json?api-version=1.0&query=${position[1]},${position[0]}&subscription-key=${subscriptionKey}`;
                try {
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.addresses && data.addresses.length > 0) {
                        const addr = data.addresses[0].address;
                        if(locationPickerConfig.debug) {
                            console.log('[LocationPicker] Raw geocode result:');
                            console.dir(addr);
                        }
                        if(streetInput) streetInput.value = addr.streetNameAndNumber || addr.streetName || '';
                        if(cityInput) cityInput.value = addr.municipality || '';
                        if (stateInput) {
                            const subdivision = addr.countrySubdivisionName;
                            const municipality = addr.municipality;
                            // Only populate state if subdivision exists and is not the same as the city/municipality.
                            if (subdivision && municipality && subdivision.toLowerCase() !== municipality.toLowerCase()) {
                                stateInput.value = subdivision;
                            } else {
                                stateInput.value = ''; // Explicitly clear it otherwise.
                            }
                        }

                        // Highlight the fields that were just updated
                        [streetInput, cityInput, stateInput].forEach(input => {
                            if (input && input.value) { // Only highlight if a value was set
                                input.classList.add('field-highlight');
                                if (!persistentHighlight) {
                                    setTimeout(() => {
                                        input.classList.remove('field-highlight');
                                    }, 2000); // Highlight for 2 seconds
                                }
                            }
                        });

                        return addr;
                    }
                } catch (error) { console.error('[LocationPicker] Reverse geocode error:', error); }
                return null;
            }

            map.events.add('click', async function(e) {
                e.position[0] = normalizeLongitude(e.position[0]); // Normalize the longitude
                requestMarker.setOptions({ position: e.position, visible: true });
                const address = await reverseGeocode(e.position, true);
                const formattedAddr = address ? address.freeformAddress : `No address found at ${e.position[1].toFixed(5)}, ${e.position[0].toFixed(5)}.`;
                updateForm(e.position, 'user_picked', address, formattedAddr);
            });

            map.events.add('dragend', requestMarker, async function() {
                const pos = requestMarker.getOptions().position;
                pos[0] = normalizeLongitude(pos[0]); // Normalize the longitude
                const address = await reverseGeocode(pos, true);
                const formattedAddr = address ? address.freeformAddress : `No address found at ${pos[1].toFixed(5)}, ${pos[0].toFixed(5)}.`;
                updateForm(pos, 'user_picked', address, formattedAddr);
            });

            function normalizeLongitude(lon) {
                // Wraps longitude to the [-180, 180] range
                return ((lon + 180) % 360) - 180;
            }

            function handleManualCoordinateUpdate() {
                const lat = parseFloat(latInput.value);
                const lon = parseFloat(lonInput.value);

                if (!isNaN(lat) && !isNaN(lon)) {
                    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                        const newPosition = [lon, lat];
                        requestMarker.setOptions({ position: newPosition, visible: true });
                        map.setCamera({ center: newPosition, zoom: 12 });
                        reverseGeocode(newPosition); // Update address fields
                        updateForm(newPosition, 'user_entered');
                        if (locationPickerConfig.debug) console.log(`[LocationPicker] Updated map to manually entered coordinates: ${lat}, ${lon}`);
                    } else {
                        if (locationPickerConfig.debug) console.warn(`[LocationPicker] Invalid lat/lon values provided.`);
                    }
                }
            }

            latInput.addEventListener('change', handleManualCoordinateUpdate);
            lonInput.addEventListener('change', handleManualCoordinateUpdate);

            document.addEventListener('resetLocationView', () => {
                // Clear marker, reset camera, and clear highlights
                requestMarker.setOptions({ position: null, visible: false });

                const fieldOpRingSize = parseFloat(mapContainer.dataset.fieldopRingsize);
                if (fieldOpPosition && !isNaN(fieldOpRingSize) && fieldOpRingSize > 0) {
                    const radiusInMeters = fieldOpRingSize * 1000 * 2;
                    const bounds = atlas.data.BoundingBox.fromSphere(fieldOpPosition, radiusInMeters);
                    map.setCamera({
                        bounds: bounds,
                        padding: 20
                    });
                } else {
                    map.setCamera(cameraOptions); // Fallback to initial options
                }

                [streetInput, cityInput, stateInput].forEach(input => {
                    if (input) input.classList.remove('field-highlight');
                });
                // Reset map padding
                map.setCamera({ padding: { right: 0 } });
                if (locationPickerConfig.debug) console.log('[LocationPicker] Reset map view and field highlights.');
            });

            /*
            map.events.add('zoomend', function() {
                const markerPos = requestMarker.getOptions().position;
                if (requestMarker.getOptions().visible && markerPos) {
                    const camera = map.getCamera();
                    // Only recenter if the marker is not already at the center
                    if (markerPos[0] !== camera.center[0] || markerPos[1] !== camera.center[1]) {
                        map.setCamera({ center: markerPos });
                    }
                }
            });
            */
        });
    };
})();
