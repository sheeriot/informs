/**
 * tak-alert.js
 *
 * Handles TAK alert functionality for aid requests
 * Version: 0.0.4
 */

const takConfig = {
    debug: true,  // Enable debug logging
    version: '0.0.4'
};

// Main execution
document.addEventListener('DOMContentLoaded', initializeTakAlert);

// Initialize TAK Alert functionality
function initializeTakAlert() {
    const takAlertButton = document.getElementById('tak-alert-button');
    const fieldOpSlug = document.body.dataset.fieldOpSlug;

    if (takConfig.debug) {
        console.log('[TAK] Initializing:', {
            version: takConfig.version,
            button: takAlertButton ? 'found' : 'disabled',
            fieldOp: fieldOpSlug || 'not found'
        });
    }

    if (!takAlertButton) return;

    if (!fieldOpSlug) {
        if (takConfig.debug) console.error('[TAK] Field operation slug not found');
        takAlertButton.disabled = true;
        takAlertButton.title = 'Field operation not available';
        return;
    }

    // Only add the click handler, no UI modifications
    takAlertButton.addEventListener('click', handleTakAlert);
}

// Handle TAK Alert button click
async function handleTakAlert() {
    const takAlertButton = document.getElementById('tak-alert-button');
    const fieldOpSlug = document.body.dataset.fieldOpSlug;
    const aidRequestIds = getVisibleAidRequestIds();

    if (takConfig.debug) {
        console.log('[TAK] Alert triggered:', {
            requestIds: aidRequestIds,
            fieldOp: fieldOpSlug
        });
    }

    if (aidRequestIds.length === 0) {
        if (takConfig.debug) console.warn('[TAK] No aid requests to send');
        showStatus('warning', 'No aid requests to send');
        return;
    }

    // Show loading state
    setButtonState(takAlertButton, 'loading');
    showStatus('sending', 'Sending to TAK...');

    try {
        const data = await sendTakAlert(fieldOpSlug, aidRequestIds);

        if (data.sendcot_id) {
            if (takConfig.debug) {
                console.log('[TAK] Task started:', {
                    taskId: data.sendcot_id,
                    fieldOp: fieldOpSlug
                });
            }

            // Show success state briefly
            setButtonState(takAlertButton, 'success');

            // Start polling for task status
            await pollTaskStatus(data.sendcot_id);

            // Reset button after success
            setTimeout(() => {
                resetButton(takAlertButton);
            }, 2000);
        } else {
            throw new Error(data.message || 'Failed to send TAK alerts');
        }
    } catch (error) {
        if (takConfig.debug) {
            console.error('[TAK] Alert Error:', {
                error: error.message,
                stack: error.stack,
                requestIds: aidRequestIds
            });
        }

        // Show error state
        setButtonState(takAlertButton, 'error');
        showStatus('error', error.message || 'Error sending alerts');

        // Reset button after error
        setTimeout(() => {
            resetButton(takAlertButton);
        }, 3000);
    }
}

// Get visible aid request IDs from either list or detail view
function getVisibleAidRequestIds() {
    const tableBody = document.querySelector('#aid-request-list-body');
    const singleAidRequestId = document.getElementById('aidrequest_id');
    let aidRequestIds = [];

    if (tableBody) {
        // List view - get visible rows
        aidRequestIds = Array.from(tableBody.getElementsByTagName('tr'))
            .filter(row => !row.classList.contains('d-none') && row.id !== 'aid-request-empty-row')
            .map(row => row.getAttribute('data-id'))
            .filter(id => id);
    } else if (singleAidRequestId) {
        // Detail view - single aid request
        aidRequestIds = [singleAidRequestId.value];
    }

    return aidRequestIds;
}

// Send TAK alert to server
async function sendTakAlert(fieldOpSlug, aidRequestIds) {
    const response = await fetch(`/api/${fieldOpSlug}/send-cot/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value,
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            aidrequests: aidRequestIds,
            mark_type: 'aid'
        })
    });

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

    if (takConfig.debug) {
        console.log('[TAK] Server response:', {
            status: response.status,
            data: data
        });
    }

    return data;
}

// Poll for task status
async function pollTaskStatus(taskId) {
    const maxAttempts = 30; // Maximum number of polling attempts
    const pollInterval = 2000; // Poll every 2 seconds
    let attempts = 0;
    const fieldOpSlug = document.body.dataset.fieldOpSlug;

    const poll = async () => {
        try {
            if (takConfig.debug) {
                console.log('[TAK] Polling status:', {
                    attempt: attempts + 1,
                    taskId: taskId,
                    url: `/api/${fieldOpSlug}/sendcot-checkstatus/?sendcot_id=${taskId}`
                });
            }

            showStatus('polling', `Checking task status (attempt ${attempts + 1}/${maxAttempts})...`);

            const response = await fetch(`/api/${fieldOpSlug}/sendcot-checkstatus/?sendcot_id=${taskId}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Server Error (${response.status})`);
            }

            const data = await response.json();

            if (takConfig.debug) {
                console.log('[TAK] Poll response:', {
                    attempt: attempts + 1,
                    status: data.status,
                    result: data.result
                });
            }

            switch (data.status) {
                case 'SUCCESS':
                    showStatus('success', data.result || 'Alerts sent successfully');
                    return;
                case 'FAILURE':
                    showStatus('error', data.result || 'Task failed');
                    return;
                case 'PENDING':
                    showStatus('polling', 'Task pending, waiting for processing...');
                    if (attempts >= maxAttempts) {
                        showStatus('warning', 'Task taking longer than expected. Please check status later.');
                        return;
                    }
                    attempts++;
                    setTimeout(poll, pollInterval);
                    break;
                case 'STARTED':
                    showStatus('polling', 'Task started, sending to TAK...');
                    if (attempts >= maxAttempts) {
                        showStatus('warning', 'Task taking longer than expected. Please check status later.');
                        return;
                    }
                    attempts++;
                    setTimeout(poll, pollInterval);
                    break;
                default:
                    showStatus('warning', `Unknown task status: ${data.status}`);
                    return;
            }
        } catch (error) {
            if (takConfig.debug) {
                console.error('[TAK] Polling Error:', {
                    error: error.message,
                    stack: error.stack,
                    attempt: attempts + 1
                });
            }
            showStatus('error', 'Error checking task status');
        }
    };

    await poll();
}

// Set button state with consistent styling
function setButtonState(button, state) {
    const states = {
        loading: {
            disabled: true,
            html: `
                <div class="d-flex align-items-center">
                    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <div class="d-flex flex-column">
                        <span>Sending</span>
                        <span>Mark...</span>
                    </div>
                </div>
            `,
            class: 'btn-danger'
        },
        success: {
            disabled: true,
            html: `
                <div class="d-flex align-items-center">
                    <i class="bi bi-check-circle fs-4 me-2"></i>
                    <div class="d-flex flex-column">
                        <span>Mark</span>
                        <span>Sent</span>
                    </div>
                </div>
            `,
            class: 'btn-outline-success'
        },
        error: {
            disabled: true,
            html: `
                <div class="d-flex align-items-center">
                    <i class="bi bi-exclamation-circle fs-4 me-2"></i>
                    <div class="d-flex flex-column">
                        <span>Send</span>
                        <span>Failed</span>
                    </div>
                </div>
            `,
            class: 'btn-outline-danger'
        }
    };

    const newState = states[state];
    if (!newState) return;

    button.disabled = newState.disabled;
    button.innerHTML = newState.html;
    button.className = `btn ${newState.class}`;
}

// Reset button to initial state
function resetButton(button) {
    button.disabled = false;
    button.innerHTML = '<i class="bi bi-bullseye me-1"></i>Alert TAK';
    button.className = 'btn btn-danger';
}

// Helper function to show status messages
function showStatus(type, message) {
    const statusContainer = document.querySelector('.sendcot-statuscontainer');

    if (!statusContainer) {
        if (takConfig.debug) console.warn('[TAK] Status container not found');
        return;
    }

    // Clear any existing timeouts
    if (window.takStatusTimeout) {
        clearTimeout(window.takStatusTimeout);
    }

    // Show status container
    statusContainer.classList.remove('opacity-0');

    const alertElement = statusContainer.querySelector('.alert');
    const statusMessage = statusContainer.querySelector('.status-message');

    if (alertElement) {
        alertElement.classList.remove('d-none');
    }

    let statusHtml = '';
    let timeout = 0;

    switch (type) {
        case 'sending':
            statusHtml = '<span class="text-info"><i class="bi bi-arrow-repeat"></i> Sending to TAK...</span>';
            timeout = 0; // No timeout for sending state
            break;

        case 'success':
            statusHtml = `
                <span class="text-success">
                    <i class="bi bi-check-circle"></i>
                    ${message}
                </span>
            `;
            timeout = 10000;
            break;

        case 'error':
            statusHtml = `
                <span class="text-danger">
                    <i class="bi bi-exclamation-circle"></i>
                    ${message}
                </span>
            `;
            timeout = 15000;
            break;

        case 'warning':
            statusHtml = `
                <span class="text-warning">
                    <i class="bi bi-exclamation-triangle"></i>
                    ${message}
                </span>
            `;
            timeout = 5000;
            break;

        case 'polling':
            statusHtml = `
                <span class="text-info">
                    <i class="bi bi-arrow-repeat"></i>
                    ${message}
                </span>
            `;
            timeout = 0; // No timeout for polling state
            break;
    }

    if (takConfig.debug) {
        console.log('[TAK] Status update:', {
            type: type,
            message: message,
            timeout: timeout
        });
    }

    // Update status message
    if (statusMessage) {
        statusMessage.innerHTML = statusHtml;
    }

    // Set timeout to hide status if needed
    if (timeout > 0) {
        window.takStatusTimeout = setTimeout(() => {
            statusContainer.classList.add('opacity-0');
            if (alertElement) {
                setTimeout(() => {
                    alertElement.classList.add('d-none');
                }, 500); // Wait for fade out animation
            }
        }, timeout);
    }
}
