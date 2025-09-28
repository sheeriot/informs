document.addEventListener('DOMContentLoaded', function() {
    const configElement = document.getElementById('aid-request-config');
    if (!configElement) {
        console.error('[AddLocation] Aid request configuration element not found');
        return;
    }

    const aidRequestConfig = {
        debug: false,
        aidRequestId: configElement.dataset.aidRequestId,
        csrfToken: configElement.dataset.csrfToken,
        urls: {
            checkMapStatus: configElement.dataset.urlCheckMapStatus
        }
    };

    initializeAddLocation();

    function initializeAddLocation() {
        const addLocationModal = document.getElementById('addLocationModal');
        if (!addLocationModal) {
            if (aidRequestConfig.debug) console.error('[AddLocation] Modal with ID "addLocationModal" not found.');
            return;
        }

        // The modal content is loaded dynamically, so we initialize the map
        // when Bootstrap's 'shown' event fires.
        addLocationModal.addEventListener('shown.bs.modal', function () {
            if (window.initializeLocationPicker) {
                setTimeout(() => {
                    window.initializeLocationPicker('add-location-map').then(() => {
                        // After map is ready, check if we should auto-geocode
                        const cityInput = addLocationModal.querySelector('#id_city_modal');
                        if (cityInput && cityInput.value.trim()) {
                            if (aidRequestConfig.debug) console.log('[AddLocation] City field has value on modal open, attempting auto-geocode.');
                            performModalGeocode();
                        }
                    });
                }, 150); // Small delay to ensure modal is fully rendered
            }
        });

        const form = addLocationModal.querySelector('#addLocationForm');
        if (form) {
             form.addEventListener('submit', handleLocationFormSubmit);

            // Add event listeners for forward geocoding in the modal
            const cityInput = form.querySelector('#id_city_modal');
            const stateInput = form.querySelector('#id_state_modal');
            const streetInput = form.querySelector('#id_street_address_modal');

            if (cityInput && stateInput && streetInput) {
                const addressFields = [cityInput, stateInput, streetInput];

                addressFields.forEach(input => {
                    input.addEventListener('blur', performModalGeocode);
                    input.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            performModalGeocode();
                        }
                    });
                });
            }
        }
    }

    // This event is fired by location-picker-map.js. We override the source
    // if the geocoding was initiated from this modal.
    document.addEventListener('locationUpdated', (e) => {
        if (e.detail.source === 'forward_geocoded') {
            const addLocationModal = document.getElementById('addLocationModal');
            if (addLocationModal && addLocationModal.classList.contains('show')) {
                const sourceInput = addLocationModal.querySelector('input[name="source"]');
                if (sourceInput) {
                    sourceInput.value = 'address_provided';
                     if (aidRequestConfig.debug) {
                        console.log('[AddLocation] Overrode location source to "address_provided".');
                    }
                }
            }
        }
    });

    async function performModalGeocode() {
        const modal = document.getElementById('addLocationModal');
        if (!modal) return;

        const cityInput = modal.querySelector('#id_city_modal');
        const stateInput = modal.querySelector('#id_state_modal');
        const streetInput = modal.querySelector('#id_street_address_modal');
        const spinner = document.getElementById('geocode-spinner-modal');

        const city = cityInput ? cityInput.value.trim() : '';
        const state = stateInput ? stateInput.value.trim() : '';
        const street = streetInput ? streetInput.value.trim() : '';

        if (city) {
            if (aidRequestConfig.debug) console.log(`[AddLocation] Performing geocode for: ${street}, ${city}, ${state}`);

            const mapContainer = modal.querySelector('#add-location-map');
            if (!mapContainer) {
                if (aidRequestConfig.debug) console.error('[AddLocation] Modal map container not found.');
                return;
            }

            const subscriptionKey = mapContainer.dataset.azureMapsKey;
            const query = [street, city, state].filter(Boolean).join(', ');
            const url = `https://atlas.microsoft.com/search/address/json?api-version=1.0&query=${encodeURIComponent(query)}&countrySet=${mapContainer.dataset.countryCode || ''}&limit=1&subscription-key=${subscriptionKey}`;

            if (spinner) spinner.classList.remove('d-none');
            try {
                const response = await fetchWithLogging(url, {}, 'Forward Geocode (Modal)');
                const data = await response.json();

                if (data.results && data.results.length > 0) {
                    const result = data.results[0];
                    if (aidRequestConfig.debug) console.log('[AddLocation] Geocode successful:', result);
                    document.dispatchEvent(new CustomEvent('updateMapFromGeocode', {
                        detail: {
                            position: [result.position.lon, result.position.lat],
                            address: result.address
                        }
                    }));
                } else {
                    if (aidRequestConfig.debug) console.warn('[AddLocation] Geocode returned no results.');
                }
            } catch (error) {
                if (aidRequestConfig.debug) console.error('[AddLocation] Geocode error:', error);
            } finally {
                if (spinner) spinner.classList.add('d-none');
            }
        }
    }

    function handleLocationFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.closest('.modal-content').querySelector('#submit-location-form');
        const originalButtonHtml = submitButton.innerHTML;

        if (aidRequestConfig.debug) console.log('[AddLocation] Location form submitted.');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

        fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: {
                'X-CSRFToken': aidRequestConfig.csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            }
        })
        .then(response => {
            if (!response.ok) return response.text().then(text => { throw new Error(text); });
            return response.json();
        })
        .then(data => {
            if (data.success) {
                if (aidRequestConfig.debug) console.log('[AddLocation] Form submission successful.', data);
                showActionAlert('Location added successfully.', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('addLocationModal'));
                modal.hide();

                if (data.new_location_html) {
                    const locationsContainer = document.querySelector('#locations-list-container .list-group');
                    if (locationsContainer) {
                        const noLocationsMessage = locationsContainer.querySelector('#no-locations-message');
                        if (noLocationsMessage) noLocationsMessage.remove();
                        locationsContainer.insertAdjacentHTML('afterbegin', data.new_location_html);
                    }
                }
                if (data.header_html) {
                    const headerContainer = document.getElementById('aid-request-header-container');
                    if (headerContainer) {
                        headerContainer.innerHTML = data.header_html;
                    }
                }
                if (data.location_pk && window.pollForMapCard) {
                    const newCard = document.getElementById(`ar${aidRequestConfig.aidRequestId}-al${data.location_pk}-loc`);
                    if (newCard) {
                        window.pollForMapCard(newCard, aidRequestConfig.urls.checkMapStatus);
                    }
                }
            } else {
                console.error('[AddLocation] Form submission failed:', data.errors);
                alert('Error saving location: ' + JSON.stringify(data.errors));
            }
        })
        .catch(error => {
            console.error('[AddLocation] Error submitting form:', error.message);
            alert('An unexpected error occurred. Please check the console.');
        })
        .finally(() => {
            submitButton.innerHTML = originalButtonHtml;
            submitButton.disabled = false;
        });
    }

});
