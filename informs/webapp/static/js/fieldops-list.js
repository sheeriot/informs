// Field Ops List JavaScript
// Handles COT status toggle and TAK alerts for field operations

const fieldOpsConfig = {
    debug: false,
    urls: {
        toggleCot: (fieldOpSlug) => `/api/${fieldOpSlug}/toggle-cot/`,
        sendCot: (fieldOpSlug) => `/api/${fieldOpSlug}/send-cot/`,
        checkStatus: (fieldOpSlug) => `/api/${fieldOpSlug}/sendcot-checkstatus/`
    },
    lastSendcotId: null
};

// Button state templates
const buttonStates = {
    loading: `<div class="d-flex align-items-center">
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <div class="d-flex flex-column"><span>Sending</span><span>Mark...</span></div>
    </div>`,
    success: `<div class="d-flex align-items-center">
        <i class="bi bi-check-circle fs-4 me-2"></i>
        <div class="d-flex flex-column"><span>Mark</span><span>Sent</span></div>
    </div>`,
    error: `<div class="d-flex align-items-center">
        <i class="bi bi-exclamation-circle fs-4 me-2"></i>
        <div class="d-flex flex-column"><span>Send</span><span>Failed</span></div>
    </div>`
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
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));

    // Initialize COT toggle switches
    document.querySelectorAll('.cot-status-toggle').forEach(el => el.addEventListener('change', handleCotToggle));

    // Initialize TAK alert buttons
    document.querySelectorAll('.send-tak-alert').forEach(el => el.addEventListener('click', handleTakAlert));

    // Initialize copy coordinates buttons
    document.querySelectorAll('.copy-coordinates').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const coordinates = button.closest('span.position-relative').querySelector('.coordinates').dataset.coordinates;
            navigator.clipboard.writeText(coordinates).then(() => {
                const icon = button.querySelector('i');
                icon.classList.replace('bi-clipboard', 'bi-clipboard-check');
                setTimeout(() => icon.classList.replace('bi-clipboard-check', 'bi-clipboard'), 2000);
            });
        });
    });

    if (fieldOpsConfig.debug) console.log('Field Ops List initialized');
}

// Helper: Get row by field op slug
function getRowBySlug(fieldOpSlug) {
    return document.querySelector(`tr[data-field-op-slug="${fieldOpSlug}"]`);
}

// Helper: Toggle button group visibility
function setButtonGroupVisibility(row, visible) {
    const buttonGroup = row.querySelector('.btn-group');
    if (buttonGroup) {
        buttonGroup.classList.toggle('d-none', !visible);
        buttonGroup.querySelectorAll('.send-tak-alert').forEach(btn => btn.disabled = !visible);
    }
}

// Helper: Reset button to original state
function resetButton(button, originalContent, originalClass, allButtons, delay) {
    setTimeout(() => {
        button.innerHTML = originalContent;
        button.className = button.className.replace(/btn-outline-\w+/g, '').trim();
        button.classList.add(originalClass);
        allButtons.forEach(btn => btn.disabled = false);
    }, delay);
}

async function handleCotToggle(event) {
    const switchInput = event.currentTarget;
    const fieldOpSlug = switchInput.dataset.fieldOpSlug;
    const currentStatus = switchInput.dataset.currentStatus;
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';

    try {
        const requestBody = { field_op_slug: fieldOpSlug, disable_cot: newStatus === 'disabled' };
        if (fieldOpsConfig.debug) console.log('Sending request with body:', requestBody);

        const response = await fetch(fieldOpsConfig.urls.toggleCot(fieldOpSlug), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        if (data.status === 'success') {
            updateCotSwitchState(switchInput, newStatus);
        } else {
            // Let the catch block handle reverting the switch state
            throw new Error(data.message || `Failed to toggle COT status: ${data.status}`);
        }
    } catch (error) {
        if (fieldOpsConfig.debug) {
            console.error('Error in COT toggle operation:', { error: error.message, fieldOpSlug, currentStatus, newStatus });
        }
        alert(`Failed to toggle COT status: ${error.message}`);
        switchInput.checked = currentStatus === 'active';
    }
}

function showStatusMessage(row, message, type = 'info', duration = 15000) {
    const container = row.querySelector('.tak-message-status');
    const alert = container.querySelector('.alert');
    const messageEl = container.querySelector('.status-message');

    messageEl.textContent = message;
    alert.className = `alert alert-${type} py-1 px-2 mb-0 small shadow-sm`;
    alert.classList.remove('d-none');

    setTimeout(() => {
        container.classList.remove('opacity-0');
        container.classList.add('opacity-100', 'show');
    }, 10);

    if (container.fadeTimeout) clearTimeout(container.fadeTimeout);

    if (duration > 0) {
        container.fadeTimeout = setTimeout(() => {
            container.classList.remove('opacity-100', 'show');
            container.classList.add('opacity-0');
            setTimeout(() => alert.classList.add('d-none'), 500);
        }, duration);
    }
}

async function handleTakAlert(event) {
    const button = event.currentTarget;
    const fieldOpSlug = button.dataset.fieldOpSlug;
    const markType = button.dataset.markType;
    const row = button.closest('tr');
    const originalClass = button.classList.contains('btn-success') ? 'btn-success' : 'btn-danger';
    const originalContent = button.innerHTML;

    const buttonGroup = button.closest('.btn-group');
    const allButtons = buttonGroup.querySelectorAll('.send-tak-alert');
    allButtons.forEach(btn => btn.disabled = true);

    button.innerHTML = buttonStates.loading;
    showStatusMessage(row, `Sending ${markType} mark to TAK...`, 'info', 0);

    try {
        const response = await fetch(fieldOpsConfig.urls.sendCot(fieldOpSlug), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ field_op_slug: fieldOpSlug, mark_type: markType })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}. ${errorText}`);
        }

        const data = await response.json();

        if (data.status === 'success') {
            fieldOpsConfig.lastSendcotId = data.sendcot_id;

            button.innerHTML = buttonStates.success;
            button.classList.remove('btn-success', 'btn-danger');
            button.classList.add('btn-outline-success');

            const capitalizedType = markType.charAt(0).toUpperCase() + markType.slice(1);
            showStatusMessage(row, `${capitalizedType} mark sent successfully. Checking connection...`, 'success', 0);

            try {
                const statusData = await checkConnectionStatus(fieldOpSlug);
                if (fieldOpsConfig.debug) console.log('Connection status check complete:', statusData);
            } catch (statusError) {
                showStatusMessage(row, `Mark sent, but error checking connection: ${statusError.message}`, 'warning');
            }

            resetButton(button, originalContent, originalClass, allButtons, 2000);
        } else {
            throw new Error(data.message || `Failed to send ${markType} mark`);
        }
    } catch (error) {
        if (fieldOpsConfig.debug) {
            console.error('Error in TAK alert operation:', { error: error.message, fieldOpSlug, markType });
        }

        button.innerHTML = buttonStates.error;
        button.classList.remove('btn-success', 'btn-danger', 'btn-outline-success');
        button.classList.add('btn-outline-danger');

        showStatusMessage(row, `Failed to send ${markType} mark: ${error.message}`, 'danger');
        resetButton(button, originalContent, originalClass, allButtons, 3000);
    }
}

async function checkConnectionStatus(fieldOpSlug) {
    const maxPolls = 5;
    let pollCount = 0;
    const row = getRowBySlug(fieldOpSlug);

    showStatusMessage(row, "Checking TAK server connection status...", "info", 0);

    while (pollCount < maxPolls) {
        pollCount++;

        try {
            const response = await fetch(`${fieldOpsConfig.urls.checkStatus(fieldOpSlug)}?sendcot_id=${fieldOpsConfig.lastSendcotId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();
            if (fieldOpsConfig.debug) console.log('Status check response:', data);

            if (data.status === "PENDING") {
                showStatusMessage(row, data.message || "Checking connection status...", "info", 0);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            if (data.status === "SUCCESS") {
                let message = data.result || "TAK server connection successful";
                let messageType = "success";

                if (data.stats) {
                    const parts = [];
                    if (data.stats.field_marks > 0) parts.push(`${data.stats.field_marks} field marker${data.stats.field_marks > 1 ? 's' : ''}`);
                    if (data.stats.aid_marks > 0) parts.push(`${data.stats.aid_marks} aid marker${data.stats.aid_marks > 1 ? 's' : ''}`);
                    if (parts.length) message = `TAK connection successful (${parts.join(', ')})`;
                }

                if (data.port_status === "open") {
                    message = "Warning: TAK server connection port still open";
                    messageType = "warning";
                }

                showStatusMessage(row, message, messageType);
                return data;
            }

            if (data.status === "FAILURE") {
                showStatusMessage(row, `Error: ${data.result || "Connection failed"}`, "danger");
                return data;
            }

            showStatusMessage(row, `Unknown status: ${data.status}`, "warning");
            return data;

        } catch (error) {
            if (fieldOpsConfig.debug) console.error('Error checking connection status:', error);
            showStatusMessage(row, `Error checking status: ${error.message}`, "danger");
            return null;
        }
    }

    showStatusMessage(row, "Status check timed out after multiple attempts", "warning");
    return null;
}

function updateCotSwitchState(switchInput, newStatus) {
    const isActive = newStatus === 'active';

    switchInput.dataset.currentStatus = newStatus;
    switchInput.checked = isActive;
    switchInput.blur();

    const statusText = switchInput.nextElementSibling.querySelector('.status-text');
    statusText.textContent = isActive ? 'Active' : 'Disabled';
    statusText.classList.remove('text-success', 'text-danger');
    statusText.classList.add(isActive ? 'text-success' : 'text-danger');

    setButtonGroupVisibility(switchInput.closest('tr'), isActive);
}
