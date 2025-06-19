window.addEventListener('pageshow', function(event) {
    // Check if the page was restored from the back-forward cache
    if (event.persisted) {
        // If so, force a reload to ensure scripts run correctly
        window.location.reload();
    }
});

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
    const nextStep1Btn = document.getElementById('next-step-1');
    const prevStep2Btn = document.getElementById('prev-step-2');
    const prevStep3Btn = document.getElementById('prev-step-3');

    document.addEventListener('locationUpdated', (e) => {
        if (confirmAndNextBtn) {
            confirmAndNextBtn.disabled = false;
            confirmAndNextBtn.classList.remove('opacity-25');
            confirmAndNextBtn.textContent = 'Confirm & Next';
            confirmAndNextBtn.dataset.locationSource = e.detail.source;
        }
    });

    if (nextStep1Btn) {
        nextStep1Btn.addEventListener('click', () => { if (validateStep(0)) { currentStep = 1; showStep(currentStep); } });
    }

    if (prevStep2Btn) {
        prevStep2Btn.addEventListener('click', () => { currentStep = 0; showStep(currentStep); });
    }

    if (confirmAndNextBtn) {
        confirmAndNextBtn.addEventListener('click', () => {
            const locationNoteInput = document.getElementById('id_location_note');
            if (locationNoteInput) {
                locationNoteInput.value = confirmAndNextBtn.dataset.locationSource || 'confirmed_on_form';
            }

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
    }

    function validateStep(stepIndex) {
        let isValid = true;
        const step = steps[stepIndex];
        if (!step) return true;

        const requiredInputs = step.querySelectorAll('.is-required');

        const isLocationStep = (stepIndex === 1);

        if (isLocationStep) {
            const locationNote = document.getElementById('id_location_note').value;
            const errorDiv = document.getElementById('location-error-msg');

            if (!locationNote) {
                if(errorDiv) errorDiv.textContent = "Please confirm your location on the map before proceeding.";
                return false;
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
                // Check for a valid email format with a multi-part domain.
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
                const isEmail = emailRegex.test(input.value);

                const justDigits = input.value.replace(/\D/g, "");
                const isPhone = justDigits.length >= 10;

                if (!isEmail && !isPhone) {
                    inputValid = false;
                }
            }

            if (!inputValid) {
                isValid = false;
                input.classList.add('is-invalid');
            } else {
                input.classList.remove('is-invalid');
            }
        });

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

    if (window.INFORMS_FOCUS_FIELD_ID) {
        const fieldToFocus = document.getElementById(window.INFORMS_FOCUS_FIELD_ID);
        if (fieldToFocus) {
            fieldToFocus.focus();
            fieldToFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // After restoring data, check if location is set and enable button
    if (document.getElementById('id_latitude')?.value && document.getElementById('id_longitude')?.value) {
        document.dispatchEvent(new CustomEvent('locationUpdated', { detail: { source: 'restored_from_session' } }));
    }
});
