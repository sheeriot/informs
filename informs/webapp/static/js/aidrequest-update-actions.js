const aidRequestUpdateConfig = {
    debug: true // Set to true for console logging
};

let alertTimeoutId;

document.addEventListener('DOMContentLoaded', function () {
    if (aidRequestUpdateConfig.debug) {
        console.log('aidrequest-update-actions.js loaded');
    }

    const configDiv = document.getElementById('aid-request-config');
    const config = {
        csrfToken: configDiv.dataset.csrfToken,
        fieldOp: configDiv.dataset.fieldOp,
        aidRequestId: configDiv.dataset.aidRequestId,
        urlPartialUpdate: configDiv.dataset.urlPartialUpdate,
        urlRegenerateMap: configDiv.dataset.urlRegenerateMap,
        urlDeleteLocation: configDiv.dataset.urlDeleteLocation,
        urlUpdateLocationStatus: configDiv.dataset.urlUpdateLocationStatus,
        urlCheckMapStatus: configDiv.dataset.urlCheckMapStatus,
    };

    if (aidRequestUpdateConfig.debug) {
        console.table(config);
    }

    if (aidRequestUpdateConfig.debug) {
        console.log('Setting up section editing...');
    }

    const locationsContainer = document.getElementById('locations-list-container');
    if (locationsContainer) {
        locationsContainer.addEventListener('click', (e) => handleLocationAction(e, config));
        locationsContainer.addEventListener('click', (e) => handlePreviewMapClick(e));
    }

    const statusField = document.querySelector('#div_id_status select');
    const priorityField = document.querySelector('#div_id_priority select');

    if (statusField) {
        statusField.addEventListener('change', (e) => updateRequestField(e, config, 'status'));
    }
    if (priorityField) {
        priorityField.addEventListener('change', (e) => updateRequestField(e, config, 'priority'));
    }

    function updateRequestField(e, config, fieldName) {
        const newValue = e.target.value;
        if (aidRequestUpdateConfig.debug) {
            console.log(`Updating ${fieldName} to ${newValue}`);
        }

        const data = {
            [fieldName]: newValue
        };

        fetch(config.urlPartialUpdate, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': config.csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || 'Server error'); });
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showActionAlert(`${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} updated successfully.`, 'success');
            } else {
                throw new Error(data.error || 'Update failed');
            }
        })
        .catch(error => {
            console.error(`Failed to update ${fieldName}:`, error);
            showActionAlert(`Error updating ${fieldName}: ${error.message}`, 'danger');
        });
    }

    function showActionAlert(message, type = 'warning') {
        const container = document.getElementById('action-alert-container');
        if (!container) return;

        // Clear any existing timeout to prevent race conditions
        if (alertTimeoutId) {
            clearTimeout(alertTimeoutId);
        }

        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;

        container.innerHTML = alertHtml;

        alertTimeoutId = setTimeout(() => {
            const alertElement = container.querySelector('.alert');
            if (alertElement) {
                const bsAlert = bootstrap.Alert.getOrCreateInstance(alertElement);
                if (bsAlert) {
                    bsAlert.close();
                }
            }
        }, 3000);
    }

    function handleLocationAction(e, config) {
        const button = e.target.closest('.delete-location-btn, .generate-map-btn, .confirm-location-btn, .reject-location-btn');
        if (!button) return;

        const locationId = button.dataset.locationId;
        if (!locationId) return;

        let url;
        let action = button.dataset.action;
        const originalButtonHtml = button.innerHTML;

        if (action === 'delete') {
            if (!confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
                return;
            }
            url = config.urlDeleteLocation.replace('0', locationId);
        } else if (action === 'remap') {
            url = config.urlRegenerateMap.replace('0', locationId);
        } else if (action === 'confirm' || action === 'reject') {
            url = config.urlUpdateLocationStatus.replace('0', locationId);
        } else {
            return;
        }

        if (aidRequestUpdateConfig.debug) {
            console.log(`Performing action '${action}' for location ${locationId} at URL: ${url}`);
        }

        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

        const body = new FormData();
        body.append('action', action);

        fetch(url, {
            method: 'POST',
            headers: {
                'X-CSRFToken': config.csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: body,
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (aidRequestUpdateConfig.debug) {
                console.log(`Response for '${action}' action:`, data);
            }

            if (data.status === 'success') {
                if (action === 'delete') {
                    button.closest('.list-group-item')?.remove();
                    showActionAlert('Location deleted successfully.', 'success');
                } else if (action === 'remap') {
                    const mapArea = document.getElementById(`map-area-${locationId}`);
                    if (mapArea && data.map_html) {
                        mapArea.innerHTML = data.map_html;
                        showActionAlert('Map regenerated successfully.', 'success');
                    }
                } else if (action === 'confirm' || action === 'reject') {
                    updateAllLocationCards(data);
                    const message = action === 'confirm' ? 'Location Confirmed.' : 'Location Rejected.';
                    showActionAlert(message, 'success');
                }
            } else {
                throw new Error(data.message || 'An unknown error occurred.');
            }
        })
        .catch(error => {
            console.error('Action failed:', error);
            showActionAlert(`Error: ${error.message}`, 'danger');
        })
        .finally(() => {
            if (action !== 'delete') {
                button.innerHTML = originalButtonHtml;
                button.disabled = false;
            }
        });
    }

    function updateAllLocationCards(data) {
        const { location_pk, new_status, new_status_display, aid_request_has_confirmed_location } = data;
        const allLocationCards = document.querySelectorAll('.list-group-item[id*="-loc"]');

        allLocationCards.forEach(card => {
            const cardLocationId = card.id.split('-al')[1].split('-loc')[0];
            const statusBadge = card.querySelector('.location-status-badge');
            let currentCardStatus;

            // Determine the true status of this card. For the one just updated,
            // use the status from the server response. For others, use their current text.
            if (cardLocationId == location_pk) {
                currentCardStatus = new_status;
                if (statusBadge) {
                    statusBadge.textContent = new_status_display;
                    statusBadge.className = 'location-status-badge mb-1 fw-bold'; // Reset classes
                    if (new_status === 'confirmed') statusBadge.classList.add('text-success');
                    else if (new_status === 'rejected') statusBadge.classList.add('text-danger');
                }
            } else {
                currentCardStatus = statusBadge ? statusBadge.textContent.trim().toLowerCase() : '';
            }

            // Now, rebuild the buttons based on the card's status and the overall confirmed state
            const actionsContainer = card.querySelector('.d-flex.align-items-center');
            if (!actionsContainer) return;

            // Remove existing buttons
            card.querySelector('.confirm-location-btn')?.remove();
            card.querySelector('.reject-location-btn')?.remove();

            if (currentCardStatus === 'new' && !aid_request_has_confirmed_location) {
                const confirmButton = document.createElement('button');
                confirmButton.type = 'button';
                confirmButton.className = 'btn btn-sm btn-success confirm-location-btn ms-2';
                confirmButton.title = 'Confirm this as the primary location';
                confirmButton.dataset.locationId = cardLocationId;
                confirmButton.dataset.action = 'confirm';
                confirmButton.innerHTML = '<i class="bi bi-check-circle"></i> Confirm';
                actionsContainer.appendChild(confirmButton);
            } else if (currentCardStatus === 'confirmed') {
                const rejectButton = document.createElement('button');
                rejectButton.type = 'button';
                rejectButton.className = 'btn btn-sm btn-warning reject-location-btn ms-2';
                rejectButton.title = 'Reject this location';
                rejectButton.dataset.locationId = cardLocationId;
                rejectButton.dataset.action = 'reject';
                rejectButton.innerHTML = '<i class="bi bi-x-octagon"></i> Reject';
                actionsContainer.appendChild(rejectButton);
            }
        });
    }

    function handlePreviewMapClick(e) {
        const button = e.target.closest('.preview-map-btn');
        if (!button) return;

        const mapUrl = button.dataset.mapUrl;
        const modalElement = document.getElementById('mapPreviewModal');
        const modalImage = document.getElementById('mapPreviewImage');

        if (aidRequestUpdateConfig.debug) {
            console.log('[MapPreview] Button clicked. URL:', mapUrl);
        }

        if (mapUrl && modalElement && modalImage) {
            modalImage.src = mapUrl;
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        } else {
            if (aidRequestUpdateConfig.debug) {
                console.error('[MapPreview] Missing mapUrl, modalElement, or modalImage.');
            }
        }
    }

    const addLocationModal = document.getElementById('addLocationModal');
    if (addLocationModal) {
        addLocationModal.addEventListener('show.bs.modal', function (event) {
            if (aidRequestUpdateConfig.debug) console.log('Add location modal is being shown');
            const modalBody = addLocationModal.querySelector('.modal-body');
            const addLocationUrl = configDiv.dataset.urlAddLocation;

            fetch(addLocationUrl)
                .then(response => {
                    if (!response.ok) throw new Error(`Network response was not ok, status: ${response.status}`);
                    return response.text();
                })
                .then(html => {
                    modalBody.innerHTML = html;
                    const form = modalBody.querySelector('#addLocationForm');
                    if (form) {
                        if (aidRequestUpdateConfig.debug) console.log('Attaching submit handler to addLocationForm');
                        form.addEventListener('submit', (e) => handleLocationFormSubmit(e, config));
                    }
                    // Initialize map for the modal
                    if (window.initializeModalMap) {
                        window.initializeModalMap();
                    }
                })
                .catch(error => {
                    console.error('Failed to load location form:', error);
                    modalBody.innerHTML = `<div class="alert alert-danger">Failed to load content: ${error.message}</div>`;
                });
        });
    }

    function handleLocationFormSubmit(e, config) {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.closest('.modal-content').querySelector('#submit-location-form');
        const originalButtonHtml = submitButton.innerHTML;

        if (aidRequestUpdateConfig.debug) {
            console.log('Location form submitted');
        }

        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

        const formData = new FormData(form);

        fetch(form.action, {
            method: 'POST',
            body: formData,
            headers: {
                'X-CSRFToken': config.csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => { throw new Error(text); });
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                if (aidRequestUpdateConfig.debug) console.log('Location form submission successful. Data:', data);
                showActionAlert('Location added successfully.', 'success');
                const modal = bootstrap.Modal.getInstance(addLocationModal);
                modal.hide();

                if (data.new_location_html) {
                    const locationsContainer = document.querySelector('#locations-list-container .list-group');
                    if (aidRequestUpdateConfig.debug) console.log('Attempting to find #locations-list-container .list-group. Found:', locationsContainer);
                    if (locationsContainer) {
                        const noLocationsMessage = locationsContainer.querySelector('#no-locations-message');
                        if (noLocationsMessage) {
                            noLocationsMessage.remove();
                        }
                        locationsContainer.insertAdjacentHTML('beforeend', data.new_location_html);
                    }
                }

                if (data.location_pk) {
                    pollForMap(data.location_pk, config);
                }

            } else {
                console.error('Form submission failed:', data.errors);
                // Simple error display for now
                alert('Error saving location: ' + JSON.stringify(data.errors));
            }
        })
        .catch(error => {
            console.error('Error submitting location form. Server response below:');
            console.error(error.message);
            alert('An unexpected error occurred. Please check the console.');
        })
        .finally(() => {
            submitButton.innerHTML = originalButtonHtml;
            submitButton.disabled = false;
        });
    }

    function pollForMap(locationId, config, retries = 10, delay = 2000) {
        if (retries <= 0) {
            if (aidRequestUpdateConfig.debug) {
                console.error(`[MapPoll] Stopped polling for map on location ${locationId} after max retries.`);
            }
            return;
        }

        if (aidRequestUpdateConfig.debug) {
            console.log(`[MapPoll] Checking map status for location ${locationId}. Retries left: ${retries}`);
        }

        const url = config.urlCheckMapStatus.replace('0', locationId);

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'ready') {
                    if (aidRequestUpdateConfig.debug) {
                        console.log(`[MapPoll] Map is ready for location ${locationId}.`);
                    }
                    const mapArea = document.getElementById(`map-area-${locationId}`);
                    if (mapArea && data.map_html) {
                        mapArea.innerHTML = data.map_html;
                    }
                } else {
                    setTimeout(() => {
                        pollForMap(locationId, config, retries - 1, delay);
                    }, delay);
                }
            })
            .catch(error => {
                console.error(`[MapPoll] Error checking map status for location ${locationId}:`, error);
            });
    }

    // --- Section Editing ---
    function isAnySectionBeingEdited() {
        const fieldsets = document.querySelectorAll('.partial-update-form fieldset');
        for (const fieldset of fieldsets) {
            if (!fieldset.disabled) {
                if (aidRequestUpdateConfig.debug) console.log('isAnySectionBeingEdited: Found an unlocked fieldset', fieldset);
                return true;
            }
        }
        if (aidRequestUpdateConfig.debug) console.log('isAnySectionBeingEdited: No unlocked fieldsets found.');
        return false;
    }

    const editButtons = document.querySelectorAll('.btn-edit-section');
    if (aidRequestUpdateConfig.debug) {
        console.log(`Found ${editButtons.length} edit buttons to attach listeners to.`);
    }

    editButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (aidRequestUpdateConfig.debug) console.log('Edit button clicked', button);
            const fieldset = document.querySelector(button.dataset.target);

            if (fieldset) {
                const isCurrentlyLocked = fieldset.disabled;

                if (isCurrentlyLocked && isAnySectionBeingEdited()) {
                    showActionAlert('Please save or cancel your current edits before editing another section.', 'warning');
                    if (aidRequestUpdateConfig.debug) console.log('Another section is already being edited. Aborting unlock.');
                    return;
                }

                if (aidRequestUpdateConfig.debug) console.log(`Toggling section ${button.dataset.target}. Currently locked: ${isCurrentlyLocked}`);

                fieldset.disabled = !isCurrentlyLocked;
                button.querySelector('i').classList.toggle('bi-lock-fill', !isCurrentlyLocked);
                button.querySelector('i').classList.toggle('bi-unlock-fill', isCurrentlyLocked);
                button.classList.toggle('btn-outline-danger', !isCurrentlyLocked);
                button.classList.toggle('btn-outline-success', isCurrentlyLocked);

                const actionButtons = fieldset.querySelector('.d-flex.justify-content-end');
                if (actionButtons) {
                    actionButtons.classList.toggle('d-none', !isCurrentlyLocked);
                }
            } else {
                 if (aidRequestUpdateConfig.debug) console.error(`Fieldset not found for selector: ${button.dataset.target}`);
            }
        });
    });

    const cancelButtons = document.querySelectorAll('.btn-cancel-edit');
    cancelButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (aidRequestUpdateConfig.debug) console.log('Cancel button clicked', button);
            const form = button.closest('form');
            const fieldset = form.querySelector('fieldset');
            const editButton = document.querySelector(`.btn-edit-section[data-target="#${fieldset.id}"]`);

            form.reset(); // Reset form fields to their initial values
            fieldset.disabled = true;
            editButton.querySelector('i').classList.add('bi-lock-fill');
            editButton.querySelector('i').classList.remove('bi-unlock-fill');
            editButton.classList.add('btn-outline-danger');
            editButton.classList.remove('btn-outline-success');
            button.closest('.d-flex').classList.add('d-none');
        });
    });

    const partialUpdateForms = document.querySelectorAll('.partial-update-form');
    partialUpdateForms.forEach(form => {
        form.addEventListener('submit', (e) => handlePartialUpdate(e, config));
    });

    function handlePartialUpdate(e, config) {
        e.preventDefault();
        const form = e.target;
        const formName = form.dataset.formName;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data['form_name'] = formName; // Tell backend which form is being submitted

        if (aidRequestUpdateConfig.debug) {
            console.log(`Submitting partial update for ${formName}:`, data);
        }

        fetch(config.urlPartialUpdate, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': config.csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || 'Server error'); });
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showActionAlert(`${formName.charAt(0).toUpperCase() + formName.slice(1)} information updated.`, 'success');
                const fieldset = form.querySelector('fieldset');
                const editButton = document.querySelector(`.btn-edit-section[data-target="#${fieldset.id}"]`);
                fieldset.disabled = true;
                editButton.querySelector('i').classList.add('bi-lock-fill');
                editButton.querySelector('i').classList.remove('bi-unlock-fill');
                editButton.classList.add('btn-outline-danger');
                editButton.classList.remove('btn-outline-success');
                form.querySelector('.d-flex.justify-content-end').classList.add('d-none');
            } else {
                // If there are form-specific errors, display them
                if (data.errors) {
                    // This part needs a more sophisticated implementation to display errors next to fields
                    // For now, we'll just show a generic error message
                    let errorMsg = 'Please correct the errors below.';
                    const errorList = Object.entries(data.errors).map(([field, errors]) => `${field}: ${errors.join(', ')}`).join(' ');
                    if(errorList) errorMsg = errorList;
                    showActionAlert(errorMsg, 'danger');

                } else {
                    showActionAlert(data.error || 'Update failed.', 'danger');
                }
            }
        })
        .catch(error => {
            console.error('Partial update failed:', error);
            showActionAlert(`Error: ${error.message}`, 'danger');
        });
    }
});
