// htmx-helpers.js

const htmxHelpersConfig = {
    debug: false, // Set to true to enable console logging for this script
};

function getLatestTimestamp(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) {
        if (htmxHelpersConfig.debug) console.error(`Table body with ID #${tableBodyId} not found.`);
        return null;
    }

    const firstRow = tableBody.querySelector('tr:first-child');
    if (!firstRow) {
        // No rows yet, so no timestamp. The backend should fetch all.
        return null;
    }

    const timestamp = firstRow.dataset.timestamp;
    if (htmxHelpersConfig.debug) console.log(`Found latest timestamp for #${tableBodyId}: ${timestamp}`);
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

/**
 * Displays a dismissible alert at the top of the page.
 * @param {string} message - The message to display in the alert.
 * @param {string} type - The Bootstrap alert type (e.g., 'success', 'danger', 'warning').
 */
function showActionAlert(message, type = 'success') {
    const container = document.getElementById('action-alert-container');
    if (!container) {
        if (htmxHelpersConfig.debug) console.error('Alert container not found.');
        return;
    }

    const alertId = `alert-${Date.now()}`;
    const alertHTML = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    container.innerHTML = alertHTML;

    // Optional: Automatically dismiss the alert after a few seconds
    setTimeout(() => {
        const alertElement = document.getElementById(alertId);
        if (alertElement) {
            const bsAlert = new bootstrap.Alert(alertElement);
            bsAlert.close();
        }
    }, 5000); // 5 seconds
}


// Listener to close a modal when triggered by a server response
document.addEventListener('DOMContentLoaded', function () {
    if (htmxHelpersConfig.debug) console.log('[HTMX Helpers] Script version: ' + htmxHelpersConfig.version + ' loaded.');

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
                    if (htmxHelpersConfig.debug) console.log(`[closeModal] Closing modal: ${modalId}`);
                    modalInstance.hide();
                } else {
                    if (htmxHelpersConfig.debug) console.error(`[closeModal] No Bootstrap modal instance found for: ${modalId}`);
                }
            } else {
                if (htmxHelpersConfig.debug) console.error(`[closeModal] Modal element not found for selector: ${modalId}`);
            }
        } else {
            if (htmxHelpersConfig.debug) console.error('[closeModal] No modalId specified in event detail.', evt.detail);
        }
    });

    document.body.addEventListener('showActionAlert', function (evt) {
        if (evt.detail.message) {
            showActionAlert(evt.detail.message, evt.detail.level || 'success');
        }
    });
});
