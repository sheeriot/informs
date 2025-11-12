document.addEventListener('DOMContentLoaded', function() {
    console.log('AidRequest Actions Script v 0.0.14');
    const scriptConfig = {
        debug: true, // Master debug switch for this script
    };

    // For debugging htmx swaps
    document.body.addEventListener('htmx:beforeSwap', function(evt) {
        const targetIdsToLog = [
            'aid_description_display',
            'supplies_needed_display',
            'medical_needs_display',
            'welfare_check_info_display',
            'additional_info_display'
        ];

        // Only log for the specific swap targets we are debugging
        if (scriptConfig.debug && targetIdsToLog.includes(evt.detail.target.id)) {
            console.log(`--- [HTMX Swap for ${evt.detail.target.id}] ---`);
            console.log(`Target: #${evt.detail.target.id}, Swap Style: ${evt.detail.swapStyle}`);
            console.log("Content BEFORE swap:", evt.detail.target.innerHTML);
            console.log("Content being swapped IN:", evt.detail.serverResponse);

            if (evt.detail.requestConfig && evt.detail.requestConfig.parameters) {
                console.log("Request Parameters:");
                console.table(evt.detail.requestConfig.parameters);
            }

            console.log("Full Event Detail Object:", evt.detail);
            console.log(`--- [End HTMX Swap for ${evt.detail.target.id}] ---`);
        }
    });

    // Add event listener to handle ARIA warning on modal close
    const genericEditModal = document.getElementById('genericEditModal');
    if (genericEditModal) {
        const modalContent = document.getElementById('generic-modal-content');

        // When the modal is about to be shown, clear its content to a loading state
        // to prevent flashing old content.
        genericEditModal.addEventListener('show.bs.modal', function() {
            if (modalContent) {
                modalContent.innerHTML = `
                    <div class="d-flex justify-content-center p-5">
                        <div class="spinner-border" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                `;
            }
        });

        genericEditModal.addEventListener('hide.bs.modal', function () {
            // When the modal is about to be hidden, check if the currently focused element
            // is inside this modal. If so, blur it to prevent the ARIA warning.
            if (document.activeElement && genericEditModal.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            // Also, clear the content after hiding to prevent any stale data.
            if (modalContent) {
                modalContent.innerHTML = '';
            }
        });
    }

    // Note: This script depends on functions defined in utils.js:
    // - getCookie(name)
    // - fetchWithLogging(url, options, context)

    /**
     * A generic handler for actions that require a confirmation modal.
     * This function uses event delegation to listen for clicks on elements
     * that have a `data-bs-toggle="modal"` and a `data-action-url` attribute.
     *
     * Required data attributes on the trigger button:
     * - `data-bs-toggle="modal"`
     * - `data-bs-target="#modalId"`: The ID of the modal to open.
     * - `data-action-url`: The URL to send the request to.
     *
     * Optional data attributes for populating the modal:
     * - `data-modal-title`: Sets the title of the modal.
     * - `data-modal-body`: Sets the main content/message of the modal.
     * - `data-http-method`: The HTTP method to use (e.g., 'POST', 'DELETE'). Defaults to 'POST'.
     *
     * Optional data attributes for the request payload:
     * - Any other `data-*` attribute will be collected and sent as part of the
     *   JSON payload to the server (e.g., `data-action="confirm"` becomes `{"action": "confirm"}`).
     */
    document.body.addEventListener('show.bs.modal', function(event) {
        if (scriptConfig.debug) console.log('--- [MODAL EVENT] --- show.bs.modal listener FIRED. ---');
        const modal = event.target;
        const triggerButton = event.relatedTarget;

        if (scriptConfig.debug) console.log('[Modal Action] Event Target (the modal):', modal);
        if (scriptConfig.debug) console.log('[Modal Action] Event Related Target (the button):', triggerButton);


        if (!triggerButton) {
            if (scriptConfig.debug) console.log('[Modal Action] No trigger button found. Bailing out.');
            return;
        }

        if (scriptConfig.debug) console.log('[Modal Action] Trigger button dataset:', triggerButton.dataset);

        const modalInstance = bootstrap.Modal.getInstance(modal);

        if (!modalInstance) {
            if (scriptConfig.debug) console.log('[Actions] Modal instance not found. Aborting.');
            return;
        }
        // Reset confirmation state each time modal is shown
        modalInstance.isConfirmed = false;

        if (!triggerButton || !triggerButton.dataset.actionUrl) {
            if (scriptConfig.debug) {
                console.log('[Actions] Modal opened without a valid action trigger button. Ignoring.');
            }
            return;
        }

        if (scriptConfig.debug) {
            // console.log('[Actions] Action modal triggered by:', triggerButton);
        }

        const modalTitle = modal.querySelector('.modal-title');
        const modalBody = modal.querySelector('.modal-body-dynamic'); // A designated area for dynamic content
        const confirmBtn = modal.querySelector('.confirm-action-btn');

        // --- New Title Logic ---
        const configElement = document.getElementById('aid-request-config');
        const fieldOpName = configElement.dataset.fieldOpName;
        const fieldOpSlug = configElement.dataset.fieldOp;
        const aidRequestId = configElement.dataset.aidRequestId;
        const requesterName = configElement.dataset.requesterFullName;

        const newTitle = `
            <div class="d-flex flex-column">
                <small class="fw-bold">
                    <i class="bi bi-truck me-2"></i>${fieldOpName} (${fieldOpSlug})
                </small>
                <small>
                    <i class="bi bi-life-preserver me-2"></i>Aid Request #${aidRequestId}: ${requesterName}
                </small>
            </div>`;

        if (modalTitle) {
            modalTitle.innerHTML = newTitle;
        }

        // 1. Populate Modal Body
        const actionName = triggerButton.dataset.actionName || "perform this action";
        const objectName = triggerButton.dataset.objectName || "";
        const oldValue = triggerButton.dataset.oldValue;
        const newValue = triggerButton.dataset.newValue;
        const confirmButtonText = triggerButton.dataset.confirmButtonText || `Confirm ${actionName}`;

        if (oldValue && newValue) {
            // Build the "From/To" modal body
            modalBody.innerHTML = `
                <h5 class="mb-3">${confirmButtonText}</h5>
                <div class="ms-3">
                     <p class="mb-1"><strong>From:</strong> <span class="text-muted">${oldValue}</span></p>
                     <p class="mb-0"><strong>To:</strong> <span class="fs-5">${newValue}</span></p>
                </div>`;
        } else {
            // Fallback to the generic confirmation
            modalBody.innerHTML = `
                <h5 class="mb-3">${confirmButtonText}</h5>
                <p>Are you sure you want to <strong>${actionName} ${objectName}</strong>?</p>`;
        }


        // 2. Clear stale form data
        const noteTextarea = modal.querySelector('.action-note-textarea');
        const markdownCheckbox = modal.querySelector('.action-markdown-checkbox');
        if (noteTextarea) noteTextarea.value = '';
        if (markdownCheckbox) markdownCheckbox.checked = false;


        // 3. Configure the Confirm Button
        if (confirmBtn) {
            // Reset button to default state first
            confirmBtn.className = 'btn btn-primary confirm-action-btn'; // Reset classes
            confirmBtn.innerHTML = 'Confirm'; // Reset text

            // Apply custom styles from trigger button
            const btnClass = triggerButton.dataset.confirmButtonClass || 'btn-primary';
            const btnIcon = triggerButton.dataset.confirmButtonIcon;
            const btnText = triggerButton.dataset.confirmButtonText || 'Confirm';

            confirmBtn.classList.remove('btn-primary');
            confirmBtn.classList.add(btnClass);

            let iconHTML = '';
            if (btnIcon) {
                // Assuming you have a way to render bootstrap icons, e.g., a template tag or direct HTML
                iconHTML = `<i class="bi bi-${btnIcon}"></i> `;
            }
            confirmBtn.innerHTML = `${iconHTML}${btnText}`;


            // Remove any old listeners to prevent multiple fires
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener('click', function() {
                // Set a flag to indicate the action was confirmed, not cancelled.
                modalInstance.isConfirmed = true;
                const note = noteTextarea ? noteTextarea.value : '';
                const isMarkdown = markdownCheckbox ? markdownCheckbox.checked : false;

                // Collect all `data-*` attributes from the trigger button
                const payload = { ...triggerButton.dataset };

                // Add note and markdown status to the payload
                payload.note = note;
                payload.note_markdown = isMarkdown;

                // Clean up bootstrap-specific keys that we don't need in the payload
                delete payload.bsToggle;
                delete payload.bsTarget;
                // Keep actionUrl for the fetch
                delete payload.modalTitle;
                delete payload.modalBody;
                delete payload.actionName;
                delete payload.objectName;
                delete payload.confirmButtonClass;
                delete payload.confirmButtonIcon;
                delete payload.confirmButtonText;

                const url = triggerButton.dataset.actionUrl;
                const method = triggerButton.dataset.httpMethod || 'POST';

                fetchWithLogging(url, {
                    method: method,
                    body: JSON.stringify(payload)
                }, 'Location Status Update')
                .then(response => {
                    // For a 204 response, there's no body to read, but we still want to proceed.
                    if (response.status === 204) {
                        return null; // Return null to signify no HTML content
                    }
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    // The server now returns HTML for location updates, so we read it as text
                    return response.text();
                })
                .then(html => {
                    newConfirmBtn.blur(); // Remove focus before hiding to prevent ARIA warning
                    modalInstance.hide();

                    // If the action was for a location, swap the returned HTML
                    if (triggerButton.dataset.actionUrl.includes('aidlocation') && html) {
                        if (scriptConfig.debug) {
                            console.log('[Modal Action] Location action detected. Swapping HTML.');
                        }
                        const container = document.getElementById('locations-list-container');
                        if (container) {
                            container.innerHTML = html;
                            htmx.process(container);
                        }
                    }

                    // After any successful modal action, trigger the UI refreshes
                    if (scriptConfig.debug) {
                        console.log('[Modal Action] Triggering UI updates for header and logs.');
                    }
                    htmx.trigger('body', 'detailFieldUpdated', {});
                    htmx.trigger('body', 'actionLogUpdated', {});
                    htmx.trigger('body', 'auditLogUpdated', {});
                })
                .catch(error => {
                    console.error('[Actions] There was a problem with the fetch operation:', error);
                    // Optionally, show an error message to the user in the modal
                });
            });
        }
    });

    // Event listener for status/priority radio buttons (special case)
    document.body.addEventListener('click', function(event) {
        const target = event.target;
        if (target.matches('input[type="radio"][name="status"], input[type="radio"][name="priority"]')) {

            const modal = document.getElementById('actionConfirmationModal');
            if (!modal) {
                console.error('[Actions] Could not find #actionConfirmationModal.');
                return;
            }
            const modalTitle = modal.querySelector('.modal-title');

            const fieldName = target.name;
            const newValue = target.value;

            const containerId = fieldName === 'status' ? '#status-buttons' : '#priority-buttons';
            const container = document.querySelector(containerId);

            if (!container) {
                console.error(`[Actions] Could not find container with ID: ${containerId}`);
                return;
            }

            const initialValueRadio = container.querySelector(`input[name=${fieldName}][data-original-value="true"]`);
            const initialValue = initialValueRadio ? initialValueRadio.value : null;
            // if (scriptConfig.debug) console.log(`[Actions] Field: ${fieldName}, Old value: ${initialValue}, New value: ${newValue}`);

            if (newValue === initialValue) {
                // if (scriptConfig.debug) console.log('[Actions] Value is unchanged. Aborting.');
                return; // Do nothing if the value hasn't changed
            }

            // This button is hidden but holds the data we need for the generic modal handler
            const triggerButton = document.getElementById('status-priority-change-trigger');
            if (triggerButton) {
                const configElement = document.getElementById('aid-request-config');
                const fieldOp = configElement.dataset.fieldOp;
                const aidRequestId = configElement.dataset.aidRequestId;
                const newValueDisplay = document.querySelector(`label[for=${target.id}]`).textContent.trim();
                const initialValueDisplay = initialValueRadio ? document.querySelector(`label[for=${initialValueRadio.id}]`).textContent.trim() : 'none';

                const capitalizedFieldName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

                // --- This is the new, cleaner way to build the modal ---
                triggerButton.dataset.actionName = `Change ${capitalizedFieldName}`;
                triggerButton.dataset.oldValue = initialValueDisplay;
                triggerButton.dataset.newValue = newValueDisplay;
                // The main modal handler will now build the correct "From/To" body

                // Icon and class mapping
                const styleMap = {
                    'high': { icon: 'exclamation-diamond-fill', btnClass: 'btn-danger' },
                    'medium': { icon: 'exclamation-triangle-fill', btnClass: 'btn-warning' },
                    'low': { icon: 'info-circle-fill', btnClass: 'btn-primary' },
                    'assigned': { icon: 'person-check-fill', btnClass: 'btn-primary' },
                    'confirmed': { icon: 'check-circle-fill', btnClass: 'btn-success' },
                    'rejected': { icon: 'x-circle-fill', btnClass: 'btn-danger' },
                    'completed': { icon: 'check2-all', btnClass: 'btn-success' },
                    'cancelled': { icon: 'slash-circle-fill', btnClass: 'btn-secondary' },
                    'default': { icon: 'question-circle-fill', btnClass: 'btn-primary' }
                };
                const styles = styleMap[newValue] || styleMap['default'];

                triggerButton.dataset.confirmButtonText = `Change ${capitalizedFieldName}`;
                triggerButton.dataset.confirmButtonIcon = styles.icon;
                triggerButton.dataset.confirmButtonClass = styles.btnClass;

                // Clear any lingering data from previous actions before setting new data
                delete triggerButton.dataset.status;
                delete triggerButton.dataset.priority;
                triggerButton.dataset[fieldName] = newValue;
                // if (scriptConfig.debug) console.log('[Actions] Populated hidden trigger button:', triggerButton.dataset);

                const modalEl = document.querySelector(triggerButton.dataset.bsTarget);
                if (!modalEl) {
                    console.error('[Actions] Cannot find modal element with selector:', triggerButton.dataset.bsTarget);
                    return;
                }
                const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                modal.show(triggerButton);

                // Reset the radio button if the modal is cancelled
                modalEl.addEventListener('hide.bs.modal', (event) => {
                    const modalInstance = bootstrap.Modal.getInstance(modalEl);
                    if (!modalInstance.isConfirmed) {
                         // if (scriptConfig.debug) console.log('[Actions] Modal cancelled, reverting radio button state.');
                         if(initialValueRadio) {
                            initialValueRadio.checked = true;
                         } else {
                            // If there was no original value, uncheck the one the user clicked
                            target.checked = false;
                         }
                    }
                }, { once: true });
            }
        }
    });

    // --- The following listeners are for the Aid Request UPDATE page ---

    // --- Section Editing (Lock/Unlock) ---
    document.querySelectorAll('.btn-edit-section').forEach(button => {
        button.addEventListener('click', function() {
            const targetSelector = this.dataset.target;
            if (scriptConfig.debug) {
                console.log(`[Actions] Lock button clicked for target: ${targetSelector}`);
            }
            const fieldset = document.querySelector(targetSelector);

            if (fieldset) {
                const isDisabling = !fieldset.disabled;
                fieldset.disabled = isDisabling;

                const icon = this.querySelector('i');
                const saveCancelContainer = fieldset.querySelector('.d-flex.justify-content-end');
                const saveButton = saveCancelContainer ? saveCancelContainer.querySelector('button[type="submit"]') : null;
                const cancelButton = saveCancelContainer ? saveCancelContainer.querySelector('button[type="button"]') : null;

                if (isDisabling) {
                    // Re-locking the section
                    this.classList.remove('btn-outline-success');
                    this.classList.add('btn-outline-danger');
                    icon.classList.remove('bi-unlock-fill');
                    icon.classList.add('bi-lock-fill');
                    if (saveButton) {
                        saveButton.disabled = true;
                        saveButton.innerHTML = '<span class="text-nowrap"><i class="bi bi-lock-fill"></i> Unlock to Save</span>';
                    }
                    if (cancelButton) {
                        cancelButton.disabled = true;
                    }
                } else {
                    // Unlocking the section
                    this.classList.remove('btn-outline-danger');
                    this.classList.add('btn-outline-success');
                    icon.classList.remove('bi-lock-fill');
                    icon.classList.add('bi-unlock-fill');
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = '<span class="text-nowrap"><i class="bi bi-check-circle-fill"></i> Save Changes</span>';
                    }
                    if (cancelButton) {
                        cancelButton.disabled = false;
                    }
                }
            }
        });
    });

    // --- Cancel Edit Button ---
    document.querySelectorAll('.btn-cancel-edit').forEach(button => {
        button.addEventListener('click', function() {
            const fieldset = this.closest('fieldset');
            if (fieldset) {
                const form = this.closest('form');
                form.reset(); // Reset form fields to their initial values

                // Re-fetch initial state if needed or simply re-disable
                const editButton = document.querySelector(`.btn-edit-section[data-target="#${fieldset.id}"]`);
                if (editButton) {
                    fieldset.disabled = true;
                    const icon = editButton.querySelector('i');
                    editButton.classList.remove('btn-outline-success');
                    editButton.classList.add('btn-outline-danger');
                    icon.classList.remove('bi-unlock-fill');
                    icon.classList.add('bi-lock-fill');

                    const saveCancelButtons = fieldset.querySelector('.d-flex.justify-content-end');
                    if (saveCancelButtons) {
                        saveCancelButtons.classList.add('d-none');
                    }
                }
            }
        });
    });

    // --- Handle submission for all partial update forms ---
    document.querySelectorAll('.partial-update-form').forEach(form => {
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            if (scriptConfig.debug) {
                console.log(`[Actions] Intercepted submission for form: #${this.id}`);
            }

            const formData = new FormData(this);
            const payload = Object.fromEntries(formData.entries());

             // Add the form name to the payload
            payload.form_name = this.dataset.formName;

            if (scriptConfig.debug) {
                console.log('[Actions] Form data to be sent:');
                console.table(payload);
            }

            const configElement = document.getElementById('aid-request-config');
            const url = configElement.dataset.urlPartialUpdate;
            const csrfToken = configElement.dataset.csrfToken;

            fetchWithLogging(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                body: JSON.stringify(payload)
            }, 'Partial Form Update')
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Network response was not ok.');
            })
            .then(data => {
                if (scriptConfig.debug) {
                    console.log('[Actions] Partial update successful, server response:', data);
                }
                showActionAlert('Update successful!', 'success');

                // Re-lock the form after successful submission
                const fieldset = this.querySelector('fieldset');
                if (fieldset) {
                    const editButton = document.querySelector(`.btn-edit-section[data-target="#${fieldset.id}"]`);
                    if(editButton) {
                        editButton.click();
                    }
                }
                // Trigger a log refresh after a successful partial update
                htmx.trigger('body', 'actionLogUpdated', {});
                htmx.trigger('body', 'auditLogUpdated', {});

            })
            .catch(error => {
                console.error('[Actions] There was a problem with the partial update:', error);
                showActionAlert('An error occurred while updating.', 'danger');
            });
        });
    });

    // --- Centralized Event Handling for Log and Location Updates ---
    // This listener intercepts any htmx request and adds the `since_id` parameter
    // if it's a request for action or audit logs. It dynamically finds the latest
    // log ID from the DOM, making the process stateless and robust.
    document.body.removeEventListener('htmx:configRequest', htmxConfigRequestLogger);
    document.body.addEventListener('htmx:configRequest', htmxConfigRequestLogger);

    function htmxConfigRequestLogger(evt) {
        const aidRequestId = document.getElementById('aid-request-config')?.dataset.aidRequestId;
        if (!aidRequestId) return;

        const path = evt.detail.path;
        const fieldOp = document.getElementById('aid-request-config')?.dataset.fieldOp;

        if (path.includes(`/api/${fieldOp}/aidrequest/${aidRequestId}/action-logs`)) {
            // Find the top-most log entry in the current table and get its ID
            const lastActionLogId = document.querySelector('#action-logs-tbody tr[data-log-id]')?.dataset.logId || 0;
            evt.detail.parameters['since_id'] = lastActionLogId;
            if (scriptConfig.debug) {
                console.log(`[configRequest] Intercepted action-logs request. Using specific selector #action-logs-tbody. Adding since_id: ${lastActionLogId}`);
            }
        } else if (path.includes(`/api/${fieldOp}/aidrequest/${aidRequestId}/audit-logs`)) {
            // Find the top-most log entry in the current table and get its ID
            const lastAuditLogId = document.querySelector('#audit-logs-tbody tr[data-log-id]')?.dataset.logId || 0;
            evt.detail.parameters['since_id'] = lastAuditLogId;
            if (scriptConfig.debug) {
                console.log(`[configRequest] Intercepted audit-logs request. Adding since_id: ${lastAuditLogId}`);
            }
        }
    }

    // --- Specific Modal Handlers ---

    // Listener to close the "Change Aid Type" modal after a successful HTMX submission
    const changeAidTypeForm = document.getElementById('change-aid-type-form');
    if (changeAidTypeForm) {
        changeAidTypeForm.addEventListener('htmx:afterOnLoad', function(evt) {
            // The server responds with 204 No Content on success, which htmx handles.
            // The HX-Trigger header will have already fired the log updates.
            // Now, we just need to close the modal.
            const modalEl = document.getElementById('changeAidTypeModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) {
                modal.hide();
            }
        });
    }

    const changeAidTypeModalEl = document.getElementById('changeAidTypeModal');
    if (changeAidTypeModalEl) {
        changeAidTypeModalEl.addEventListener('hide.bs.modal', function() {
            // Check if there is an active element and if it's inside this modal
            if (document.activeElement && changeAidTypeModalEl.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        });
    }


    /**
     * On page load, find the initial newest log IDs for both action and audit logs
     * and log them to the console to confirm the initial state is captured correctly.
     */
    function logInitialLatestIds() {
        if (scriptConfig.debug) {
            // Find the action logs table and its first row's ID
            const actionTbody = document.getElementById('action-logs-tbody');
            if (actionTbody) {
                const firstActionRow = actionTbody.querySelector('tr[data-log-id]');
                const lastActionLogId = firstActionRow ? firstActionRow.dataset.logId : 0;
                console.log(`[Init] Found action logs table. Newest log ID is ${lastActionLogId}.`);
            } else {
                console.log('[Init] Action logs table not found.');
            }

            // Find the audit logs table and its first row's ID
            const auditTbody = document.getElementById('audit-logs-tbody');
            if (auditTbody) {
                const firstAuditRow = auditTbody.querySelector('tr[data-log-id]');
                const lastAuditLogId = firstAuditRow ? firstAuditRow.dataset.logId : 0;
                console.log(`[Init] Found audit logs table. Newest log ID is ${lastAuditLogId}.`);
            } else {
                console.log('[Init] Audit logs table not found.');
            }
        }
    }

    // --- Location Card Collapse ---
    document.addEventListener('show.bs.collapse', function (event) {
        const icon = event.target.previousElementSibling.querySelector('.collapse-icon i');
        if (icon) {
            icon.classList.remove('bi-chevron-down');
            icon.classList.add('bi-chevron-up');
        }
    });

    document.addEventListener('hide.bs.collapse', function (event) {
        const icon = event.target.previousElementSibling.querySelector('.collapse-icon i');
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

        // Hide the crispy-forms label for the actual input
        const crispyLabel = document.querySelector('#country-input-wrapper label');
        if (crispyLabel) {
            crispyLabel.classList.add('d-none');
        }
    }

    // --- Add Location Modal Logic ---

    // This event is fired by location-picker-map.js. We override the source
    // if the geocoding was initiated from this modal.
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

    function initializeAddLocation() {
        const addLocationModal = document.getElementById('addLocationModal');
        if (!addLocationModal) return;

        // Add this listener to prevent the ARIA warning when the modal closes
        addLocationModal.addEventListener('hide.bs.modal', function () {
            if (document.activeElement && addLocationModal.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        });

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
            // The form submission is now handled by HTMX attributes on the form tag itself.
            // This manual submission handler is no longer needed.
            const addressFields = form.querySelectorAll('#id_city_modal, #id_state_modal, #id_street_address_modal');
            addressFields.forEach(input => {
                input.addEventListener('blur', performModalGeocode);
                input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); performModalGeocode(); } });
            });
        }
    }

    // Initialize all the things
    initializeAddLocation();
    logInitialLatestIds(); // Call the new function here

    // This listener is no longer needed as all location updates are now handled
    // by direct HTML swaps from the server, not by a secondary trigger.
    // document.body.addEventListener('locationListUpdated', function(evt) { ... });

    // --- Modal Confirmation Toggles ---
    document.body.addEventListener('change', function(event) {
        // For the generic detail field modal (Description, etc.)
        if (event.target.id === 'edit-confirmation-toggle') {
            const saveButton = document.getElementById('generic-save-button');
            if (saveButton) {
                saveButton.classList.toggle('d-none', !event.target.checked);
            }
        }

        // For the address edit modal
        if (event.target.id === 'edit-confirmation-eyeball') {
            const saveButton = document.getElementById('address-save-button');
            if (saveButton) {
                saveButton.classList.toggle('d-none', !event.target.checked);
            }
        }

        // For the requester info inline form
        if (event.target.id === 'requester-info-confirm-toggle') {
            const saveButton = document.getElementById('requester-info-save-button');
            if (saveButton) {
                saveButton.classList.toggle('d-none', !event.target.checked);
            }
        }
    });
});

function copyCoords(elementId) {
    const coordsElement = document.getElementById(elementId);
    if (coordsElement) {
        const coordsText = coordsElement.innerText;
        navigator.clipboard.writeText(coordsText)
            .then(() => {
                showActionAlert(`Copied: ${coordsText}`, 'success');
            })
            .catch(err => {
                console.error('Failed to copy coordinates: ', err);
                showActionAlert('Failed to copy coordinates.', 'danger');
            });
    }
}
