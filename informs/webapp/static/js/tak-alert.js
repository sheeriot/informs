/**
 * tak-alert.js
 *
 * Handles TAK alert functionality for aid requests
 */

const takConfig = { debug: false };

// Initialize TAK Alert functionality
function initializeTakAlert() {
    const takAlertButton = document.getElementById('tak-alert-button');
    const statusElement = document.getElementById('tak-alert-status');
    const statusFeedback = document.getElementById('tak-status-feedback');
    const statusMessage = document.getElementById('tak-status-message');

    if (!takAlertButton) {
        if (takConfig.debug) console.warn('[TAK] Alert button not found');
        return;
    }

    takAlertButton.addEventListener('click', async function() {
        // Get visible aid request IDs
        const tableBody = document.querySelector('#aid-request-list-body');
        if (!tableBody) {
            console.error('[TAK] Table body not found');
            return;
        }

        const visibleRows = Array.from(tableBody.getElementsByTagName('tr'))
            .filter(row => !row.classList.contains('d-none') && row.id !== 'aid-request-empty-row')
            .map(row => row.getAttribute('data-id'))
            .filter(id => id);

        if (takConfig.debug) {
            console.table({
                action: 'TAK Alert Triggered',
                visibleRequests: visibleRows.length,
                requestIds: visibleRows
            });
        }

        if (visibleRows.length === 0) {
            showStatus('warning', 'No visible requests to send');
            return;
        }

        // Show loading state
        takAlertButton.disabled = true;
        const originalContent = takAlertButton.innerHTML;
        takAlertButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...';
        showStatus('sending');

        try {
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            const fieldOpSlug = document.body.dataset.fieldOpSlug;
            const message = statusMessage ? statusMessage.value : '';

            // Use existing sendcot-aidrequest endpoint with field_op slug
            const response = await fetch(`/${fieldOpSlug}/sendcot-aidrequest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    ...(visibleRows.length > 0 ? { aidrequests: visibleRows } : {}),
                    message_type: 'update',
                    status_message: message
                })
            });

            // Check if response is ok before trying to parse JSON
            if (!response.ok) {
                let errorDetail;
                try {
                    const errorData = await response.json();
                    errorDetail = errorData.detail || errorData.message || errorData.error;
                } catch (e) {
                    errorDetail = response.statusText;
                }
                throw new Error(`Server Error (${response.status}): ${errorDetail}`);
            }

            const data = await response.json();

            if (data.sendcot_id) {
                showStatus('success', `${visibleRows.length} alerts sent successfully`);
                if (takConfig.debug) {
                    console.table({
                        action: 'TAK Alert Success',
                        sentRequests: visibleRows.length || 'all',
                        taskId: data.sendcot_id,
                        fieldOp: fieldOpSlug
                    });
                }
            } else {
                throw new Error(data.message || 'Failed to send TAK alerts');
            }
        } catch (error) {
            console.error('[TAK] Alert Error:', {
                error: error.message,
                requestIds: visibleRows
            });
            showStatus('error', error.message || 'Error sending alerts');
        } finally {
            takAlertButton.disabled = false;
            takAlertButton.innerHTML = originalContent;
        }
    });
}

// Helper function to show status messages
function showStatus(type, message) {
    const statusElement = document.getElementById('tak-alert-status');
    const statusFeedback = document.getElementById('tak-status-feedback');

    if (!statusElement) return;

    // Clear any existing timeouts
    if (window.takStatusTimeout) {
        clearTimeout(window.takStatusTimeout);
    }

    switch (type) {
        case 'sending':
            statusElement.classList.remove('d-none');
            statusElement.innerHTML = `
                <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
                <span class="ms-1">Sending alerts...</span>
            `;
            if (statusFeedback) statusFeedback.classList.add('d-none');
            break;

        case 'success':
            statusElement.classList.remove('d-none');
            statusElement.innerHTML = `
                <span class="text-success">
                    <i class="bi bi-check-circle"></i>
                    ${message}
                </span>
            `;
            if (statusFeedback) statusFeedback.classList.remove('d-none');
            // Keep success message visible for 10 seconds
            window.takStatusTimeout = setTimeout(() => {
                statusElement.classList.add('d-none');
                if (statusFeedback) statusFeedback.classList.add('d-none');
            }, 10000);
            break;

        case 'error':
            statusElement.classList.remove('d-none');
            statusElement.innerHTML = `
                <span class="text-danger">
                    <i class="bi bi-exclamation-circle"></i>
                    ${message}
                </span>
            `;
            if (statusFeedback) statusFeedback.classList.add('d-none');
            // Keep error message visible for 15 seconds
            window.takStatusTimeout = setTimeout(() => {
                statusElement.classList.add('d-none');
            }, 15000);
            break;

        case 'warning':
            statusElement.classList.remove('d-none');
            statusElement.innerHTML = `
                <span class="text-warning">
                    <i class="bi bi-exclamation-triangle"></i>
                    ${message}
                </span>
            `;
            if (statusFeedback) statusFeedback.classList.add('d-none');
            // Keep warning message visible for 5 seconds
            window.takStatusTimeout = setTimeout(() => {
                statusElement.classList.add('d-none');
            }, 5000);
            break;
    }
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeTakAlert);
