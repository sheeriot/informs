// Field Ops List JavaScript
// Handles COT status toggle and TAK alerts for field operations

const fieldOpsConfig = {
    debug: true,
    urls: {
        toggleCot: (fieldOpSlug) => `/api/${fieldOpSlug}/toggle-cot/`,
        sendCot: (fieldOpSlug) => `/api/${fieldOpSlug}/send-cot/`,
        checkStatus: (fieldOpSlug) => `/api/${fieldOpSlug}/sendcot-checkstatus/`
    },
    statusTimeout: null
};

// Main execution
document.addEventListener('DOMContentLoaded', function() {
    if (fieldOpsConfig.debug) console.log('Initializing Field Ops List JS');
    initializeFieldOpsList();

    // Initialize map if data is available
    const fieldOpsDataElement = document.getElementById('field-ops-data');
    if (fieldOpsDataElement) {
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
    const newStatus = currentStatus === 'disabled' ? 'active' : 'disabled';

    if (fieldOpsConfig.debug) {
        console.log('COT Toggle Request:', {
            fieldOpSlug,
            currentStatus,
            newStatus,
            switchElement: switchInput,
            requestUrl: fieldOpsConfig.urls.toggleCot(fieldOpSlug)
        });
    }

    try {
        const requestBody = {
            field_op_slug: fieldOpSlug,
            disable_cot: newStatus === 'disabled'
        };

        if (fieldOpsConfig.debug) {
            console.log('Sending request with body:', requestBody);
        }

        const response = await fetch(fieldOpsConfig.urls.toggleCot(fieldOpSlug), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify(requestBody)
        });

        if (fieldOpsConfig.debug) {
            console.log('Server response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        if (fieldOpsConfig.debug) {
            console.log('Response data:', data);
        }

        if (data.status === 'success') {
            if (fieldOpsConfig.debug) {
                console.log('Successfully toggled COT status:', {
                    fieldOpSlug,
                    newStatus,
                    response: data
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

function updateStatusMessage(message, type = 'info', duration = 0) {
    const statusArea = document.getElementById('fieldOpsStatus');
    if (!statusArea) return;

    // Clear any existing timeout
    if (fieldOpsConfig.statusTimeout) {
        clearTimeout(fieldOpsConfig.statusTimeout);
        fieldOpsConfig.statusTimeout = null;
    }

    // Clear existing content
    statusArea.innerHTML = '';

    if (message) {
        // Create status message element
        const statusElement = document.createElement('div');
        statusElement.className = `d-flex align-items-center alert alert-${type} py-1 px-2 mb-0`;

        // Add appropriate icon based on type
        let icon = 'info-circle';
        switch (type) {
            case 'success':
                icon = 'check-circle';
                break;
            case 'danger':
                icon = 'exclamation-circle';
                break;
            case 'warning':
                icon = 'exclamation-triangle';
                break;
        }

        statusElement.innerHTML = `
            <i class="bi bi-${icon} me-2"></i>
            <span>${message}</span>
        `;

        statusArea.appendChild(statusElement);

        // If duration is specified, clear after timeout
        if (duration > 0) {
            fieldOpsConfig.statusTimeout = setTimeout(() => {
                statusArea.innerHTML = '';
            }, duration);
        }
    }
}

async function handleTakAlert(event) {
    const button = event.currentTarget;
    const fieldOpSlug = button.dataset.fieldOpSlug;
    const markType = button.dataset.markType;

    if (fieldOpsConfig.debug) {
        console.log(`Sending ${markType} TAK alert for ${fieldOpSlug}`, {
            button,
            requestUrl: fieldOpsConfig.urls.sendCot(fieldOpSlug)
        });
    }

    // Store original button content
    const originalContent = button.innerHTML;

    // Show loading state
    button.innerHTML = `
        <div class="d-flex align-items-center">
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            <div class="d-flex flex-column">
                <span>Sending</span>
                <span>Mark...</span>
            </div>
        </div>
    `;
    button.disabled = true;

    // Update status area
    updateStatusMessage(`Sending ${markType} mark to TAK for ${fieldOpSlug}...`, 'info');

    try {
        const response = await fetch(fieldOpsConfig.urls.sendCot(fieldOpSlug), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                field_op_slug: fieldOpSlug,
                mark_type: markType
            })
        });

        if (fieldOpsConfig.debug) {
            console.log('Server response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        if (fieldOpsConfig.debug) {
            console.log('Response data:', data);
        }

        if (data.status === 'success') {
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
            button.classList.add(markType === 'FieldOp' ? 'btn-success' : 'btn-danger');

            // Update status message
            updateStatusMessage(`Successfully sent ${markType} mark to TAK for ${fieldOpSlug}`, 'success', 3000);

            // Check connection status after successful send
            const statusData = await checkConnectionStatus(fieldOpSlug);

            if (statusData?.port_status === 'open') {
                updateStatusMessage(`Warning: TAK server connection port still open for ${fieldOpSlug}`, 'warning');
            }

            // Reset button after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.disabled = false;
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
        button.classList.remove('btn-success', 'btn-danger');
        button.classList.add('btn-outline-secondary');

        // Update status message with error
        updateStatusMessage(`Failed to send ${markType} mark for ${fieldOpSlug}: ${error.message}`, 'danger', 5000);

        // Reset button after 3 seconds
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.disabled = false;
            button.classList.remove('btn-outline-secondary');
            button.classList.add(markType === 'FieldOp' ? 'btn-success' : 'btn-danger');
        }, 3000);
    }
}

async function checkConnectionStatus(fieldOpSlug) {
    try {
        if (fieldOpsConfig.debug) {
            console.log('Checking connection status for:', fieldOpSlug);
        }

        const response = await fetch(fieldOpsConfig.urls.checkStatus(fieldOpSlug), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (fieldOpsConfig.debug) {
            console.log('Connection status:', data);
        }

        // Here we can handle any connection status information
        // For example, if the server reports that the port is still open
        if (data.port_status === 'open') {
            console.warn('TCP port still open after sending mark');
        }

        return data;
    } catch (error) {
        if (fieldOpsConfig.debug) {
            console.error('Error checking connection status:', error);
        }
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
    }

    if (fieldOpsConfig.debug) {
        console.log('Updated COT switch state:', {
            fieldOpSlug: switchInput.dataset.fieldOpSlug,
            newStatus,
            buttonGroupHidden: buttonGroup?.classList.contains('d-none')
        });
    }
}

function updateTakAlertButtons(fieldOpSlug, disabled) {
    const row = document.querySelector(`tr[data-field-op-slug="${fieldOpSlug}"]`);
    const takAlertButtons = row.querySelectorAll('.send-tak-alert');
    takAlertButtons.forEach(button => {
        button.disabled = disabled;
    });
}

function getCsrfToken() {
    const csrfInput = document.querySelector('[name="csrfmiddlewaretoken"]');
    if (!csrfInput) {
        throw new Error('CSRF token not found');
    }
    return csrfInput.value;
}
