window.addEventListener('pageshow', function(event) {
    // Check if the page was restored from the back-forward cache
    if (event.persisted) {
        // If so, force a reload to ensure scripts run correctly
        window.location.reload();
    }
});

const aidRequestFormCConfig = {
    debug: false // Set to false for production
};

function formatAzureMapsNote(data, type) {
    let noteParts = [];
    try {
        if (type === 'reverse_geocoded' && data.addresses && data.addresses.length > 0) {
            const address = data.addresses[0].address;
            noteParts.push('address: reverse_geocoded');
            if (address.freeformAddress) noteParts.push(`Address: ${address.freeformAddress}`);
            if (address.municipality) noteParts.push(`Municipality: ${address.municipality}`);
            if (address.countrySubdivisionName) noteParts.push(`State/Province: ${address.countrySubdivisionName}`);
        } else if (type === 'geocoded' && data.status === 'Success') {
            noteParts.push('address: provided');
            if (data.address_found) noteParts.push(`Found: ${data.address_found}`);
            if (data.confidence) noteParts.push(`Confidence: ${data.confidence}`);
            if (data.match_type) noteParts.push(`Match Type: ${data.match_type}`);
            if (data.locality) noteParts.push(`Locality: ${data.locality}`);
            if (data.neighborhood) noteParts.push(`Neighborhood: ${data.neighborhood}`);
            if (data.districts && Array.isArray(data.districts)) noteParts.push(`Districts: ${data.districts.join(', ')}`);
        } else {
            noteParts.push('Could not format note from data.');
        }
    } catch (e) {
        noteParts.push(`Error formatting note: ${e.message}`);
    }
    return noteParts.join('\n');
}

document.addEventListener('DOMContentLoaded', function() {
    const formContainer = document.getElementById('form-c-container');
    const isAuthenticated = formContainer.dataset.isAuthenticated === 'true';
    const fieldOpSlug = formContainer.dataset.fieldopSlug;
    const lastSubmittedPk = sessionStorage.getItem('informsFormLastSubmittedPk');

    if (lastSubmittedPk && fieldOpSlug) {
        if(formContainer) {
            let viewRequestsLink = '';
            if (isAuthenticated) {
                viewRequestsLink = `<a href="/${fieldOpSlug}/list/" class="btn btn-secondary ms-2">View All Requests</a>`;
            }

            const submittedURL = `/${fieldOpSlug}/aidrequest/${lastSubmittedPk}/submitted/`;

            formContainer.innerHTML = `
                <div class="alert alert-info" role="alert">
                  <h4 class="alert-heading">Form Previously Submitted</h4>
                  <p>It looks like you have already submitted this form. If you used the back button, your submission has likely already been recorded.</p>
                  <hr>
                  <p class="mb-0">
                    You can view your submission, or submit another request.
                  </p>
                </div>
                <a href="${submittedURL}" class="btn btn-success">View My Submission</a>
                <button id="submit-another-request-btn" class="btn btn-primary ms-2">Submit Another Request</button>
                ${viewRequestsLink}
            `;

            document.getElementById('submit-another-request-btn').addEventListener('click', function(e) {
                e.preventDefault();
                sessionStorage.removeItem('informsFormCSubmitted');
                sessionStorage.removeItem('informsFormLastSubmittedPk');
                sessionStorage.removeItem('informsFormCData');
                window.location.reload();
            });
        }
        return;
    }

    const form = document.querySelector('form.needs-validation');
    const storedData = sessionStorage.getItem('informsFormCData');

    if (storedData) {
        const resetButtonHTML = `
            <button class="btn btn-sm btn-outline-danger reset-form-btn">
                <i class="bi bi-arrow-counterclockwise"></i> Reset Form
            </button>
        `;

        const resetContainer = document.getElementById('reset-form-container');
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
        const formData = new FormData(form);
        const data = {};
        // Use getAll to handle multiple checkboxes with the same name
        const aidTypes = formData.getAll('aid_type');
        if (aidTypes.length > 0) {
            data['aid_type'] = aidTypes;
        }

        for (const [key, value] of formData.entries()) {
            // Skip aid_type as it's already handled
            if (key === 'aid_type') continue;

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
    }

    function restoreFormData() {
        const data = JSON.parse(sessionStorage.getItem('informsFormCData'));
        if (!data || !form) return;

        for (const key in data) {
            const elements = form.elements[key];
            if (!elements) continue;

            const value = data[key];

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
        document.getElementById('step-1'),
        document.getElementById('step-2'),
        document.getElementById('step-3')
    ];
    const dots = document.querySelectorAll('.progress-dots .dot');
    let currentStep = window.INFORMS_INITIAL_STEP || 0;
    const confirmAndNextBtn = document.getElementById('confirm-and-next-btn');
    const resetLocationBtn = document.getElementById('reset-location-btn');
    const nextStep1Btn = document.getElementById('next-step-1');
    const prevStep2Btn = document.getElementById('prev-step-2');
    const prevStep3Btn = document.getElementById('prev-step-3');

    if (aidRequestFormCConfig.debug) {
        console.log('Reset button found in DOM:', resetLocationBtn);
    }

    // After restoring form data, check if location was already set
    const locationModifiedInput = document.getElementById('id_location_modified');

    document.addEventListener('locationUpdated', (e) => {
        const { source, position, geocodeData, geocodeType, log } = e.detail;
        if (aidRequestFormCConfig.debug) {
            console.log('form-c.js: locationUpdated event received with detail:', e.detail);
        }

        let locationLog = [];
        if (source === 'restored_from_session' && log) {
            locationLog = log;
        } else if (geocodeData) {
            locationLog.push(formatAzureMapsNote(geocodeData, geocodeType));
        } else if (source === 'device_location') {
            locationLog.push('User requested device location.');
        } else if (source === 'user_picked') {
            const coords = document.getElementById('id_coordinates').value;
            locationLog.push(`User manually entered coordinates: ${coords}`);
        }

        // Update form fields
        document.getElementById('id_latitude').value = position[1].toFixed(5);
        document.getElementById('id_longitude').value = position[0].toFixed(5);
        document.getElementById('id_coordinates').value = `${position[1].toFixed(5)},${position[0].toFixed(5)}`;
        document.getElementById('id_location_modified').value = 'True';
        document.getElementById('id_location_source').value = source;
        document.getElementById('id_location_note').value = locationLog.join('\n');

        saveFormData(); // Persist the new state to session storage

        if (aidRequestFormCConfig.debug) {
            console.log('form-c.js: Updated form fields and saved to session storage.');
            console.log('form-c.js: Final location_note:', locationLog.join('\n'));
        }

        // Enable the 'Confirm & Next' button
        if (confirmAndNextBtn) {
            confirmAndNextBtn.disabled = false;
            confirmAndNextBtn.classList.remove('opacity-25');
            confirmAndNextBtn.textContent = 'Confirm & Next';
        }
    });

    if (resetLocationBtn) {
        resetLocationBtn.addEventListener('click', () => {
            const fieldsToClear = [
                'id_street_address', 'id_city', 'id_state', 'id_zip_code',
                'id_coordinates', 'id_latitude', 'id_longitude',
                'id_location_note', 'id_location_source'
            ];
            fieldsToClear.forEach(id => {
                const field = document.getElementById(id);
                if (field) field.value = '';
            });
            document.getElementById('id_location_modified').value = 'False';

            if (confirmAndNextBtn) {
                confirmAndNextBtn.disabled = true;
                confirmAndNextBtn.classList.add('opacity-25');
                confirmAndNextBtn.textContent = 'Provide Location';
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

    const submitBtn = form ? document.getElementById('submit-button') : null;

    if (form) {
        form.addEventListener('input', saveFormData);
    }

    if (form && submitBtn) {
        form.addEventListener('submit', function(event) {
            if (validateStep(2)) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting...';
                sessionStorage.removeItem('informsFormCData');
            } else {
                event.preventDefault();
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
        }
    }

    function adjustMapHeight() {
        const mapElement = document.getElementById('aid-request-location-picker-map');
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

        const requiredInputs = step.querySelectorAll('.is-required');
        let firstInvalidInput = null;

        const isLocationStep = (stepIndex === 1);

        if (isLocationStep) {
            const locationNote = document.getElementById('id_location_note').value;
            const errorDiv = document.getElementById('location-error-msg');

            if (!locationNote) {
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

        const lat = isLocationStep ? document.getElementById('id_latitude').value : null;
        const lon = isLocationStep ? document.getElementById('id_longitude').value : null;
        const locationIsSet = lat && lon;

        requiredInputs.forEach(input => {
            let inputValid = true;

            // If location is set on map, address fields are not required
            if (isLocationStep && locationIsSet && ['id_street_address', 'id_city', 'id_state'].includes(input.id)) {
                input.classList.remove('is-invalid');
                return; // Skip validation for this field
            }

            if (input.type === 'radio' || input.type === 'checkbox') {
                const groupName = input.name;
                if (!document.querySelector(`input[name="${groupName}"]:checked`)) {
                    inputValid = false;
                }
            } else {
                if (input.value.trim() === '') {
                    inputValid = false;
                }
            }

            if (input.id === 'id_contact_info') {
                const value = input.value;
                const errorDiv = input.parentElement.querySelector('.invalid-feedback');

                // Check for a valid email format with a multi-part domain.
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
                const isEmail = emailRegex.test(value);

                const justDigits = value.replace(/\D/g, "");
                const isPhone = justDigits.length >= 10;

                if (!isEmail && !isPhone) {
                    inputValid = false;
                    if (errorDiv) errorDiv.textContent = 'Please enter a valid phone number (at least 10 digits) or email address.';
                } else if (!isEmail && value.length > 25) { // It's a phone number, check length
                    inputValid = false;
                    if (errorDiv) errorDiv.textContent = 'Phone number cannot exceed 25 characters.';
                } else {
                    if (errorDiv) errorDiv.textContent = ''; // Clear error message if valid
                }
            }

            if (!inputValid) {
                isValid = false;
                input.classList.add('is-invalid');
                 if (!firstInvalidInput) {
                    firstInvalidInput = input;
                }
            } else {
                input.classList.remove('is-invalid');
            }
        });

        if (!isValid && firstInvalidInput) {
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
        const checkbox = document.querySelector(`input[name="${checkId}"]`);
        const div = document.getElementById(checkboxes[checkId]);
        if(checkbox && div) {
            checkbox.addEventListener('change', () => {
                div.classList.toggle('d-none', !checkbox.checked);
            });
        }
    }

    showStep(currentStep);

    // After page load, check for any fields with server-side validation errors
    const firstInvalidField = form ? form.querySelector('.is-invalid') : null;
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
        const fieldToFocus = document.getElementById(window.INFORMS_FOCUS_FIELD_ID);
        if (fieldToFocus) {
            fieldToFocus.focus();
            fieldToFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    window.addEventListener('resize', adjustMapHeight);
});
