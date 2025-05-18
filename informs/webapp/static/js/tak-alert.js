/**
 * tak-alert.js - Handles TAK alert functionality for aid requests
 * Version: 0.1.1
 */

const takConfig = {
    debug: false,
    version: '0.1.1',
    pollInterval: 2000,
    maxPollAttempts: 30
};

// Main execution - Start with initialization
document.addEventListener('DOMContentLoaded', () => {
    initializeTakAlert();
    addPulseAnimation();
});

// Initialize TAK Alert functionality
function initializeTakAlert() {
    const takAlertButton = document.getElementById('tak-alert-button');
    const configElement = document.getElementById('aid-request-config');

    // Early exit if button not found
    if (!takAlertButton) return;

    // Get field operation slug from available sources
    let fieldOpSlug = configElement?.dataset.fieldOp || document.body.dataset.fieldOpSlug;

    // Store CSRF token if available
    if (configElement) {
        takConfig.csrfToken = configElement.dataset.csrfToken;
    }

    if (takConfig.debug) {
        console.log('[TAK] Initializing:', {
            version: takConfig.version,
            button: 'found',
            fieldOp: fieldOpSlug || 'not found',
            csrfToken: takConfig.csrfToken ? 'found' : 'not found'
        });
    }

    // Disable button if no field op
    if (!fieldOpSlug) {
        if (takConfig.debug) console.error('[TAK] Field operation slug not found');
        takAlertButton.disabled = true;
        takAlertButton.title = 'Field operation not available';
        return;
    }

    // Store for later use
    takConfig.fieldOpSlug = fieldOpSlug;

    // Attach click handler
    takAlertButton.addEventListener('click', handleTakAlert);
}

// Handle TAK Alert button click - Main action flow
async function handleTakAlert() {
    const takAlertButton = document.getElementById('tak-alert-button');
    const fieldOpSlug = takConfig.fieldOpSlug;
    const aidRequestIds = getVisibleAidRequestIds();

    if (takConfig.debug) {
        console.log('[TAK] Alert triggered:', {
            requestIds: aidRequestIds,
            fieldOp: fieldOpSlug
        });
    }

    // Exit if no aid requests to send
    if (aidRequestIds.length === 0) {
        if (takConfig.debug) console.warn('[TAK] No aid requests to send');
        showStatus('warning', 'No aid requests to send');
        return;
    }

    // Clean up status display
    cleanupStatusDisplay();

    // Update UI to show we're working
    setButtonState(takAlertButton, 'loading');
    showStatus('sending', 'Sending to TAK...');

    try {
        // Send alert to server
        const data = await sendTakAlert(fieldOpSlug, aidRequestIds);

        if (data.sendcot_id) {
            if (takConfig.debug) {
                console.log('[TAK] Task started:', {
                    taskId: data.sendcot_id,
                    fieldOp: fieldOpSlug
                });
            }

            // Start polling for task status
            const result = await pollTaskStatus(data.sendcot_id);

            // Now that polling is complete, update button based on result
            if (result.status === 'SUCCESS') {
                setButtonState(takAlertButton, 'success');
            } else {
                setButtonState(takAlertButton, 'error');
            }

            // Reset button after a delay
            setTimeout(() => resetButton(takAlertButton), 2000);
        } else {
            throw new Error(data.message || 'Failed to send TAK alerts');
        }
    } catch (error) {
        if (takConfig.debug) {
            console.error('[TAK] Alert Error:', {
                error: error.message,
                stack: error.stack
            });
        }

        // Show error state
        setButtonState(takAlertButton, 'error');
        showStatus('error', error.message || 'Error sending alerts');
        setTimeout(() => resetButton(takAlertButton), 3000);
    }
}

// Clean up and prepare the status display
function cleanupStatusDisplay() {
    // First cleanup any duplicate elements that might exist
    cleanupDuplicateStatusElements();

    // Make sure status wrapper exists
    let statusWrapper = document.getElementById('tak-status-wrapper');
    if (!statusWrapper) {
        if (takConfig.debug) console.warn('[TAK] Status wrapper not found, creating one');

        // Find the TAK alert button
        const takAlertButton = document.getElementById('tak-alert-button');
        if (takAlertButton && takAlertButton.parentElement) {
            // Create and insert the wrapper after the button's parent
            statusWrapper = document.createElement('div');
            statusWrapper.id = 'tak-status-wrapper';
            statusWrapper.className = 'd-flex align-items-center ms-2 py-1';

            // Insert after the button parent
            takAlertButton.parentElement.parentElement.appendChild(statusWrapper);
        }
    }

    // Create the status element if it doesn't exist
    let statusElement = document.getElementById('send-cot-status');
    if (!statusElement && statusWrapper) {
        if (takConfig.debug) console.log('[TAK] Creating new status element');
        statusElement = document.createElement('div');
        statusElement.id = 'send-cot-status';
        statusElement.className = 'small text-nowrap rounded px-2 py-1 transition-opacity';
        statusWrapper.appendChild(statusElement);
    }

    // Reset any existing status element
    if (statusElement) {
        delete statusElement.dataset.currentMessage;
        delete statusElement.dataset.currentType;
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
    // Get CSRF token
    let csrfToken = takConfig.csrfToken ||
                   document.querySelector('[name=csrfmiddlewaretoken]')?.value;

    if (takConfig.debug && !csrfToken) {
        console.warn('[TAK] CSRF token not found');
    }

    // Format the request payload based on context
    const requestPayload = (aidRequestIds.length === 1 && document.getElementById('aidrequest_id'))
        ? { aidrequest_id: aidRequestIds[0], mark_type: 'aid' } // Detail view
        : { aidrequests: aidRequestIds, mark_type: 'aid' };    // List view

    if (takConfig.debug) {
        console.log('[TAK] Sending request:', {
            url: `/api/${fieldOpSlug}/send-cot/`,
            payload: requestPayload
        });
    }

    const response = await fetch(`/api/${fieldOpSlug}/send-cot/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'Accept': 'application/json'
        },
        body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
        const errorDetail = await getErrorDetail(response);
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

// Extract error details from response
async function getErrorDetail(response) {
    try {
        const errorData = await response.json();
        return errorData.detail || errorData.message || errorData.error || response.statusText;
    } catch (e) {
        return response.statusText;
    }
}

// Poll for task status
async function pollTaskStatus(taskId) {
    let attempts = 0;
    let lastStatus = null;
    let lastResult = null;
    let polling = false;
    let dotsCount = 0;

    // Set initial polling status
    // We're already showing "Sending to TAK..." from handleTakAlert, no need to update it again
    // showStatus('polling', 'Sending to TAK...');

    // Function to get animated dots
    const getDots = () => '.'.repeat((dotsCount++ % 4) + 1);

    // Promise to allow awaiting the result
    return new Promise(async (resolve) => {
        const poll = async () => {
            // Prevent concurrent polling
            if (polling) return;
            polling = true;

            try {
                if (takConfig.debug) {
                    console.log('[TAK] Starting poll attempt:', {
                        attempt: attempts + 1,
                        taskId: taskId
                    });
                }

                // Update dots animation if in polling state
                updateDotsAnimation();

                // Check task status
                const data = await fetchTaskStatus(taskId);
                const currentStatus = data.status;
                const currentResult = data.result || data.message;

                // Avoid showing too many status changes
                lastStatus = currentStatus;
                lastResult = currentResult;
                polling = false;

                // Handle response based on status
                switch (currentStatus) {
                    case 'SUCCESS':
                        showStatus('success', currentResult || 'Alerts sent successfully');
                        resolve({ status: 'SUCCESS', message: currentResult });
                        return;

                    case 'FAILURE':
                        showStatus('error', currentResult || 'Task failed');
                        resolve({ status: 'FAILURE', message: currentResult });
                        return;

                    case 'PENDING':
                    case 'STARTED':
                        // Use server's message with animated dots, but avoid changing the message completely
                        // Check if current result is similar to "Sending COT to TAK..."
                        const baseMessage = (currentResult && currentResult.includes('Sending')) ?
                            currentResult.split('...')[0] : 'Sending to TAK';

                        showStatus('polling', `${baseMessage}${getDots()}`);

                        if (attempts >= takConfig.maxPollAttempts) {
                            showStatus('warning', 'Task taking longer than expected. Please check status later.');
                            resolve({ status: 'TIMEOUT', message: 'Task taking too long' });
                            return;
                        }

                        attempts++;
                        setTimeout(poll, takConfig.pollInterval);
                        break;

                    default:
                        showStatus('warning', currentResult || `Unknown task status: ${currentStatus}`);
                        resolve({ status: 'UNKNOWN', message: currentResult });
                        return;
                }
            } catch (error) {
                if (takConfig.debug) {
                    console.error('[TAK] Polling Error:', {
                        error: error.message,
                        attempt: attempts + 1
                    });
                }
                showStatus('error', 'Error checking task status');
                polling = false;
                resolve({ status: 'ERROR', message: error.message });
            }
        };

        // Helper to update dots animation
        function updateDotsAnimation() {
            const statusElement = document.getElementById('send-cot-status');
            if (statusElement && statusElement.dataset.currentType === 'polling') {
                const currentText = statusElement.dataset.currentMessage || 'Sending to TAK';
                const baseText = currentText.split('...')[0];
                showStatus('polling', `${baseText}${getDots()}`);
            }
        }

        // Start polling
        await poll();
    });
}

// Fetch task status from server
async function fetchTaskStatus(taskId) {
    const response = await fetch(`/api/${takConfig.fieldOpSlug}/sendcot-checkstatus/?sendcot_id=${taskId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Server Error (${response.status})`);
    }

    const data = await response.json();

    if (takConfig.debug) {
        console.log('[TAK] Poll response:', {
            status: data.status,
            result: data.result || data.message
        });
    }

    return data;
}

// Update the button state
function setButtonState(button, state) {
    // Save original state if not already saved
    if (!button.dataset.originalContent) {
        // Save original HTML and classes, but we'll preserve the text
        button.dataset.originalContent = button.innerHTML;
        button.dataset.originalClasses = button.className;

        // Extract the text part to preserve
        const textSpan = button.querySelector('span:not(.spinner-border)');
        if (textSpan) {
            button.dataset.originalText = textSpan.textContent.trim();
        } else {
            button.dataset.originalText = "Alert TAK";
        }

        // Also save the original icon if present
        const icon = button.querySelector('i');
        if (icon) {
            button.dataset.originalIcon = icon.className;
        }
    }

    const states = {
        loading: {
            disabled: true,
            icon: '<i class="bi bi-broadcast tak-pulse me-1"></i>',  // Use broadcast icon with pulse animation
            class: 'btn-danger'
        },
        success: {
            disabled: true,
            icon: '<i class="bi bi-check-circle-fill me-1"></i>',
            class: 'btn-danger'
        },
        error: {
            disabled: true,
            icon: '<i class="bi bi-exclamation-circle me-1"></i>',
            class: 'btn-danger'
        }
    };

    const newState = states[state];
    if (!newState) return;

    // Apply new state
    button.disabled = newState.disabled;

    // Keep the original button class
    button.className = button.dataset.originalClasses;

    // For loading state, add a subtle opacity
    if (state === 'loading') {
        button.classList.add('opacity-90');
    } else if (state === 'success' || state === 'error') {
        button.classList.add('opacity-85');
    }

    // Replace just the icon, keep the text
    const originalText = button.dataset.originalText || "Alert TAK";
    const innerContent = `
        <span class="d-inline-flex align-items-center justify-content-center">
            ${newState.icon}
            <span>${originalText}</span>
        </span>
    `;
    button.innerHTML = innerContent;
}

// Reset button to initial state
function resetButton(button) {
    button.disabled = false;

    if (button.dataset.originalContent && button.dataset.originalClasses) {
        button.innerHTML = button.dataset.originalContent;
        button.className = button.dataset.originalClasses;
    } else {
        // Fallback to a standard button appearance
        button.innerHTML = '<span class="d-inline-flex align-items-center justify-content-center">' +
                          '<i class="bi bi-bullseye me-1"></i><span>Alert TAK</span></span>';
        button.className = 'btn btn-danger btn-sm mx-1 p-1 px-2';
    }
}

// Display status messages
function showStatus(type, message) {
    if (takConfig.debug) {
        console.log('[TAK] STATUS UPDATE:', {
            type: type,
            message: message
        });
    }

    const sendCotStatus = document.getElementById('send-cot-status');
    if (!sendCotStatus) {
        if (takConfig.debug) console.warn('[TAK] Status container not found');
        return;
    }

    // Skip redundant updates except for polling animation
    if (shouldSkipUpdate(sendCotStatus, type, message)) return;

    // Clear any existing timeouts
    if (window.takStatusTimeout) clearTimeout(window.takStatusTimeout);

    // Get styling for this status type
    const styling = getStatusStyling(type, message);

    // Store current message and type
    sendCotStatus.dataset.currentMessage = message;
    sendCotStatus.dataset.currentType = type;

    // Handle empty message case
    if (!message && type !== 'sending' && type !== 'polling') {
        sendCotStatus.innerHTML = '';
        sendCotStatus.className = 'small text-nowrap rounded';
        return;
    }

    // Apply styling
    applyStatusStyling(sendCotStatus, styling);

    // Handle timeout for success/error messages
    if (styling.timeout > 0) {
        setStatusTimeout(sendCotStatus, styling.timeout);
    }
}

// Determine if status update should be skipped
function shouldSkipUpdate(element, type, message) {
    // Don't update if exactly the same, unless it's a polling dot update
    const isSameMessage = element.dataset.currentMessage === message;
    const isPollingUpdate = type === 'polling' && element.dataset.currentType === 'polling';

    if (isSameMessage && !isPollingUpdate) {
        if (takConfig.debug) console.log('[TAK] Skipping identical status update');
        return true;
    }

    // For polling updates, check if only the dots changed
    if (element.dataset.currentType === 'polling' && type === 'polling') {
        const currentBaseMsg = element.dataset.currentMessage?.split('...')[0];
        const newBaseMsg = message.split('...')[0];

        // Skip if only dots changed in an unwanted way
        if (currentBaseMsg === newBaseMsg &&
            element.dataset.currentMessage?.endsWith(message.slice(-4)) &&
            !message.match(/\.{1,4}$/)) {
            if (takConfig.debug) console.log('[TAK] Skipping redundant polling update');
            return true;
        }
    }

    return false;
}

// Get styling information for status types
function getStatusStyling(type, message) {
    const styles = {
        sending: {
            text: message || 'Sending to TAK...',
            textClass: 'text-dark',
            bgClass: 'bg-warning bg-opacity-25',
            icon: '<i class="bi bi-arrow-repeat me-1"></i>',
            timeout: 0
        },
        success: {
            text: message,
            textClass: 'text-success',
            bgClass: 'bg-success bg-opacity-25',
            icon: '<i class="bi bi-check-circle me-1"></i>',
            timeout: 10000
        },
        error: {
            text: message,
            textClass: 'text-danger',
            bgClass: 'bg-danger bg-opacity-25',
            icon: '<i class="bi bi-exclamation-circle me-1"></i>',
            timeout: 15000
        },
        warning: {
            text: message,
            textClass: 'text-warning',
            bgClass: 'bg-warning bg-opacity-25',
            icon: '<i class="bi bi-exclamation-triangle me-1"></i>',
            timeout: 5000
        },
        polling: {
            text: message,
            textClass: 'text-dark',
            bgClass: 'bg-warning bg-opacity-25',
            icon: '<i class="bi bi-arrow-repeat me-1"></i>',
            timeout: 0
        }
    };

    return styles[type] || styles.warning;
}

// Apply status styling to element
function applyStatusStyling(element, styling) {
    // Set base class
    element.className = 'small text-nowrap rounded px-2 py-1 transition-opacity';

    // Add text class
    element.classList.add(styling.textClass);

    // Add background classes
    styling.bgClass.split(' ').forEach(cls => {
        if (cls) element.classList.add(cls);
    });

    // Set content
    element.innerHTML = `${styling.icon}${styling.text}`;

    if (takConfig.debug) {
        console.log('[TAK] Status element updated:', {
            type: element.dataset.currentType,
            message: styling.text
        });
    }
}

// Set timeout to clear status after delay
function setStatusTimeout(element, delay) {
    window.takStatusTimeout = setTimeout(() => {
        // Fade out
        element.classList.add('opacity-50');

        // Clear after fade
        setTimeout(() => {
            element.innerHTML = '';
            element.className = 'small text-nowrap rounded';
            delete element.dataset.currentMessage;
            delete element.dataset.currentType;

            if (takConfig.debug) {
                console.log('[TAK] Status cleared after timeout');
            }
        }, 500);
    }, delay);
}

// Clean up duplicate status elements
function cleanupDuplicateStatusElements() {
    // First check for the status wrapper
    const statusWrapper = document.getElementById('tak-status-wrapper');
    if (!statusWrapper) return;

    // Look for all text-nowrap elements which might be status indicators
    const statusElements = statusWrapper.querySelectorAll('.text-nowrap, div[id^="send-cot-status"], div[class*="status"]');
    if (statusElements.length <= 1) return;

    // Log if duplicates found
    if (takConfig.debug) {
        console.warn('[TAK] Found multiple status elements, cleaning up', {
            count: statusElements.length
        });
    }

    // Keep only the one with proper ID
    statusElements.forEach(el => {
        if (el.id !== 'send-cot-status') {
            el.remove();
            if (takConfig.debug) console.log('[TAK] Removed duplicate status element:', el.id || 'unnamed');
        }
    });

    // Also look for any legacy status containers
    const legacyContainers = document.querySelectorAll('.sendcot-statuscontainer, #tak-alert-status');
    legacyContainers.forEach(container => {
        if (takConfig.debug) console.log('[TAK] Hiding legacy status container:', container.id || 'unnamed');
        container.classList.add('d-none');  // Hide using Bootstrap
    });
}

// Add the pulse animation CSS if not already present
function addPulseAnimation() {
    if (!document.getElementById('tak-alert-animations')) {
        const style = document.createElement('style');
        style.id = 'tak-alert-animations';
        style.textContent = `
            @keyframes takPulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.05); opacity: 0.9; }
                100% { transform: scale(1); opacity: 1; }
            }
            .tak-pulse {
                animation: takPulse 1.5s ease-in-out infinite;
            }
            .tak-spin {
                animation: spinner-border 1.5s linear infinite;
            }
        `;
        document.head.appendChild(style);

        if (takConfig.debug) {
            console.log('[TAK] Added pulse animation styles');
        }
    }
}
