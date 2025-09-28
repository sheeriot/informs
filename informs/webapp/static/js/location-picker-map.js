(function() {
    'use strict';

    const locationPickerConfig = {
        debug: false,
    };

    // Helper to update a field's value.
    // This does NOT dispatch an event, to prevent infinite loops with other listeners.
    function updateFieldValue(element, value) {
        if (element) {
            element.value = value;
        }
    }

    // Make this function globally available to be called from other scripts
    window.initializeLocationPicker = function(mapContainerId) {
        return new Promise((resolve) => {
            if (locationPickerConfig.debug) console.log(`[LocationPicker] Initializing for map container #${mapContainerId}`);

            const mapContainer = document.getElementById(mapContainerId);
            if (!mapContainer) {
                if (locationPickerConfig.debug) console.error(`[LocationPicker] Map container #${mapContainerId} not found in the DOM.`);
                return;
            }

            const formContainer = mapContainer.closest('form');
            if (!formContainer) {
                if (locationPickerConfig.debug) console.error(`[LocationPicker] Could not find a parent <form> for the map container #${mapContainerId}.`);
                return;
            }

            // --- All the logic from initAidRequestLocationPicker goes here ---
            // I will adapt it to read config from the mapContainer's data attributes
            // instead of hardcoded IDs.

            const subscriptionKey = mapContainer.dataset.azureMapsKey;
            const geocodeUrl = mapContainer.dataset.geocodeUrl;
            const csrfToken = formContainer.querySelector('[name=csrfmiddlewaretoken]').value; // This can stay global

            const latInput = formContainer.querySelector(`#${mapContainer.dataset.latInputId}`);
            const lonInput = formContainer.querySelector(`#${mapContainer.dataset.lonInputId}`);
            const sourceInput = formContainer.querySelector(`#${mapContainer.dataset.sourceInputId}`);
            const noteInput = formContainer.querySelector(`#${mapContainer.dataset.noteInputId}`);

            // Address fields are optional for some implementations
            const cityInput = formContainer.querySelector(`#${mapContainer.dataset.cityInputId}`);
            const stateInput = formContainer.querySelector(`#${mapContainer.dataset.stateInputId}`);
            const streetInput = formContainer.querySelector(`#${mapContainer.dataset.streetInputId}`);
            const confirmLocationBtn = formContainer.querySelector(`#${mapContainer.dataset.confirmBtnId}`);

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
                console.log(`  - streetInput (${mapContainer.dataset.streetInputId}): ${streetInput ? 'Found' : 'Missing'}`);
                console.log(`  - cityInput (${mapContainer.dataset.cityInputId}): ${cityInput ? 'Found' : 'Missing'}`);
                console.log(`  - stateInput (${mapContainer.dataset.stateInputId}): ${stateInput ? 'Found' : 'Missing'}`);
                console.log(`  - confirmLocationBtn (${mapContainer.dataset.confirmBtnId}): ${confirmLocationBtn ? 'Found' : 'Missing'}`);
                const distanceContainer = formContainer.querySelector(`#${mapContainer.dataset.distanceContainerId}`);
                console.log(`  - distanceContainer (${mapContainer.dataset.distanceContainerId}): ${distanceContainer ? 'Found' : 'Missing'}`);
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

                // The visible diameter should be ~1.5x the ring's diameter for context.
                // ringSize is a radius in KM. Diameter in meters is radius * 2 * 1000.
                const desiredDiameter = ringSizeInKm * 2 * 1000 * 1.5;
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
                        fillOpacity: 0.15,
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

                    if (fieldOpPosition) {
                        const bounds = atlas.data.BoundingBox.fromPositions([position, fieldOpPosition]);
                        map.setCamera({ bounds: bounds, padding: 100 });
                    } else {
                        map.setCamera({ center: position, zoom: 12 });
                    }

                    // We have the address object, so we can populate the note directly
                    updateFieldValue(latInput, position[1].toFixed(5));
                    updateFieldValue(lonInput, position[0].toFixed(5));

                    if (sourceInput) {
                        updateFieldValue(sourceInput, 'forward_geocoded');
                    }

                    const freeformAddressInput = formContainer.querySelector(`#${mapContainer.dataset.freeformAddressInputId}`);
                    if (freeformAddressInput) {
                        updateFieldValue(freeformAddressInput, address.freeformAddress);
                    }

                    const geocodeDetailsContainer = formContainer.querySelector(`#${mapContainer.dataset.geocodeDetailsContainerId}`);
                    if (geocodeDetailsContainer) {
                        const geocodeJsonPre = formContainer.querySelector(`#${mapContainer.dataset.geocodeJsonPreId}`);
                        if(geocodeJsonPre) {
                            geocodeJsonPre.textContent = JSON.stringify(address, null, 2);
                        }
                    }

                    if(confirmLocationBtn) confirmLocationBtn.classList.remove('d-none');
                    updateDistance(position);
                    updateCoordinatesDisplay(position);

                    // Populate the hidden geocode_json field so its value gets saved.
                    const geocodeJsonInput = formContainer.querySelector(`#${mapContainer.dataset.geocodeJsonInputId}`);
                    if (geocodeJsonInput) {
                        updateFieldValue(geocodeJsonInput, JSON.stringify(address));
                        if (locationPickerConfig.debug) {
                            console.log(`[LocationPicker] Set value on hidden field #${geocodeJsonInput.id}.`);
                            console.log(`[LocationPicker] Value is now: "${geocodeJsonInput.value.substring(0, 100)}..."`);
                        }
                    } else {
                        if (locationPickerConfig.debug) console.error(`[LocationPicker] SCOPED SEARCH FAILED to find geocode_json input with ID: #${mapContainer.dataset.geocodeJsonInputId}`);
                    }

                    // Dispatch this event LAST, after all form fields have been updated.
                    const event = new CustomEvent('locationUpdated', {
                        detail: {
                            source: 'forward_geocoded',
                            position: position,
                            geocodeData: address
                        }
                    });
                    document.dispatchEvent(event);
                    if (locationPickerConfig.debug) console.log('[LocationPicker] Fired locationUpdated event.');
                });

                // Listen for an event to restore the geocode display from saved form data
                document.addEventListener('restoreLocationDisplay', function() {
                    if (locationPickerConfig.debug) console.log('[LocationPicker] Received restoreLocationDisplay event.');

                    // 1. Restore the JSON preview for authenticated users
                    const geocodeJsonInput = formContainer.querySelector(`#${mapContainer.dataset.geocodeJsonInputId}`);
                    const geocodeJsonPre = formContainer.querySelector(`#${mapContainer.dataset.geocodeJsonPreId}`);

                    if (locationPickerConfig.debug) {
                        console.log(`[LocationPicker] Attempting to restore display from hidden input.`);
                        console.log(`  - Found hidden input:`, geocodeJsonInput);
                        console.log(`  - Hidden input value is: "${geocodeJsonInput ? geocodeJsonInput.value.substring(0, 100) : 'N/A'}..."`);
                        console.log(`  - Found <pre> tag:`, geocodeJsonPre);
                    }

                    if (geocodeJsonInput && geocodeJsonPre && geocodeJsonInput.value) {
                        try {
                            const geocodeData = JSON.parse(geocodeJsonInput.value);
                            geocodeJsonPre.textContent = JSON.stringify(geocodeData, null, 2);
                            if (locationPickerConfig.debug) console.log(`[LocationPicker] Successfully restored <pre> content.`);
                        } catch (e) {
                            if (locationPickerConfig.debug) console.error('[LocationPicker] Error parsing geocode JSON from form field:', e);
                            geocodeJsonPre.textContent = geocodeJsonInput.value;
                        }
                    } else {
                         if (locationPickerConfig.debug) console.log(`[LocationPicker] No geocode JSON in session to restore for PRE display.`);
                    }

                    // 2. Restore the map state (marker, zoom, distance, etc.) from the form fields
                    const lat = parseFloat(latInput.value);
                    const lon = parseFloat(lonInput.value);

                    if (!isNaN(lat) && !isNaN(lon)) {
                        const position = [lon, lat];
                        if(locationPickerConfig.debug) console.log(`[LocationPicker] Restoring map state to position:`, position);

                        requestMarker.setOptions({ position: position, visible: true });

                        if (fieldOpPosition) {
                            // If we have a field op, fit both the restored point and the field op in the view
                            const bounds = atlas.data.BoundingBox.fromPositions([position, fieldOpPosition]);
                            map.setCamera({
                                bounds: bounds,
                                padding: 100 // Add some padding around the edges
                            });
                        } else {
                            // Otherwise, just center on the point with a reasonable zoom
                            map.setCamera({ center: position, zoom: 12 });
                        }

                        updateDistance(position);
                        updateCoordinatesDisplay(position);
                    } else {
                         if(locationPickerConfig.debug) console.log(`[LocationPicker] No coordinates in session to restore on map.`);
                    }
                });


                function updateDistance(requestPos) {
                    if (!fieldOpPosition || !requestPos) return;

                    const R = 6371; // Radius of the Earth in km
                    const dLat = (requestPos[1] - fieldOpPosition[1]) * Math.PI / 180;
                    const dLon = (requestPos[0] - fieldOpPosition[0]) * Math.PI / 180;
                    const a =
                        0.5 - Math.cos(dLat) / 2 +
                        Math.cos(fieldOpPosition[1] * Math.PI / 180) * Math.cos(requestPos[1] * Math.PI / 180) *
                        (1 - Math.cos(dLon)) / 2;
                    const distance = R * 2 * Math.asin(Math.sqrt(a));

                    const distanceContainer = formContainer.querySelector(`#${mapContainer.dataset.distanceContainerId}`);
                    if (distanceContainer) {
                        distanceContainer.textContent = `${distance.toFixed(1)} km`;
                    }
                }

                function updateForm(position, source, geocodeData = {}, formattedAddress = '') {

                    const roundedLat = parseFloat(position[1].toFixed(5));
                    const roundedLon = parseFloat(position[0].toFixed(5));

                    updateFieldValue(latInput, roundedLat);
                    updateFieldValue(lonInput, roundedLon);

                    if (sourceInput) {
                        updateFieldValue(sourceInput, source);
                    }

                    const freeformAddressInput = formContainer.querySelector(`#${mapContainer.dataset.freeformAddressInputId}`);
                    if (freeformAddressInput) {
                        updateFieldValue(freeformAddressInput, formattedAddress);
                    }

                    const geocodeDetailsContainer = formContainer.querySelector(`#${mapContainer.dataset.geocodeDetailsContainerId}`);
                    if (geocodeDetailsContainer) {
                        const geocodeJsonPre = formContainer.querySelector(`#${mapContainer.dataset.geocodeJsonPreId}`);
                        if(geocodeJsonPre) {
                            geocodeJsonPre.textContent = JSON.stringify(geocodeData, null, 2);
                        }
                    }

                    if(confirmLocationBtn) confirmLocationBtn.classList.remove('d-none');
                    updateDistance(position);
                    updateCoordinatesDisplay(position);

                    // Populate the hidden geocode_json field so its value gets saved.
                    const geocodeJsonInput = formContainer.querySelector(`#${mapContainer.dataset.geocodeJsonInputId}`);
                    if (geocodeJsonInput) {
                        updateFieldValue(geocodeJsonInput, JSON.stringify(geocodeData));
                        if (locationPickerConfig.debug) {
                            console.log(`[LocationPicker] Set value on hidden field #${geocodeJsonInput.id}.`);
                            console.log(`[LocationPicker] Value is now: "${geocodeJsonInput.value.substring(0, 100)}..."`);
                        }
                    } else {
                        if (locationPickerConfig.debug) console.error(`[LocationPicker] SCOPED SEARCH FAILED to find geocode_json input with ID: #${mapContainer.dataset.geocodeJsonInputId}`);
                    }

                    // Dispatch this event LAST, after all form fields have been updated.
                    const event = new CustomEvent('locationUpdated', {
                        detail: {
                            source: source,
                            position: position,
                            geocodeData: geocodeData
                        }
                    });
                    document.dispatchEvent(event);
                    if (locationPickerConfig.debug) console.log('[LocationPicker] Fired locationUpdated event.');
                }

                function updateCoordinatesDisplay(position) {
                    const container = formContainer.querySelector('#coordinates-display-modal-container');
                    if (!container) return;

                    const lat = position[1];
                    const lon = position[0];
                    const coordsText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

                    container.innerHTML = `
                        <label class="form-label">Coordinates</label>
                        <div class="input-group input-group-sm">
                            <span class="form-control font-monospace bg-light" style="flex: 0 1 auto; width: auto; min-width: 0;">
                                ${coordsText}
                            </span>
                            <button class="btn btn-outline-secondary btn-copy-coords"
                                    type="button"
                                    data-copy-text="${coordsText}"
                                    onclick="copyCoordinates(this)"
                                    title="Copy to clipboard">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </div>
                    `;
                }

                async function reverseGeocode(position, persistentHighlight = false) {
                    const url = `https://atlas.microsoft.com/search/address/reverse/json?api-version=1.0&query=${position[1]},${position[0]}&subscription-key=${subscriptionKey}`;
                    try {
                        const response = await fetchWithLogging(url, {}, 'Reverse Geocode (Map Picker)');
                        const data = await response.json();
                        if (data.addresses && data.addresses.length > 0) {
                            const addr = data.addresses[0].address;
                            if(locationPickerConfig.debug) {
                                console.log('[LocationPicker] Raw geocode result:');
                                console.dir(addr);
                            }
                            updateFieldValue(streetInput, addr.streetNameAndNumber || addr.streetName || '');
                            updateFieldValue(cityInput, addr.municipality || '');
                            if (stateInput) {
                                const subdivision = addr.countrySubdivisionName;
                                const municipality = addr.municipality;
                                // Only populate state if subdivision exists and is not the same as the city/municipality.
                                if (subdivision && municipality && subdivision.toLowerCase() !== municipality.toLowerCase()) {
                                    updateFieldValue(stateInput, subdivision);
                                } else {
                                    updateFieldValue(stateInput, ''); // Explicitly clear it otherwise.
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

                    // Intelligently set camera to frame new point and field op center
                    if (fieldOpPosition) {
                        const bounds = atlas.data.BoundingBox.fromPositions([e.position, fieldOpPosition]);
                        map.setCamera({ bounds: bounds, padding: 100 });
                    } else {
                        map.setCamera({ center: e.position, zoom: 12 });
                    }

                    const address = await reverseGeocode(e.position, true);
                    const formattedAddr = address ? address.freeformAddress : `No address found at ${e.position[1].toFixed(5)}, ${e.position[0].toFixed(5)}.`;
                    updateForm(e.position, 'user_picked', address, formattedAddr);
                });

                map.events.add('dragend', requestMarker, async function() {
                    const pos = requestMarker.getOptions().position;
                    pos[0] = normalizeLongitude(pos[0]); // Normalize the longitude

                    // Intelligently set camera to frame new point and field op center
                    if (fieldOpPosition) {
                        const bounds = atlas.data.BoundingBox.fromPositions([pos, fieldOpPosition]);
                        map.setCamera({ bounds: bounds, padding: 100 });
                    } else {
                        map.setCamera({ center: pos, zoom: 12 });
                    }

                    const address = await reverseGeocode(pos, true);
                    const formattedAddr = address ? address.freeformAddress : `No address found at ${pos[1].toFixed(5)}, ${pos[0].toFixed(5)}.`;
                    updateForm(pos, 'user_picked', address, formattedAddr);
                });

                function normalizeLongitude(lon) {
                    // Wraps longitude to the [-180, 180] range
                    return ((lon + 180) % 360) - 180;
                }

                async function handleManualCoordinateUpdate() {
                    const lat = parseFloat(latInput.value);
                    const lon = parseFloat(lonInput.value);

                    if (!isNaN(lat) && !isNaN(lon)) {
                        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                            const newPosition = [lon, lat];
                            requestMarker.setOptions({ position: newPosition, visible: true });
                            map.setCamera({ center: newPosition, zoom: 12 });

                            const address = await reverseGeocode(newPosition, true);
                            const formattedAddr = address ? address.freeformAddress : `No address found at ${lat.toFixed(5)}, ${lon.toFixed(5)}.`;

                            updateForm(newPosition, 'user_entered', address, formattedAddr);

                            if (locationPickerConfig.debug) console.log(`[LocationPicker] Updated map to manually entered coordinates: ${lat}, ${lon}`);
                        } else {
                            if (locationPickerConfig.debug) console.warn(`[LocationPicker] Invalid lat/lon values provided.`);
                        }
                    }
                }

                // Only trigger the geocode when the user is done editing the field
                latInput.addEventListener('blur', handleManualCoordinateUpdate);
                lonInput.addEventListener('blur', handleManualCoordinateUpdate);

                // Round to a max of 5 decimal places on blur (when user clicks away)
                function roundCoordinateOnBlur(event) {
                    const input = event.target;
                    const value = parseFloat(input.value);
                    if (!isNaN(value)) {
                        input.value = parseFloat(value.toFixed(5));
                    }
                }

                latInput.addEventListener('blur', roundCoordinateOnBlur);
                lonInput.addEventListener('blur', roundCoordinateOnBlur);

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

                const deviceLocationBtn = formContainer.querySelector(`#${mapContainer.dataset.getLocationButtonId}`);
                if (deviceLocationBtn) {
                    if (locationPickerConfig.debug) console.log(`[LocationPicker] Device location button found (#${mapContainer.dataset.getLocationButtonId})`);
                    deviceLocationBtn.addEventListener('click', function() {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(async function(position) {
                                const userPosition = [position.coords.longitude, position.coords.latitude];
                                if (locationPickerConfig.debug) console.log('[LocationPicker] Got device location:', userPosition);

                                requestMarker.setOptions({ position: userPosition, visible: true });

                                if (fieldOpPosition) {
                                    const bounds = atlas.data.BoundingBox.fromPositions([userPosition, fieldOpPosition]);
                                    map.setCamera({ bounds: bounds, padding: 100 });
                                } else {
                                    map.setCamera({ center: userPosition, zoom: 12 });
                                }

                                const address = await reverseGeocode(userPosition, true);
                                const formattedAddr = address ? address.freeformAddress : `No address found at ${userPosition[1].toFixed(5)}, ${userPosition[0].toFixed(5)}.`;
                                updateForm(userPosition, 'device_location', address, formattedAddr);

                            }, function() {
                                alert('Error: The Geolocation service failed.');
                                // Optionally, provide feedback to the user in a less intrusive way
                            });
                        } else {
                            alert('Error: Your browser doesn\'t support geolocation.');
                             // Optionally, provide feedback to the user in a less intrusive way
                        }
                    });
                } else {
                    if (locationPickerConfig.debug) console.warn(`[LocationPicker] Device location button not found (#${mapContainer.dataset.getLocationButtonId})`);
                }

                // Initial setup
                if (initialPosition) {
                    updateCoordinatesDisplay(initialPosition.reverse()); // .reverse() because atlas uses [lon, lat]
                }

                resolve(); // Resolve the promise now that the map is fully ready
            });
        });
    };
})();
