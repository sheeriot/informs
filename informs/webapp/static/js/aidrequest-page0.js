document.addEventListener('DOMContentLoaded', function() {
    const scriptConfig = {
        debug: true, // Master debug switch for this script
    };

    // This function is defined globally in the utils.js file now
    // function getCookie(name) { ... }
    
    /**
     * A generic handler for actions that require a confirmation modal.
     * This function uses event delegation to listen for clicks on elements
     * that have a `data-bs-toggle="modal"` and a `data-action-url` attribute.
     */
    document.body.addEventListener('show.bs.modal', function(event) {
        const modal = event.target;
        const triggerButton = event.relatedTarget;
        
        if (!triggerButton || !triggerButton.dataset.actionUrl) {
            if (scriptConfig.debug) {
                console.log('[Actions] Modal opened without a valid action trigger button. Ignoring.');
            }
            return;
        }

        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (!modalInstance) {
            if (scriptConfig.debug) console.log('[Actions] Modal instance not found. Aborting.');
            return;
        }
        
        modalInstance.isConfirmed = false;

        if (scriptConfig.debug) {
            console.log('[Actions] Action modal triggered by:', triggerButton);
        }

        const modalTitle = modal.querySelector('.modal-title');
        const modalBody = modal.querySelector('.modal-body-dynamic');
        const confirmBtn = modal.querySelector('.confirm-action-btn');

        // 1. Populate Modal Content
        if (modalTitle && triggerButton.dataset.modalTitle) {
            modalTitle.textContent = triggerButton.dataset.modalTitle;
        }

        const actionName = triggerButton.dataset.actionName || "perform this action";
        const objectName = triggerButton.dataset.objectName || "";
        const defaultBodyText = `Are you sure you want to <strong>${actionName} ${objectName}</strong>?`;
        
        if (modalBody) {
            modalBody.innerHTML = triggerButton.dataset.modalBody || defaultBodyText;
        }

        // 2. Clear stale form data
        const noteTextarea = modal.querySelector('.action-note-textarea');
        const markdownCheckbox = modal.querySelector('.action-markdown-checkbox');
        if (noteTextarea) noteTextarea.value = '';
        if (markdownCheckbox) markdownCheckbox.checked = false;


        // 3. Configure the Confirm Button
        if (confirmBtn) {
            const btnClass = triggerButton.dataset.confirmButtonClass || 'btn-primary';
            const btnIcon = triggerButton.dataset.confirmButtonIcon;
            const btnText = triggerButton.dataset.confirmButtonText || 'Confirm';
            
            confirmBtn.className = 'btn confirm-action-btn'; // Reset classes
            confirmBtn.classList.add(btnClass);

            let iconHTML = btnIcon ? `<i class="bi bi-${btnIcon}"></i> ` : '';
            confirmBtn.innerHTML = `${iconHTML}${btnText}`;

            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener('click', function() {
                modalInstance.isConfirmed = true;
                const note = noteTextarea ? noteTextarea.value : '';
                const isMarkdown = markdownCheckbox ? markdownCheckbox.checked : false;

                const payload = { ...triggerButton.dataset };
                payload.note = note;
                payload.note_markdown = isMarkdown;

                // Clean up data attributes
                ['bsToggle', 'bsTarget', 'modalTitle', 'modalBody', 'actionName', 'objectName', 'confirmButtonClass', 'confirmButtonIcon', 'confirmButtonText'].forEach(key => delete payload[key]);

                const url = triggerButton.dataset.actionUrl;
                const method = triggerButton.dataset.httpMethod || 'POST';

                fetchWithLogging(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken'),
                    },
                    body: JSON.stringify(payload)
                }, 'Modal Action')
                .then(response => {
                    if (response.ok) {
                        modal.querySelector('.confirm-action-btn')?.blur();
                        return response.json();
                    }
                    throw new Error('Network response was not ok.');
                })
                .then(data => {
                    if (scriptConfig.debug) {
                        console.log('[Actions] Request successful, server response:', data);
                    }
                    bootstrap.Modal.getInstance(modal).hide();
                    
                    // Trigger refreshes
                    htmx.trigger('body', 'actionLogUpdated');
                    htmx.trigger('#locations-list-container', 'locationListUpdated');
                })
                .catch(error => {
                    console.error('[Actions] There was a problem with the fetch operation:', error);
                });
            });
        }
    });

    // --- Special case listener for status/priority radio buttons ---
    document.body.addEventListener('click', function(event) {
        const target = event.target;
        if (target.matches('input[type="radio"][name="status"], input[type="radio"][name="priority"]')) {
            const fieldName = target.name;
            const newValue = target.value;
            const container = target.closest('#request-status-card');
            const originalValueRadio = container.querySelector(`input[name=${fieldName}][data-original-value="true"]`);
            const oldValue = originalValueRadio ? originalValueRadio.value : null;

            if (newValue === oldValue) return;

            const triggerButton = document.getElementById('status-priority-change-trigger');
            if (triggerButton) {
                triggerButton.dataset.modalTitle = `Confirm ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Change`;
                triggerButton.dataset.modalBody = `You are about to change the ${fieldName} of this Aid Request.`;
                delete triggerButton.dataset.status;
                delete triggerButton.dataset.priority;
                triggerButton.dataset[fieldName] = newValue;
                
                const modalEl = document.querySelector(triggerButton.dataset.bsTarget);
                if (!modalEl) return;

                const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                modal.show(triggerButton);

                modalEl.addEventListener('hide.bs.modal', () => {
                    if (!bootstrap.Modal.getInstance(modalEl).isConfirmed && originalValueRadio) {
                        originalValueRadio.checked = true;
                    }
                }, { once: true });
            }
        }
    });

    // --- Section Editing (Lock/Unlock) ---
    document.querySelectorAll('.btn-edit-section').forEach(button => {
        button.addEventListener('click', function() {
            const targetSelector = this.dataset.target;
            const fieldset = document.querySelector(targetSelector);
            if (fieldset) {
                const isDisabling = !fieldset.disabled;
                fieldset.disabled = isDisabling;
                
                const icon = this.querySelector('i');
                this.classList.toggle('btn-outline-success', !isDisabling);
                this.classList.toggle('btn-outline-danger', isDisabling);
                icon.classList.toggle('bi-unlock-fill', !isDisabling);
                icon.classList.toggle('bi-lock-fill', isDisabling);
                
                fieldset.querySelector('.d-flex.justify-content-end')?.classList.toggle('d-none', isDisabling);
            }
        });
    });

    // --- Cancel Edit Button ---
    document.querySelectorAll('.btn-cancel-edit').forEach(button => {
        button.addEventListener('click', function() {
            const fieldset = this.closest('fieldset');
            if (fieldset) {
                this.closest('form').reset();
                const editButton = document.querySelector(`.btn-edit-section[data-target="#${fieldset.id}"]`);
                if (editButton) editButton.click(); // Simulate a click to re-lock the section
            }
        });
    });

    // --- Handle submission for all partial update forms ---
    document.querySelectorAll('.partial-update-form').forEach(form => {
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            const formData = new FormData(this);
            const payload = Object.fromEntries(formData.entries());
            payload.form_name = this.dataset.formName;

            const configElement = document.getElementById('aid-request-config');
            const url = configElement.dataset.urlPartialUpdate;

            fetchWithLogging(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify(payload)
            }, 'Partial Form Update')
            .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok.'))
            .then(data => {
                showActionAlert('Update successful!', 'success');
                const fieldset = this.querySelector('fieldset');
                if (fieldset) {
                    const editButton = document.querySelector(`.btn-edit-section[data-target="#${fieldset.id}"]`);
                    if (editButton && !fieldset.disabled) editButton.click(); // Re-lock if it was unlocked
                }
                htmx.trigger('body', 'actionLogUpdated');
            })
            .catch(error => {
                console.error('[Actions] There was a problem with the partial update:', error);
                showActionAlert('An error occurred while updating.', 'danger');
            });
        });
    });
    
    // --- Centralized Event Handling for Log and Location Updates ---
    const aidRequestId = document.getElementById('aid-request-config')?.dataset.aidRequestId;
    if (aidRequestId) {
        const actionLogKey = `lastActionLogId_${aidRequestId}`;
        const auditLogKey = `lastAuditLogId_${aidRequestId}`;

        document.body.addEventListener('htmx:afterSwap', function(event) {
            const targetId = event.target.id;
            if (targetId === 'action-logs-content' || targetId === 'audit-logs-content') {
                const firstRow = event.target.querySelector('tbody > tr[data-log-id]');
                if (firstRow) {
                    const newLatestId = firstRow.dataset.logId;
                    const key = targetId === 'action-logs-content' ? actionLogKey : auditLogKey;
                    sessionStorage.setItem(key, newLatestId);
                    if (scriptConfig.debug) console.log(`[SessionStorage] Updated ${key} to ${newLatestId}`);
                }
            }
        });

        document.body.addEventListener('htmx:configRequest', function(evt) {
            const path = evt.detail.path;
            const fieldOp = document.getElementById('aid-request-config')?.dataset.fieldOp;
            let key, since_id;

            if (path.includes(`/api/${fieldOp}/aidrequest/${aidRequestId}/action-logs`)) {
                key = actionLogKey;
            } else if (path.includes(`/api/${fieldOp}/aidrequest/${aidRequestId}/audit-logs`)) {
                key = auditLogKey;
            }

            if (key) {
                since_id = sessionStorage.getItem(key) || 0;
                evt.detail.parameters['since_id'] = since_id;
                if (scriptConfig.debug) console.log(`[configRequest] Intercepted ${key} request. Adding since_id: ${since_id}`);
            }
        });
    }

    // --- Location Card Collapse ---
    document.addEventListener('show.bs.collapse', event => {
        const icon = event.target.previousElementSibling?.querySelector('.collapse-icon i');
        if (icon) {
            icon.classList.remove('bi-chevron-down');
            icon.classList.add('bi-chevron-up');
        }
    });

    document.addEventListener('hide.bs.collapse', event => {
        const icon = event.target.previousElementSibling?.querySelector('.collapse-icon i');
        if (icon) {
            icon.classList.remove('bi-chevron-up');
            icon.classList.add('bi-chevron-down');
        }
    });

    // --- Country Display Logic ---
    const countryElement = document.getElementById('id_country');
    if (countryElement) {
        const selectedOption = countryElement.options[countryElement.selectedIndex];
        const countryDisplayText = document.getElementById('country-display-text');
        if (selectedOption && countryDisplayText) {
            countryDisplayText.textContent = selectedOption.textContent;
        }
        const crispyLabel = document.querySelector('#country-input-wrapper label');
        if (crispyLabel) crispyLabel.classList.add('d-none');
    }

    // --- From aidrequest-locations.js ---
    initializeAddLocation();

    function initializeAddLocation() {
        const addLocationModal = document.getElementById('addLocationModal');
        if (!addLocationModal) return;

        addLocationModal.addEventListener('shown.bs.modal', function () {
            if (window.initializeLocationPicker) {
                setTimeout(() => {
                    window.initializeLocationPicker('add-location-map').then(() => {
                        const cityInput = addLocationModal.querySelector('#id_city_modal');
                        if (cityInput?.value.trim()) {
                            performModalGeocode();
                        }
                    });
                }, 150);
            }
        });

        const form = addLocationModal.querySelector('#addLocationForm');
        if (form) {
             form.addEventListener('submit', handleLocationFormSubmit);
            const addressFields = form.querySelectorAll('#id_city_modal, #id_state_modal, #id_street_address_modal');
            addressFields.forEach(input => {
                input.addEventListener('blur', performModalGeocode);
                input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); performModalGeocode(); } });
            });
        }
    }

    document.addEventListener('locationUpdated', (e) => {
        const addLocationModal = document.getElementById('addLocationModal');
        if (e.detail.source === 'forward_geocoded' && addLocationModal?.classList.contains('show')) {
            const sourceInput = addLocationModal.querySelector('input[name="source"]');
            if (sourceInput) sourceInput.value = 'address_provided';
        }
    });

    async function performModalGeocode() {
        const modal = document.getElementById('addLocationModal');
        if (!modal) return;
        const city = modal.querySelector('#id_city_modal')?.value.trim();
        if (!city) return;

        const state = modal.querySelector('#id_state_modal')?.value.trim();
        const street = modal.querySelector('#id_street_address_modal')?.value.trim();
        const spinner = document.getElementById('geocode-spinner-modal');
        const mapContainer = modal.querySelector('#add-location-map');
        const subscriptionKey = mapContainer?.dataset.azureMapsKey;
        const query = [street, city, state].filter(Boolean).join(', ');
        const url = `https://atlas.microsoft.com/search/address/json?api-version=1.0&query=${encodeURIComponent(query)}&countrySet=${mapContainer.dataset.countryCode || ''}&limit=1&subscription-key=${subscriptionKey}`;

        if (spinner) spinner.classList.remove('d-none');
        try {
            const response = await fetchWithLogging(url, {}, 'Forward Geocode (Modal)');
            const data = await response.json();
            if (data.results?.length > 0) {
                const { position, address } = data.results[0];
                document.dispatchEvent(new CustomEvent('updateMapFromGeocode', { detail: { position: [position.lon, position.lat], address } }));
            }
        } catch (error) {
            console.error('[AddLocation] Geocode error:', error);
        } finally {
            if (spinner) spinner.classList.add('d-none');
        }
    }

    function handleLocationFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const modal = form.closest('.modal');
        const modalBody = modal.querySelector('.modal-body');
        const loadingContainer = modal.querySelector('#addLocationLoading');
        
        if(modalBody) modalBody.classList.add('d-none');
        if(loadingContainer) loadingContainer.classList.remove('d-none');

        fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { 'X-CSRFToken': getCookie('csrftoken'), 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.ok ? response.json() : Promise.reject(response.text()))
        .then(data => {
            if (data.success) {
                showActionAlert('Location added successfully.', 'success');
                bootstrap.Modal.getInstance(modal).hide();
                htmx.trigger('#locations-list-container', 'locationListUpdated');
                htmx.trigger('body', 'actionLogUpdated');
            } else {
                throw new Error(data.errors ? JSON.stringify(data.errors) : 'Unknown error');
            }
        })
        .catch(error => {
            console.error('[AddLocation] Error submitting form:', error);
            alert('An unexpected error occurred. Please check the console.');
        })
        .finally(() => {
            if(modalBody) modalBody.classList.remove('d-none');
            if(loadingContainer) loadingContainer.classList.add('d-none');
        });
    }
});

function copyCoords(elementId) {
    const coordsElement = document.getElementById(elementId);
    if (coordsElement) {
        navigator.clipboard.writeText(coordsElement.innerText)
            .then(() => {
                showActionAlert('Coordinates copied to clipboard!', 'success');
            })
            .catch(err => {
                console.error('Failed to copy coordinates: ', err);
                showActionAlert('Failed to copy coordinates.', 'danger');
            });
    }
}
