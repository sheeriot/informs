document.addEventListener('DOMContentLoaded', function() {
    const scriptConfig = {
        debug: true, // Master debug switch for this script
    };

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
        const modal = event.target;
        const triggerButton = event.relatedTarget;
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
            console.log('[Actions] Action modal triggered by:', triggerButton);
        }

        const modalTitle = modal.querySelector('.modal-title');
        const modalBody = modal.querySelector('.modal-body-dynamic'); // A designated area for dynamic content
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
                delete payload.modalTitle;
                delete payload.modalBody;
                delete payload.actionName;
                delete payload.objectName;
                delete payload.confirmButtonClass;
                delete payload.confirmButtonIcon;
                delete payload.confirmButtonText;

                const url = triggerButton.dataset.actionUrl;
                const method = triggerButton.dataset.httpMethod || 'POST';
                const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;

                if (scriptConfig.debug) {
                    console.log('[Actions] Sending request:', { url, method, payload });
                }

                fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken,
                    },
                    body: JSON.stringify(payload)
                })
                .then(response => {
                    if (response.ok) {
                        // Get the button again from the DOM in case it was replaced
                        const currentConfirmBtn = modal.querySelector('.confirm-action-btn');
                        if (currentConfirmBtn) currentConfirmBtn.blur();
                        return response.json();
                    }
                    throw new Error('Network response was not ok.');
                })
                .then(data => {
                    if (scriptConfig.debug) {
                        console.log('[Actions] Request successful, server response:', data);
                    }

                    // Hide the modal
                    const modalInstance = bootstrap.Modal.getInstance(modal);
                    modalInstance.hide();

                    // Trigger htmx refreshes based on server response or convention
                    if (scriptConfig.debug) {
                        console.log('[Actions] Triggering "actionLogUpdated" on body. The action log should refresh now.');
                    }
                    htmx.trigger('body', 'actionLogUpdated');
                    if (scriptConfig.debug) {
                        console.log('[Actions] Triggering "refreshLocations" on #locations-list-container. The locations list should refresh now.');
                    }
                    htmx.trigger('#locations-list-container', 'refreshLocations');

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
            if (scriptConfig.debug) console.log('[Actions] Radio button clicked:', target);

            const fieldName = target.name;
            const newValue = target.value;

            const container = target.closest('#request-status-card');
            const originalValueRadio = container.querySelector(`input[name=${fieldName}][data-original-value="true"]`);
            const oldValue = originalValueRadio ? originalValueRadio.value : null;
            if (scriptConfig.debug) console.log(`[Actions] Field: ${fieldName}, Old value: ${oldValue}, New value: ${newValue}`);

            if (newValue === oldValue) {
                if (scriptConfig.debug) console.log('[Actions] Value is unchanged. Aborting.');
                return; // Do nothing if the value hasn't changed
            }

            // This button is hidden but holds the data we need for the generic modal handler
            const triggerButton = document.getElementById('status-priority-change-trigger');
            if (triggerButton) {
                // Dynamically set the data for this specific change
                triggerButton.dataset.modalTitle = `Confirm ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Change`;
                triggerButton.dataset.modalBody = `You are about to change the ${fieldName} of this Aid Request.`;

                // Clear any lingering data from previous actions before setting new data
                delete triggerButton.dataset.status;
                delete triggerButton.dataset.priority;
                triggerButton.dataset[fieldName] = newValue;
                if (scriptConfig.debug) console.log('[Actions] Populated hidden trigger button:', triggerButton.dataset);

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
                         if (scriptConfig.debug) console.log('[Actions] Modal cancelled, reverting radio button state.');
                         if(originalValueRadio) {
                            originalValueRadio.checked = true;
                         } else {
                            // If there was no original value, uncheck the one the user clicked
                            target.checked = false;
                         }
                    }
                }, { once: true });
            }
        }
    });
});
