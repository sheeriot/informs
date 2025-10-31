const statusUpdateConfig = {
    debug: false // Set to true for console logging
};

document.addEventListener('DOMContentLoaded', function () {
    if (typeof statusUpdateConfig === 'undefined' || !statusUpdateConfig.debug) {
        // console.log = function() {}; // Uncomment to disable logs when not debugging
    }
    console.log('DOM Content Loaded: Status updater using event delegation.');

    const modalElement = document.getElementById('statusChangeConfirmationModal');
    if (!modalElement) {
        console.error('Modal element #statusChangeConfirmationModal not found.');
        return;
    }

    if (statusUpdateConfig.debug) {
        console.log('Modal element found, attaching listeners.');
    }

    const confirmationModal = new bootstrap.Modal(modalElement);
    const modalTitle = document.getElementById('statusChangeConfirmationModalLabel');
    const confirmationMessage = document.getElementById('status-change-confirmation-message');
    const confirmActionBtn = document.getElementById('confirm-status-change-btn');
    const cancelActionBtn = document.getElementById('cancel-status-change-btn');
    const actionNote = document.getElementById('action-note');

    let currentElement = null; // The radio button that was clicked

    // Use event delegation on the body for radio button clicks
    document.body.addEventListener('click', function(event) {
        const target = event.target;
        if (target.matches('input[type="radio"][name="status"], input[type="radio"][name="priority"]')) {
            if (statusUpdateConfig.debug) {
                console.log('Radio button clicked:', {
                    name: target.name,
                    value: target.value
                });
            }
            currentElement = target;

            const fieldName = currentElement.name;
            const newValue = currentElement.value;

            // Find what was originally checked when the page/partial was rendered
            const container = currentElement.closest('#request-status-card');
            const allRadiosInGroup = container.querySelectorAll(`input[name=${fieldName}]`);
            let oldValue = 'None';
            allRadiosInGroup.forEach(r => { if (r.defaultChecked) oldValue = r.value; });

            const fieldLabel = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
            if (statusUpdateConfig.debug) {
                console.log(`Field: ${fieldName}, Old Value: ${oldValue}, New Value: ${newValue}`);
            }

            // If the value hasn't changed, do nothing.
            if (newValue === oldValue) {
                if (statusUpdateConfig.debug) {
                    console.log('Value is unchanged. Aborting.');
                }
                return;
            }

            // If we are here, the value has changed, so show the modal.
            modalTitle.textContent = `Confirm ${fieldLabel} Change`;
            confirmationMessage.textContent = `You are about to change the ${fieldLabel} of this Aid Request.`;

            if (statusUpdateConfig.debug) {
                console.log('Showing confirmation modal.');
            }
            confirmationModal.show();
        }
    });

    // Handle the final confirmation click
    confirmActionBtn.addEventListener('click', function () {
        if (statusUpdateConfig.debug) {
            console.log('Confirm button clicked.');
        }

        // Blur the button immediately to solve the ARIA focus trap warning.
        confirmActionBtn.blur();

        if (currentElement) {
            const fieldName = currentElement.name;
            const newValue = currentElement.value;
            const note = actionNote.value;
            const isMarkdown = document.getElementById('status-priority-markdown-check').checked;
            if (statusUpdateConfig.debug) {
                console.log(`Confirmed change for ${fieldName} to ${newValue} with note: "${note}"`);
            }

            const configElement = document.getElementById('aid-request-config');
            const hxPostUrl = configElement.dataset.urlPartialUpdate;

            if (statusUpdateConfig.debug) {
                console.log(`Sending HTMX POST request to: ${hxPostUrl}`);
            }
            htmx.ajax('POST', hxPostUrl, {
                headers: {
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                },
                values: {
                    [fieldName]: newValue,
                    'action_note': note,
                    'is_markdown': isMarkdown
                },
                target: '#request-status-card',
                swap: 'outerHTML'
            });

            confirmationModal.hide();
        } else {
            console.error('confirmActionBtn clicked, but no currentElement was set.');
        }
    });

    // Handle the cancel button click
    cancelActionBtn.addEventListener('click', function () {
        if (statusUpdateConfig.debug) {
            console.log('Cancel button clicked.');
        }
        cancelActionBtn.blur();
        confirmationModal.hide();
    });

    // Reset UI state when the modal is opened
    modalElement.addEventListener('show.bs.modal', function() {
        if (statusUpdateConfig.debug) {
            console.log('Modal show event: Resetting form fields.');
        }
        actionNote.value = '';
    });

    // Revert the radio button selection if the user cancels the modal
    modalElement.addEventListener('hide.bs.modal', function () {
        if (statusUpdateConfig.debug) {
            console.log('Modal hide event triggered.');
        }
        if (currentElement) {
            const fieldName = currentElement.name;
            // The container might have been swapped, so always re-query the DOM
            const container = document.getElementById('request-status-card');
            if (container) {
                const radios = container.querySelectorAll(`input[name=${fieldName}]`);
                radios.forEach(radio => {
                    radio.checked = radio.defaultChecked;
                });
                if (statusUpdateConfig.debug) {
                    console.log(`Radios for ${fieldName} reset to default server-rendered state.`);
                }
            }
            currentElement = null; // Clear the state
        }
    });

    // Listen for our custom event to update the header
    document.body.addEventListener('actionLogUpdated', function(event) {
        if (statusUpdateConfig.debug) {
            console.log('actionLogUpdated event received with detail:', event.detail);
        }
        const { status_display, priority_display } = event.detail;

        const headerStatus = document.getElementById('header-status-display');
        const headerPriority = document.getElementById('header-priority-display');

        if (headerStatus && status_display) {
            if (statusUpdateConfig.debug) {
                console.log(`Updated header status to: ${status_display}`);
            }
            headerStatus.textContent = status_display;
        }
        if (headerPriority && priority_display) {
            if (statusUpdateConfig.debug) {
                console.log(`Updated header priority to: ${priority_display}`);
            }
            headerPriority.textContent = priority_display;
        }
    });

    if (statusUpdateConfig.debug) {
        console.log('Event listener for actionLogUpdated is attached to the body.');
    }

});
