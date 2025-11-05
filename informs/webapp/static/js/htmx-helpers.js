// htmx-helpers.js

function getLatestTimestamp(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) {
        console.error(`Table body with ID #${tableBodyId} not found.`);
        return null;
    }

    const firstRow = tableBody.querySelector('tr:first-child');
    if (!firstRow) {
        // No rows yet, so no timestamp. The backend should fetch all.
        return null;
    }

    const timestamp = firstRow.dataset.timestamp;
    console.log(`Found latest timestamp for #${tableBodyId}: ${timestamp}`);
    return timestamp;
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function getLatestLogId() {
    const logTableBody = document.querySelector('#action-logs-tbody');
    if (logTableBody) {
        const firstRow = logTableBody.querySelector('tr[data-log-id]');
        if (firstRow) {
            return firstRow.dataset.logId;
        }
    }
    return '0';
}

// Listener to close a modal when triggered by a server response
document.addEventListener('DOMContentLoaded', function () {
    console.log('[HTMX Helpers] Script version 0.0.13 loaded.');

    document.body.addEventListener('closeModal', function (evt) {
        let modalId = null;

        // Check if the modal ID is directly in the event detail
        if (evt.detail && typeof evt.detail === 'string') {
            modalId = evt.detail;
        }
        // Check if it's in a value property, which HTMX might add
        else if (evt.detail && evt.detail.value) {
            modalId = evt.detail.value;
        }

        if (modalId) {
            const modalElement = document.querySelector(modalId);
            if (modalElement) {
                const modalInstance = bootstrap.Modal.getInstance(modalElement);
                if (modalInstance) {
                    console.log(`[closeModal] Closing modal: ${modalId}`);
                    modalInstance.hide();
                } else {
                    console.error(`[closeModal] No Bootstrap modal instance found for: ${modalId}`);
                }
            } else {
                console.error(`[closeModal] Modal element not found for selector: ${modalId}`);
            }
        } else {
            console.error('[closeModal] No modalId specified in event detail.', evt.detail);
        }
    });

    document.body.addEventListener('showActionAlert', function (evt) {
        if (evt.detail.message) {
            showActionAlert(evt.detail.message, evt.detail.level || 'success');
        }
    });
});
