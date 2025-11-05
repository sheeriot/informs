/**
 * aidrequests-ajax.js
 *
 * This script is deprecated in favor of aidrequest-actions.js.
 * Its functionality for handling status/priority changes from dropdowns
 * has been integrated into the modal-based action workflow.
 *
 * The logic is now handled by a combination of:
 * 1. The generic modal handler in `aidrequest-actions.js`.
 * 2. The event listeners that trigger the modal, which could be here or elsewhere.
 *
 * For now, this file can be left empty or removed. To maintain the functionality,
 * we will re-implement the dropdown click handlers to use the modal system.
 */

document.addEventListener('DOMContentLoaded', function() {
    const scriptConfig = {
        debug: true,
    };

    document.body.addEventListener('click', function(event) {
        // Find the closest ancestor that is a status or priority option.
        const target = event.target.closest('.status-option, .priority-option');

        if (!target) {
            return; // Exit if the click wasn't on a relevant option.
        }

        event.preventDefault();

        const requestId = target.dataset.requestId;
        const isStatusUpdate = target.classList.contains('status-option');
        const fieldName = isStatusUpdate ? 'status' : 'priority';
        const newValue = target.dataset[fieldName];
        const fieldOpSlug = document.body.dataset.fieldOpSlug;

        if (!fieldOpSlug) {
            console.error('[AJAX Actions] Field operation slug not found in body data attribute. Cannot build URL.');
            return;
        }

        if (scriptConfig.debug) {
            console.log(`[AJAX Actions] Dropdown item clicked: Request ID ${requestId}, New ${fieldName}: ${newValue}`);
        }

        // Close the dropdown menu it came from.
        const dropdownButton = document.querySelector(`button[data-request-id="${requestId}"].dropdown-toggle`);
        if (dropdownButton) {
            const dropdownInstance = bootstrap.Dropdown.getInstance(dropdownButton);
            if (dropdownInstance) {
                dropdownInstance.hide();
            }
        }

        // This button is hidden but holds the data for the generic modal handler.
        const triggerButton = document.getElementById('status-priority-change-trigger');
        if (!triggerButton) {
            console.error('[AJAX Actions] Cannot find hidden trigger button #status-priority-change-trigger');
            return;
        }

        // 1. Dynamically set the data for this specific change.
        triggerButton.dataset.actionUrl = `/api/${fieldOpSlug}/request/${requestId}/update/`;
        triggerButton.dataset.modalTitle = `Confirm ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Change`;
        triggerButton.dataset.modalBody = `You are about to change the ${fieldName} for this Aid Request. This will be logged.`;
        triggerButton.dataset.requestId = requestId;

        // 2. Clear any lingering data from previous actions before setting new data.
        delete triggerButton.dataset.status;
        delete triggerButton.dataset.priority;
        triggerButton.dataset[fieldName] = newValue; // Set the new value to be sent in the payload.

        if (scriptConfig.debug) {
            console.log('[AJAX Actions] Populated hidden trigger button:', triggerButton.dataset);
        }

        // 3. Find and show the modal.
        const modalEl = document.querySelector(triggerButton.dataset.bsTarget);
        if (!modalEl) {
            console.error('[AJAX Actions] Cannot find modal element with selector:', triggerButton.dataset.bsTarget);
            return;
        }
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show(triggerButton); // Pass the trigger button to the modal 'show' event.
    });
});
