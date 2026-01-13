// Field Ops List JavaScript
// Handles COT status toggle and TAK alerts for field operations

const fieldOpsConfig = {
    debug: false,
    urls: {
        toggleCot: (fieldOpSlug) => `/api/${fieldOpSlug}/toggle-cot/`,
        sendCot: (fieldOpSlug) => `/api/${fieldOpSlug}/send-cot/`,
        checkStatus: (fieldOpSlug) => `/api/${fieldOpSlug}/sendcot-checkstatus/`
    },
    statusTimeout: null,
    lastSendcotId: null
};

// Main execution
document.addEventListener('DOMContentLoaded', function() {
    initializeFieldOpsList();

    // Initialize map if data is available
    const fieldOpsDataElement = document.getElementById('field-ops-data');
    const mapElement = document.getElementById('fieldops-map');
    if (fieldOpsDataElement && mapElement) {
        const fieldOpsData = JSON.parse(fieldOpsDataElement.textContent);
        initFieldOpsMap(fieldOpsData);
    }
});

function initializeFieldOpsList() {
    // Initialize tooltips
    const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltips.forEach(tooltip => new bootstrap.Tooltip(tooltip));

    // Initialize COT toggle switches
    const cotToggleSwitches = document.querySelectorAll('.cot-status-toggle');
    cotToggleSwitches.forEach(toggleSwitch => {
        toggleSwitch.addEventListener('change', handleCotToggle);
    });

    // Initialize TAK alert buttons
    const takAlertButtons = document.querySelectorAll('.send-tak-alert');
    takAlertButtons.forEach(button => {
        button.addEventListener('click', handleTakAlert);
    });

    // Initialize copy coordinates buttons
    const copyButtons = document.querySelectorAll('.copy-coordinates');
    copyButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const coordinates = button.closest('span.position-relative').querySelector('.coordinates').dataset.coordinates;
            navigator.clipboard.writeText(coordinates).then(() => {
                const icon = button.querySelector('i');
                icon.classList.remove('bi-clipboard');
                icon.classList.add('bi-clipboard-check');
                setTimeout(() => {
                    icon.classList.remove('bi-clipboard-check');
                    icon.classList.add('bi-clipboard');
                }, 2000);
            });
        });
    });

    if (fieldOpsConfig.debug) console.log('Field Ops List initialized');
}

async function handleCotToggle(event) {
    const switchInput = event.currentTarget;
    const fieldOpSlug = switchInput.dataset.fieldOpSlug;
    const currentStatus = switchInput.dataset.currentStatus;
    try {
        const requestBody = {
            field_op_slug: fieldOpSlug,
            disable_cot: newStatus === 'disabled'
        };
            console.log('Sending request with body:', requestBody);
        }

        const response = await fetch(fieldOpsConfig.urls.toggleCot(fieldOpSlug), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify(requestBody)
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        if (data.status === 'success') {
                });
            }
            updateCotSwitchState(switchInput, newStatus);
            updateTakAlertButtons(fieldOpSlug, newStatus === 'disabled');
        } else {
            // Revert the switch if the server update failed
            switchInput.checked = newStatus === 'active';
            throw new Error(data.message || `Failed to toggle COT status: ${data.status}`);
        }
    } catch (error) {
        if (fieldOpsConfig.debug) {
            console.error('Error in COT toggle operation:', {
                error: error.message,
                stack: error.stack,
                fieldOpSlug,
                currentStatus,
                newStatus
            });
        }
        alert(`Failed to toggle COT status: ${error.message}`);
        // Revert the switch state
        switchInput.checked = currentStatus === 'active';
    }
}

function showStatusMessage(row, message, type = 'info', duration = 15000) {
    const container = row.querySelector('.tak-message-status');
    const alert = container.querySelector('.alert');
    const messageEl = container.querySelector('.status-message');

    // Set message and type
    messageEl.textContent = message;

    // Update alert classes for the proper style
    alert.className = `alert alert-${type} py-1 px-2 mb-0 small shadow-sm`;

    // Display the alert before any other changes to avoid layout shifts
    alert.classList.remove('d-none');

    // Wait a tiny bit for the alert to be in the DOM to avoid frame jump
    setTimeout(() => {
        // Make container visible with Bootstrap opacity classes
        container.classList.remove('opacity-0');
        container.classList.add('opacity-100', 'show');
    }, 10);

    // Clear any existing timeout
    if (container.fadeTimeout) {
        clearTimeout(container.fadeTimeout);
    }

    // Set timeout to fade out if duration > 0
    if (duration > 0) {
        container.fadeTimeout = setTimeout(() => {
            // Start fade out using Bootstrap opacity classes
            container.classList.remove('opacity-100', 'show');
            container.classList.add('opacity-0');

            // After fade completes, hide alert
            setTimeout(() => {
                alert.classList.add('d-none');
            }, 500); // Wait for fade out animation
        });
    }
}

async function handleTakAlert(event) {
    const button = event.currentTarget;
    const fieldOpSlug = button.dataset.fieldOpSlug;
    const markType = button.dataset.markType;
    const row = button.closest('tr');
    }

    // Store original button content
    const originalContent = button.innerHTML;

    // Disable both buttons to prevent multiple sends while one is in progress
    const buttonGroup = button.closest('.btn-group');
    const allButtons = buttonGroup.querySelectorAll('.send-tak-alert');
    allButtons.forEach(btn => btn.disabled = true);

    // Show loading state on clicked button
    button.innerHTML = `
        <div class="d-flex align-items-center">
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            <div class="d-flex flex-column">
                <span>Sending</span>
                <span>Mark...</span>
            </div>
        </div>
    `;

    // Update status message
    showStatusMessage(row, `Sending ${markType} mark to TAK...`, 'info', 0);

    try {
        const response = await fetch(fieldOpsConfig.urls.sendCot(fieldOpSlug), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                field_op_slug: fieldOpSlug,
                mark_type: markType
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}. ${errorText}`);
        }

        const data = await response.json();

        if (data.status === 'success') {
            // Store the sendcot_id for status checks
            fieldOpsConfig.lastSendcotId = data.sendcot_id;

            // Show success state briefly
            button.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-check-circle fs-4 me-2"></i>
                    <div class="d-flex flex-column">
                        <span>Mark</span>
                        <span>Sent</span>
                    </div>
                </div>
            `;
            button.classList.remove('btn-success', 'btn-danger');
            button.classList.add('btn-outline-success');

            // Update success message
            showStatusMessage(row, `${markType.charAt(0).toUpperCase() + markType.slice(1)} mark sent successfully. Checking connection...`, 'success', 0);

            // Check connection status after successful send
            try {
                const statusData = await checkConnectionStatus(fieldOpSlug);
                    console.log('Connection status check complete:', statusData);
                }
            } catch (statusError) {
                showStatusMessage(row, `Mark sent, but error checking connection: ${statusError.message}`, 'warning');
                console.error('Error checking connection status:', statusError);
            }

            // Reset button after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.classList.remove('btn-outline-success');
                button.classList.add(originalButtonClass);

                // Re-enable all buttons
                allButtons.forEach(btn => btn.disabled = false);
            }, 2000);
        } else {
            throw new Error(data.message || `Failed to send ${markType} mark`);
        }
    } catch (error) {
        if (fieldOpsConfig.debug) {
            console.error('Error in TAK alert operation:', {
                error: error.message,
                stack: error.stack,
                fieldOpSlug,
                markType
            });
        }
        // Show error state
        button.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="bi bi-exclamation-circle fs-4 me-2"></i>
                <div class="d-flex flex-column">
                    <span>Send</span>
                    <span>Failed</span>
                </div>
            </div>
        `;
        button.classList.remove('btn-success', 'btn-danger', 'btn-outline-success');
        button.classList.add('btn-outline-danger');

        // Update status message with error
        showStatusMessage(row, `Failed to send ${markType} mark: ${error.message}`, 'danger');

        // Reset button after 3 seconds
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.classList.remove('btn-outline-danger');
            button.classList.add(originalButtonClass);

            // Re-enable all buttons
            allButtons.forEach(btn => btn.disabled = false);
        }, 3000);
    }
}
    }

    try {
        // Start polling
        let keepPolling = true;
        let finalData = null;
        let pollCount = 0;
        const maxPolls = 5; // Maximum number of polls before giving up

        const row = document.querySelector(`tr[data-field-op-slug="${fieldOpSlug}"]`);

        // Show initial status as we begin checking
        showStatusMessage(row, "Checking TAK server connection status...", "info", 0);

        while (keepPolling && pollCount < maxPolls) {
            pollCount++;

            const response = await fetch(`${fieldOpsConfig.urls.checkStatus(fieldOpSlug)}?sendcot_id=${fieldOpsConfig.lastSendcotId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            }

            // Update UI based on status
            if (data.status === "PENDING") {
                // Still waiting for results
                showStatusMessage(row, data.message || "Checking connection status...", "info", 0);
                // Wait before next poll
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            } else if (data.status === "SUCCESS") {
                // Connection succeeded
                let messageType = "success";
                let message = data.result || "TAK server connection successful";

                // Add statistics if available
                if (data.stats) {
                    const stats = data.stats;
                    let statsText = "";

                    // Only include field markers if any were sent
                    if (stats.field_marks > 0) {
                        statsText += `${stats.field_marks} field marker${stats.field_marks > 1 ? 's' : ''}`;
                    }

                    // Only include aid markers if any were sent
                    if (stats.aid_marks > 0) {
                        if (statsText) {
                            statsText += ", ";
                        }
                        statsText += `${stats.aid_marks} aid marker${stats.aid_marks > 1 ? 's' : ''}`;
                    }

                    // Only add the stat text if we have any markers
                    if (statsText) {
                        message = `TAK connection successful (${statsText})`;
                    }
                }

                // Check for port still being open
                if (data.port_status === "open") {
                    message = "Warning: TAK server connection port still open";
                    messageType = "warning";
                }

                showStatusMessage(row, message, messageType);
                keepPolling = false;
            } else if (data.status === "FAILURE") {
                // Connection failed
                showStatusMessage(row, `Error: ${data.result || "Connection failed"}`, "danger");
                keepPolling = false;
            } else {
                // Unknown status
                showStatusMessage(row, `Unknown status: ${data.status}`, "warning");
                keepPolling = false;
            }
        }

        // If we hit the poll limit, show a timeout message
        if (pollCount >= maxPolls && keepPolling) {
            showStatusMessage(row, "Status check timed out after multiple attempts", "warning");
        }

        return finalData;
    } catch (error) {
        if (fieldOpsConfig.debug) {
            console.error('Error checking connection status:', error);
        }
        const row = document.querySelector(`tr[data-field-op-slug="${fieldOpSlug}"]`);
        showStatusMessage(row, `Error checking status: ${error.message}`, "danger");
        return null;
    }
}

function updateCotSwitchState(switchInput, newStatus) {
    // Update switch state
    switchInput.dataset.currentStatus = newStatus;
    switchInput.checked = newStatus === 'active';

    // Remove focus to prevent blue highlight
    switchInput.blur();

    // Update status text
    const label = switchInput.nextElementSibling;
    const statusText = label.querySelector('.status-text');

    statusText.textContent = newStatus === 'disabled' ? 'Disabled' : 'Active';
    statusText.classList.remove('text-success', 'text-danger');
    statusText.classList.add(newStatus === 'disabled' ? 'text-danger' : 'text-success');

    // Update TAK Alerts visibility
    const row = switchInput.closest('tr');
    const buttonGroup = row.querySelector('.btn-group');

    if (buttonGroup) {
        if (newStatus === 'disabled') {
            buttonGroup.classList.add('d-none');
        } else {
            buttonGroup.classList.remove('d-none');
        }

        // Update button disabled states
        const buttons = buttonGroup.querySelectorAll('.send-tak-alert');
        buttons.forEach(button => {
            button.disabled = newStatus === 'disabled';
        });
        });
    }
}

function updateTakAlertButtons(fieldOpSlug, disabled) {
    const row = document.querySelector(`tr[data-field-op-slug="${fieldOpSlug}"]`);
    const takAlertButtons = row.querySelectorAll('.send-tak-alert');
    takAlertButtons.forEach(button => {
        button.disabled = disabled;
    });

    // Also update the button group visibility
    const buttonGroup = row.querySelector('.btn-group');
    if (buttonGroup) {
        if (disabled) {
            buttonGroup.classList.add('d-none');
        } else {
            buttonGroup.classList.remove('d-none');
        }
    }
}

