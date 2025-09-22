window.addEventListener('pageshow', function(event) {
    // Check if the page was restored from the back-forward cache
    if (event.persisted) {
        // If so, force a reload to ensure scripts run correctly
        window.location.reload();
    }
});

const aidRequestFormCConfig = {
    debug: true // Set to false for production
};

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('aid-request-form-c');
    if (!form) {
        if (aidRequestFormCConfig.debug) console.error('[FormC] The main form with ID "aid-request-form-c" was not found.');
        return;
    }

    const formContainer = form.parentElement;
    if (!formContainer) {
        if (aidRequestFormCConfig.debug) console.error('[FormC] Could not find the parent container of the form.');
        return;
    }


    const isAuthenticated = formContainer.dataset.isAuthenticated === 'true';
    const fieldOpSlug = formContainer.dataset.fieldopSlug;
    const lastSubmittedPk = sessionStorage.getItem('informsFormLastSubmittedPk');

    if (lastSubmittedPk && fieldOpSlug && isAuthenticated) { // Only show for authenticated users
        let viewRequestsLink = `<a href="/${fieldOpSlug}/list/" class="btn btn-secondary ms-2">View All Requests</a>`;
        const submittedURL = `/${fieldOpSlug}/aidrequest/${lastSubmittedPk}/submitted/`;

        formContainer.innerHTML = `
            <div class="alert alert-info" role="alert">
              <h4 class="alert-heading">Form Previously Submitted</h4>
              <p>It looks like you have already submitted this form. To prevent duplicates, please review your last submission before creating a new one.</p>
              <hr>
              <p class="mb-0">You can view your last submission or start a new request.</p>
            </div>
            <a href="${submittedURL}" class="btn btn-success">View My Submission</a>
            <button id="submit-another-request-btn" class="btn btn-primary ms-2">Submit Another Request</button>
            ${viewRequestsLink}
        `;

        document.getElementById('submit-another-request-btn').addEventListener('click', function(e) {
            e.preventDefault();
            sessionStorage.removeItem('informsFormLastSubmittedPk');
            sessionStorage.removeItem('informsFormCData');
            window.location.reload();
        });
        return;
    }

    const cityInput = form.querySelector('#id_city');
    const stateInput = form.querySelector('#id_state');
    const streetInput = form.querySelector('#id_street_address');
    const confirmLocationBtn = form.querySelector('#confirm-and-next-btn');

    // Function to perform forward geocoding
    async function performGeocode() {
        const city = cityInput.value.trim();
        const state = stateInput.value.trim();
        const street = streetInput.value.trim();

        if (city) {
            if (aidRequestFormCConfig.debug) console.log(`[FormC] Performing geocode for: ${street}, ${city}, ${state}`);

            const mapContainer = form.querySelector('#aid-request-location-picker-map');
            if (!mapContainer) {
                if (aidRequestFormCConfig.debug) console.error('[FormC] Map container not found inside the form.');
                return;
            }
            const subscriptionKey = mapContainer.dataset.azureMapsKey;
            let queryParts = [street, city, state].filter(Boolean); // Filter out empty parts
            let query = queryParts.join(', ');

            const url = `https://atlas.microsoft.com/search/address/json?api-version=1.0&query=${encodeURIComponent(query)}&countrySet=${mapContainer.dataset.countryCode || ''}&limit=1&subscription-key=${subscriptionKey}`;

            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    const result = data.results[0];
                    const { lat, lon } = result.position;

                    if (aidRequestFormCConfig.debug) {
                        console.log('[FormC] Geocode successful:', result);
                    }

                    // Dispatch a custom event to update the map in location-picker-map.js
                    const event = new CustomEvent('updateMapFromGeocode', {
                        detail: {
                            position: [lon, lat],
                            address: result.address
                        }
                    });
                    document.dispatchEvent(event);

                    if(confirmLocationBtn) {
                        confirmLocationBtn.disabled = false;
                        confirmLocationBtn.classList.remove('opacity-25');
                    }

                } else {
                    if (aidRequestFormCConfig.debug) console.warn('[FormC] Geocode returned no results.');
                }
            } catch (error) {
                if (aidRequestFormCConfig.debug) console.error('[FormC] Geocode error:', error);
            }
        } else {
            if (aidRequestFormCConfig.debug) console.log('[FormC] City is required for geocoding.');
        }
    }

    // Add event listeners for address fields to trigger geocoding
    let geocodeTimeout;
    if (cityInput && stateInput && streetInput) {
        [cityInput, stateInput, streetInput].forEach(input => {
            input.addEventListener('input', () => {
                clearTimeout(geocodeTimeout);
                geocodeTimeout = setTimeout(performGeocode, 1000); // Debounce for 1s
            });
        });
    }

    const storedData = sessionStorage.getItem('informsFormCData');

    if (storedData) {
        const resetButtonHTML = `
            <button class="btn btn-sm btn-outline-danger reset-form-btn">
                <i class="bi bi-arrow-counterclockwise"></i> Reset Form
            </button>
        `;

        const resetContainer = document.getElementById('reset-form-container'); // This is outside the form
        if (resetContainer) {
            resetContainer.innerHTML = resetButtonHTML;
        }

        formContainer.addEventListener('click', function(e) {
            const resetButton = e.target.closest('.reset-form-btn');
            if (resetButton) {
                e.preventDefault();
                if (confirm('Are you sure you want to clear the form and start over?')) {
                    sessionStorage.removeItem('informsFormCData');
                    window.location.reload();
                }
            }
        });
    }

    function saveFormData() {
        if (!form) return;
        if (aidRequestFormCConfig.debug) {
            const geocodeJsonInput = form.querySelector('#id_geocode_json');
            console.log('[FormC] Inside saveFormData. Hidden geocode_json input value is:', geocodeJsonInput ? `"${geocodeJsonInput.value.substring(0, 100)}..."` : 'Not Found');
        }

        const formData = new FormData(form);
        const data = {};

        for (const [key, value] of formData.entries()) {
            // This handles cases where a field name might appear multiple times (like checkboxes)
            if (data[key]) {
                if (!Array.isArray(data[key])) {
                    data[key] = [data[key]];
                }
                data[key].push(value);
            } else {
                data[key] = value;
            }
        }

        sessionStorage.setItem('informsFormCData', JSON.stringify(data));
        if (aidRequestFormCConfig.debug) {
            console.log('[FormC] Saved form data to sessionStorage.');
            // For debugging the issue of lost fields:
            console.log(`  - City: ${data.city}`);
            console.log(`  - Street Address: ${data.street_address}`);
            console.log(`  - Geocoded Address: ${data.location_freeform_address}`);
            console.log(`  - Geocode JSON stored: ${!!data.geocode_json}`);
        }
    }

    function restoreFormData() {
        const data = JSON.parse(sessionStorage.getItem('informsFormCData'));
        if (!data || !form) return;
        if (aidRequestFormCConfig.debug) {
            console.log('[FormC] Restoring form data from sessionStorage.');
             // For debugging the issue of lost fields:
            console.log(`  - City: ${data.city}`);
            console.log(`  - Street Address: ${data.street_address}`);
            console.log(`  - Geocoded Address: ${data.location_freeform_address}`);
            console.log(`  - Geocode JSON stored: ${!!data.geocode_json}`);
        }

        for (const key in data) {
            const elements = form.elements[key];
            if (!elements) continue;

            const value = data[key];

            if (aidRequestFormCConfig.debug && key === 'geocode_json') {
                console.log(`[FormC] Restoring 'geocode_json' field with value:`, value ? value.substring(0, 100) + '...' : 'null');
            }

            // This handles RadioNodeList for radio buttons
            if (elements instanceof RadioNodeList) {
                elements.forEach(el => {
                    if (el.value === value) {
                        el.checked = true;
                    }
                });
            } else if (key === 'aid_type' && Array.isArray(value)) {
                // Handle multiple checkboxes for aid_type
                value.forEach(val => {
                    const el = form.querySelector(`input[name="aid_type"][value="${val}"]`);
                    if (el) el.checked = true;
                });
            } else { // Handles single elements
                const el = elements.length ? elements[0] : elements;
                 if (el.type === 'checkbox') {
                    el.checked = !!value;
                } else {
                    el.value = value;
                }
            }
        }
    }

    restoreFormData();

    const steps = [
        form.querySelector('#step-1'),
        form.querySelector('#step-2'),
        form.querySelector('#step-3')
    ];
    const dots = form.querySelectorAll('.progress-dots .dot');
    let currentStep = window.INFORMS_INITIAL_STEP || 0;
    let mapInitialized = false;
    const confirmAndNextBtn = form.querySelector('#confirm-and-next-btn');
    const resetLocationBtn = form.querySelector('#reset-location-btn');
    const nextStep1Btn = form.querySelector('#next-step-1');
    const prevStep2Btn = form.querySelector('#prev-step-2');
    const prevStep3Btn = form.querySelector('#prev-step-3');

    if (aidRequestFormCConfig.debug) {
        console.log('Reset button found in DOM:', resetLocationBtn);
    }

    // After restoring form data, check if was already set
    const locationModifiedInput = form.querySelector('#id_location_modified');

    document.addEventListener('locationUpdated', (e) => {
        // This event signifies the map has updated the location fields.
        // Save the entire form state now to capture all map-derived values.
        saveFormData();

        // Re-select the button here to ensure it's available
        const confirmBtn = form.querySelector('#confirm-and-next-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-25');
            if (aidRequestFormCConfig.debug) console.log('[FormC] Confirm Location button enabled after location update.');
        }
    });

    if (resetLocationBtn) {
        resetLocationBtn.addEventListener('click', () => {
            const fieldsToClear = [
                'id_street_address', 'id_city', 'id_state',
                'id_latitude', 'id_longitude',
                'id_location_note', 'id_location_source', 'id_location_freeform_address'
            ];
            fieldsToClear.forEach(id => {
                const field = form.querySelector(`#${id}`);
                if (field) {
                    field.value = '';
                    field.classList.remove('field-highlight');
                }
            });
            form.querySelector('#id_location_modified').value = 'False';

            // Clear the geocode details panel, but don't hide it
            const geocodeRawResultsPre = form.querySelector('#geocode-raw-results-pre');
            if (geocodeRawResultsPre) {
                geocodeRawResultsPre.textContent = '';
            }
            const locationNoteCollapse = form.querySelector('#locationNoteCollapse');
            if (locationNoteCollapse && locationNoteCollapse.classList.contains('show')) {
                // If the details are open, close them.
                const bsCollapse = new bootstrap.Collapse(locationNoteCollapse, {
                    toggle: false
                });
                bsCollapse.hide();
            }

            if (confirmAndNextBtn) {
                confirmAndNextBtn.disabled = true;
                confirmAndNextBtn.classList.add('opacity-25');
                confirmAndNextBtn.textContent = 'Confirm Location';
            }

            saveFormData(); // Persist changes

            // Dispatch a custom event to notify the map to reset its view
            document.dispatchEvent(new CustomEvent('resetLocationView'));
        });
    }

    if (nextStep1Btn) {
        nextStep1Btn.addEventListener('click', () => { if (validateStep(0)) { currentStep = 1; showStep(currentStep); } });
    }

    if (prevStep2Btn) {
        prevStep2Btn.addEventListener('click', () => { currentStep = 0; showStep(currentStep); });
    }

    if (confirmAndNextBtn) {
        confirmAndNextBtn.addEventListener('click', () => {
            if (validateStep(1)) {
                currentStep = 2;
                showStep(currentStep);
            }
        });
    }

    if (prevStep3Btn) {
        prevStep3Btn.addEventListener('click', () => { currentStep = 1; showStep(currentStep); });
    }

    const submitBtn = form.querySelector('#submit-button');

    if (form) {
        form.addEventListener('input', saveFormData);
    }

    if (form && submitBtn) {
        form.addEventListener('submit', function(event) {
            // Always prevent default and manage submission manually
            event.preventDefault();
            if (aidRequestFormCConfig.debug) console.log('[FormC] Submit event triggered. Starting validation...');

            let allStepsValid = true;
            for (let i = 0; i < steps.length; i++) {
                if (aidRequestFormCConfig.debug) console.log(`[FormC] Validating step ${i}...`);
                if (!validateStep(i)) {
                    allStepsValid = false;
                    if (aidRequestFormCConfig.debug) console.log(`[FormC] Validation failed on step ${i}.`);
                    // validateStep function now handles showing the correct step and focusing.
                    break; // Stop on first invalid step
                }
            }

            if (allStepsValid) {
                if(aidRequestFormCConfig.debug) {
                    const fullName = form.querySelector('#id_full_name').value;
                    console.log("[FormC] All steps are valid. Submitting form. Requestor full name:", fullName);
                }
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting...';
                sessionStorage.removeItem('informsFormCData');
                form.submit(); // Manually submit the form
            } else {
                if (aidRequestFormCConfig.debug) console.log('[FormC] Validation failed. Form will not be submitted.');
            }
        });
    }

    if (form) {
        form.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && event.target.tagName.toLowerCase() !== 'textarea') {
                const activeStep = document.querySelector('.form-step:not(.d-none)');
                if (activeStep && activeStep.id !== 'step-3') {
                     event.preventDefault();
                     const nextBtn = activeStep.querySelector('[id^=next-step-], #confirm-and-next-btn');
                     if(nextBtn && !nextBtn.disabled) {
                        nextBtn.click();
                     }
                }
            }
        });
    }

    function updateProgressDots() {
        const activeStep = steps[currentStep];
        if (!activeStep) return;

        const dotsContainer = activeStep.querySelector('.progress-dots');
        if (!dotsContainer) return;

        const dots = dotsContainer.querySelectorAll('.dot');

        dots.forEach((dot, index) => {
            dot.classList.remove('active', 'completed');
            if (index < currentStep) {
                dot.classList.add('completed');
            } else if (index === currentStep) {
                dot.classList.add('active');
            }
        });
    }

    function showStep(stepIndex) {
        steps.forEach((step, index) => {
            if (step) {
                if (index === stepIndex) {
                    step.classList.remove('d-none');
                } else {
                    step.classList.add('d-none');
                }
            }
        });
        updateProgressDots();
        window.scrollTo(0,0);
        if (stepIndex === 1) {
            adjustMapHeight();
            if (!mapInitialized && window.initializeLocationPicker) {
                // Use requestAnimationFrame to ensure the browser has rendered the
                // step-2 container before we try to initialize the map inside it.
                requestAnimationFrame(async () => {
                    await window.initializeLocationPicker('aid-request-location-picker-map');
                    mapInitialized = true;

                    if (aidRequestFormCConfig.debug) {
                        const geocodeJsonInput = form.querySelector('#id_geocode_json');
                        console.log('[FormC] Map is ready. About to dispatch restoreLocationDisplay. Hidden input value:', geocodeJsonInput ? `"${geocodeJsonInput.value.substring(0, 100)}..."` : 'Not Found');
                    }

                    // Now that the map is initialized, tell it to restore its display state
                    document.dispatchEvent(new CustomEvent('restoreLocationDisplay'));
                });
            }
            // After restoring form data and showing the step, check if location was already set
            const latInput = form.querySelector('#id_latitude');
            const lonInput = form.querySelector('#id_longitude');
            const confirmBtn = form.querySelector('#confirm-and-next-btn');
            if (latInput && lonInput && confirmBtn && latInput.value && lonInput.value) {
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('opacity-25');
                if (aidRequestFormCConfig.debug) console.log('[FormC] Location restored from session. Re-enabling confirm button.');
            }
        }
    }

    function adjustMapHeight() {
        const mapElement = form.querySelector('#aid-request-location-picker-map');
        if (!mapElement) return;

        const topOffset = mapElement.getBoundingClientRect().top + window.scrollY;
        const bottomOffset = 150; // space for buttons, footer, etc.
        const minHeight = 300;

        const availableHeight = window.innerHeight - topOffset - bottomOffset;
        const newHeight = Math.max(minHeight, availableHeight);

        mapElement.style.height = `${newHeight}px`;
    }

    function validateStep(stepIndex) {
        let isValid = true;
        const step = steps[stepIndex];
        if (!step) return true;

        const requiredInputs = step.querySelectorAll('[required]');
        const validatedRadioGroups = new Set();
        let firstInvalidInput = null;

        const isLocationStep = (stepIndex === 1);

        if (isLocationStep) {
            const lat = form.querySelector('#id_latitude').value;
            const lon = form.querySelector('#id_longitude').value;
            const errorDiv = form.querySelector('#location-error-msg');

            if (!lat || !lon) {
                if(errorDiv) {
                    errorDiv.textContent = "Please confirm your location on the map before proceeding.";
                    if (!firstInvalidInput) {
                        firstInvalidInput = errorDiv;
                    }
                }
                isValid = false;
            } else {
                if(errorDiv) errorDiv.textContent = "";
            }
        }

        const isLocationSet = isLocationStep && form.querySelector('#id_latitude').value && form.querySelector('#id_longitude').value;

        requiredInputs.forEach(input => {
            let inputValid = true;
            let errorDiv = input.closest('div[id^="div_id_"]')?.querySelector('.invalid-feedback');
            if(!errorDiv) errorDiv = input.parentElement.querySelector('.invalid-feedback');


            // If location is set on map, address fields are not required
            if (isLocationStep && isLocationSet && ['id_street_address', 'id_city', 'id_state'].includes(input.id)) {
                input.classList.remove('is-invalid');
                if (errorDiv) errorDiv.textContent = '';
                return; // Skip validation for this field
            }

            if (input.type === 'radio') {
                const groupName = input.name;
                if (validatedRadioGroups.has(groupName)) return;
                validatedRadioGroups.add(groupName);

                const radioGroup = document.querySelectorAll(`input[name="${groupName}"]`);
                const isChecked = Array.from(radioGroup).some(radio => radio.checked);

                const container = input.closest('div[id^="div_id_"]');
                errorDiv = container?.querySelector('.invalid-feedback');

                if (!isChecked) {
                    inputValid = false;
                    if(errorDiv) errorDiv.textContent = 'Please select an option.';
                    radioGroup.forEach(radio => radio.classList.add('is-invalid'));
                } else {
                    radioGroup.forEach(radio => radio.classList.remove('is-invalid'));
                    if(errorDiv) errorDiv.textContent = '';
                }
            } else if (input.id === 'id_contact_info') {
                const value = input.value;
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
                const isEmail = emailRegex.test(value);
                const justDigits = value.replace(/\D/g, "");
                const isPhone = justDigits.length >= 10;

                if (!isEmail && !isPhone) {
                    inputValid = false;
                    if (errorDiv) errorDiv.textContent = 'Please enter a valid phone number (at least 10 digits) or email address.';
                } else if (!isEmail && value.length > 25) {
                    inputValid = false;
                    if (errorDiv) errorDiv.textContent = 'Phone number cannot exceed 25 characters.';
                }
            } else if (input.value.trim() === '') {
                inputValid = false;
                const label = document.querySelector(`label[for="${input.id}"]`);
                const fieldName = label ? label.textContent.replace('*','').trim() : 'This field';
                if (errorDiv) errorDiv.textContent = `${fieldName} is required.`;
            }

            if (!inputValid) {
                isValid = false;
                input.classList.add('is-invalid');
                if (!firstInvalidInput) {
                    firstInvalidInput = input;
                }
            } else {
                input.classList.remove('is-invalid');
                if (errorDiv && input.type !== 'radio') { // Radio error is cleared inside its block
                    errorDiv.textContent = '';
                }
            }
        });

        if (!isValid && firstInvalidInput) {
            const invalidStepEl = firstInvalidInput.closest('.form-step');
            if (invalidStepEl) {
                const invalidStepIndex = Array.from(steps).indexOf(invalidStepEl);
                if (invalidStepIndex !== -1 && invalidStepIndex !== currentStep) {
                    currentStep = invalidStepIndex;
                    showStep(currentStep);
                }
            }

            firstInvalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (firstInvalidInput.focus) {
                 firstInvalidInput.focus();
            }
        }

        return isValid;
    }

    // Logic for toggling textareas based on checkboxes
    const checkboxes = {
        'has_medical_needs': 'div_id_medical_needs',
        'has_welfare_check': 'div_id_welfare_check_info',
        'has_supplies_needed': 'div_id_supplies_needed',
        'has_contact_methods': 'div_id_contact_methods',
        'has_additional_info': 'div_id_additional_info'
    };

    for (const checkId in checkboxes) {
        const checkbox = form.querySelector(`input[name="${checkId}"]`);
        const div = form.querySelector(`#${checkboxes[checkId]}`);
        if(checkbox && div) {
            checkbox.addEventListener('change', () => {
                div.classList.toggle('d-none', !checkbox.checked);
            });
        }
    }

    showStep(currentStep);

    // After page load, check for any fields with server-side validation errors
    const firstInvalidField = form.querySelector('.is-invalid');
    if (firstInvalidField) {
        // Find the parent step of the invalid field and show it
        const invalidStep = firstInvalidField.closest('.form-step');
        if (invalidStep) {
            const stepIndex = Array.from(steps).indexOf(invalidStep);
            if (stepIndex !== -1) {
                currentStep = stepIndex;
                showStep(currentStep);
            }
        }

        // Scroll to the invalid field
        firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalidField.focus();
    }

    if (window.INFORMS_FOCUS_FIELD_ID) {
        const fieldToFocus = form.querySelector(`#${window.INFORMS_FOCUS_FIELD_ID}`);
        if (fieldToFocus) {
            fieldToFocus.focus();
            fieldToFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    window.addEventListener('resize', adjustMapHeight);
});
