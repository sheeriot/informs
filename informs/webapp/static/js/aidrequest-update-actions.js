if (typeof window.aidRequestUpdateActionsConfig === 'undefined') {
    window.aidRequestUpdateActionsConfig = {
        debug: false // Set to true for console logging
    };
}


document.addEventListener('DOMContentLoaded', function () {
    if (window.aidRequestUpdateActionsConfig.debug) {
        console.log('Update actions script loaded.');
    }

    const modalElement = document.getElementById('add-location-modal');
    if (modalElement) {
        modalElement.addEventListener('show.bs.modal', function (event) {
            if (window.aidRequestUpdateActionsConfig.debug) {
                console.log('Add location modal is opening.');
            }
            const button = event.relatedTarget;
            if (!button) {
                if (window.aidRequestUpdateActionsConfig.debug) {
                    console.log('Modal opened without a button.');
                }
                return;
            }

            const aidRequestId = button.dataset.aidrequestId;
            const fieldOpSlug = button.dataset.fieldOpSlug;
            const form = modalElement.querySelector('form');

            if (form && aidRequestId && fieldOpSlug) {
                const url = `/api/${fieldOpSlug}/aidrequest/${aidRequestId}/add-location/`;
                if (window.aidRequestUpdateActionsConfig.debug) {
                    console.log('Setting form action to:', url);
                }
                form.action = url;
            } else {
                if (window.aidRequestUpdateActionsConfig.debug) {
                    console.error('Could not set form action. Missing data.', {
                        form: !!form,
                        aidRequestId: aidRequestId,
                        fieldOpSlug: fieldOpSlug
                    });
                }
            }
        });
    } else {
        if (window.aidRequestUpdateActionsConfig.debug) {
            console.log('Add location modal not found.');
        }
    }

    const deleteModal = document.getElementById('deleteLocationModal');
    if (deleteModal) {
        deleteModal.addEventListener('show.bs.modal', function(event) {
            const button = event.relatedTarget;
            const locationId = button.dataset.locationId;
            const locationStatus = button.dataset.locationStatus;
            const aidRequestId = button.dataset.aidRequestId;
            const requesterName = button.dataset.requesterName;
            const fullAddress = button.dataset.fullAddress;
            const friendlyAddress = button.dataset.friendlyAddress;
            const locationNote = button.dataset.locationNote;

            if (window.aidRequestUpdateActionsConfig.debug) {
                console.log('Delete modal triggered for:', { locationId, locationStatus, aidRequestId });
            }

            const modalTitle = deleteModal.querySelector('#deleteLocationModalLabel');
            const modalBody = deleteModal.querySelector('#location-details-container');

            if (modalTitle) {
                let titleText = `Delete Location #${locationId} for Aid Request #${aidRequestId}`;
                if (requesterName) {
                    titleText += ` (${requesterName})`;
                }
                modalTitle.textContent = titleText;
            } else {
                if (window.aidRequestUpdateActionsConfig.debug) {
                    console.error('Could not find modal title element.');
                }
            }

            const mapContainer = document.getElementById(`map-area-${locationId}`);
            const originalMapImage = mapContainer ? mapContainer.querySelector('img') : null;

            let mapHtml = '<p>Map not available.</p>';
            if (originalMapImage) {
                mapHtml = `<img src="${originalMapImage.src}" class="img-fluid" alt="Map for location ${locationId}">`;
            }

            let detailsHtml = `
                <p class="mb-1"><strong>Status:</strong> ${locationStatus}</p>
            `;
            if (friendlyAddress && friendlyAddress !== 'N/A') {
                detailsHtml += `<p class="mb-1"><strong>Found Address:</strong> ${friendlyAddress}</p>`;
            }
            if (locationNote) {
                detailsHtml += `<p class="mb-1"><strong>Geocode Details:</strong> ${locationNote}</p>`;
            }

            modalBody.innerHTML = `
                ${detailsHtml}
                <div class="mt-2">${mapHtml}</div>
            `;

            const confirmButton = document.getElementById('confirmDeleteLocationButton');
            confirmButton.dataset.locationId = locationId;
        });

        deleteModal.addEventListener('hidden.bs.modal', function() {
            const noteTextarea = document.getElementById('delete-location-note');
            if (noteTextarea) {
                noteTextarea.value = '';
            }
        });

        const confirmDeleteButton = deleteModal.querySelector('#confirmDeleteLocationButton');
        if (confirmDeleteButton) {
            confirmDeleteButton.addEventListener('click', function() {
                const locationId = this.dataset.locationId;
                const config = document.getElementById('aid-request-config');
                const csrfToken = config.dataset.csrfToken;
                let url = config.dataset.urlDeleteLocation.replace('0', locationId);
                const note = document.getElementById('delete-location-note').value;
                const isMarkdown = document.getElementById('delete-location-markdown-check').checked;

                fetch(url, {
                    method: 'DELETE',
                    headers: {
                        'X-CSRFToken': csrfToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ note: note, is_markdown: isMarkdown })
                }).then(response => {
                    if (response.ok) {
                        response.json().then(data => {
                            const modal = bootstrap.Modal.getInstance(deleteModal);
                            modal.hide();
                            htmx.trigger('#locations-list-container', 'refreshLocations');
                            htmx.trigger('body', 'actionLogUpdated');
                        });
                    } else {
                        console.error('Failed to delete location');
                    }
                }).catch(error => console.error('Error:', error));
            });
        }
    }

    const locationStatusModalEl = document.getElementById('locationStatusChangeModal');
    const locationStatusModal = locationStatusModalEl ? new bootstrap.Modal(locationStatusModalEl) : null;

    document.body.addEventListener('click', function(event) {
        const target = event.target.closest('.confirm-location-btn, .reject-location-btn');
        if (target && locationStatusModal) {
            const locationId = target.dataset.locationId;
            const action = target.dataset.action;
            const aidRequestId = target.dataset.aidRequestId;
            const requesterName = target.dataset.requesterName;
            const friendlyAddress = target.dataset.friendlyAddress;

            const modalTitle = locationStatusModalEl.querySelector('.modal-title');
            const contextContainer = locationStatusModalEl.querySelector('#location-status-context-container');
            const confirmBtn = locationStatusModalEl.querySelector('#confirm-location-status-change-btn');

            modalTitle.textContent = `${action === 'confirm' ? 'Confirm' : 'Reject'} Location #${locationId}`;

            let contextHtml = `<p class="mb-1"><strong>Aid Request:</strong> #${aidRequestId} (${requesterName})</p>`;
            if (friendlyAddress && friendlyAddress !== 'N/A') {
                contextHtml += `<p class="mb-1"><strong>Found Address:</strong> ${friendlyAddress}</p>`;
            }
            contextContainer.innerHTML = contextHtml;

            confirmBtn.className = target.className.replace('btn-sm', '');
            confirmBtn.innerHTML = target.innerHTML;

            confirmBtn.dataset.locationId = locationId;
            confirmBtn.dataset.action = action;

            locationStatusModal.show();
        }
    });

    if (locationStatusModalEl) {
        const confirmBtn = locationStatusModalEl.querySelector('#confirm-location-status-change-btn');
        confirmBtn.addEventListener('click', function() {
            const locationId = this.dataset.locationId;
            const action = this.dataset.action;
            const note = locationStatusModalEl.querySelector('#location-action-note').value;
            const isMarkdown = locationStatusModalEl.querySelector('#location-status-markdown-check').checked;

            const config = document.getElementById('aid-request-config');
            const csrfToken = config.dataset.csrfToken;
            let url = config.dataset.urlUpdateLocationStatus.replace('0', locationId);

            fetch(url, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: action, note: note, is_markdown: isMarkdown })
            }).then(response => {
                if (response.ok) {
                    htmx.trigger('#locations-list-container', 'refreshLocations');
                    htmx.trigger('body', 'actionLogUpdated');
                    locationStatusModal.hide();
                } else {
                    console.error('Failed to update location status');
                }
            }).catch(error => console.error('Error:', error));
        });

        locationStatusModalEl.addEventListener('hidden.bs.modal', function() {
            locationStatusModalEl.querySelector('#location-action-note').value = '';
        });
    }
});
