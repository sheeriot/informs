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
        showStatus('sending');

        try {
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            const fieldOpSlug = document.body.dataset.fieldOpSlug;

            // Use existing sendcot-aidrequest endpoint with field_op slug
            const response = await fetch(`/api/${fieldOpSlug}/sendcot-aidrequest/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    ...(visibleRows.length > 0 ? { aidrequests: visibleRows } : {}),
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
                if (takConfig.debug) {
                    console.table({
                        action: 'TAK Alert Task Started',
                        taskId: data.sendcot_id,
                        fieldOp: fieldOpSlug
                    });
                }
                // Start polling for task status
                pollTaskStatus(data.sendcot_id, fieldOpSlug);
            } else {
                throw new Error(data.message || 'Failed to send TAK alerts');
            }
        } catch (error) {
            console.error('[TAK] Alert Error:', {
                error: error.message,
                requestIds: visibleRows
            });
            showStatus('error', error.message || 'Error sending alerts');
            takAlertButton.disabled = false;
            takAlertButton.innerHTML = '<i class="bi bi-bullseye me-1"></i>Alert TAK';
        }
    });
}

// Poll for task status
async function pollTaskStatus(taskId, fieldOpSlug) {
    const maxAttempts = 30; // Maximum number of polling attempts
    const pollInterval = 2000; // Poll every 2 seconds
    let attempts = 0;

    const poll = async () => {
        try {
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            const response = await fetch(`/api/${fieldOpSlug}/sendcot-checkstatus/?sendcot_id=${taskId}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRFToken': csrfToken
                }
            });

            if (!response.ok) {
                throw new Error(`Server Error (${response.status})`);
            }

            const data = await response.json();

            if (takConfig.debug) {
                console.table({
                    action: 'TAK Alert Task Status',
                    taskId: taskId,
                    status: data.status,
                    attempt: attempts + 1
                });
            }

            switch (data.status) {
                case 'SUCCESS':
                    showStatus('success', `${data.result || 'Alerts sent successfully'}`);
                    resetButton();
                    return;
                case 'FAILURE':
                    showStatus('error', data.result || 'Task failed');
                    resetButton();
                    return;
                case 'PENDING':
                case 'STARTED':
                    if (attempts >= maxAttempts) {
                        showStatus('warning', 'Task taking longer than expected. Please check status later.');
                        resetButton();
                        return;
                    }
                    attempts++;
                    setTimeout(poll, pollInterval);
                    break;
                default:
                    showStatus('warning', `Unknown task status: ${data.status}`);
                    resetButton();
                    return;
            }
        } catch (error) {
            console.error('[TAK] Task Status Error:', error);
            showStatus('error', 'Error checking task status');
            resetButton();
        }
    };

    // Start polling
    poll();
}

// Reset button state
function resetButton() {
    const takAlertButton = document.getElementById('tak-alert-button');
    if (takAlertButton) {
        takAlertButton.disabled = false;
        takAlertButton.innerHTML = '<i class="bi bi-bullseye me-1"></i>Alert TAK';
    }
}

// Helper function to show status messages
function showStatus(type, message) {
    const statusElement = document.getElementById('tak-alert-status');
    const takAlertButton = document.getElementById('tak-alert-button');

    if (!statusElement) return;

    // Clear any existing timeouts
    if (window.takStatusTimeout) {
        clearTimeout(window.takStatusTimeout);
    }

    statusElement.classList.remove('d-none');

    switch (type) {
        case 'sending':
            takAlertButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Sending...';
            statusElement.innerHTML = '';
            break;

        case 'success':
            statusElement.innerHTML = `
                <span class="text-success">
                    <i class="bi bi-check-circle"></i>
                    ${message}
                </span>
            `;
            window.takStatusTimeout = setTimeout(() => {
                statusElement.classList.add('d-none');
            }, 10000);
            break;

        case 'error':
            statusElement.innerHTML = `
                <span class="text-danger">
                    <i class="bi bi-exclamation-circle"></i>
                    ${message}
                </span>
            `;
            window.takStatusTimeout = setTimeout(() => {
                statusElement.classList.add('d-none');
            }, 15000);
            break;

        case 'warning':
            statusElement.innerHTML = `
                <span class="text-warning">
                    <i class="bi bi-exclamation-triangle"></i>
                    ${message}
                </span>
            `;
            window.takStatusTimeout = setTimeout(() => {
                statusElement.classList.add('d-none');
            }, 5000);
            break;
    }
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeTakAlert);
