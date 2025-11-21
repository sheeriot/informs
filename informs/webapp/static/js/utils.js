const utilsScriptConfig = {
    debug: false // Master debug switch for this script
};

/**
 * A wrapper around the native fetch API that provides consistent logging
 * and automatically includes the CSRF token for POST/PUT/DELETE requests.
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options object for the fetch call.
 * @param {string} requestName - A human-readable name for the request, used for logging.
 * @returns {Promise<Response>} A Promise that resolves to the Response object.
 */
async function fetchWithLogging(url, options = {}, requestName = 'Unnamed Request') {
    if (utilsScriptConfig.debug) {
        console.log(`[Fetch] Starting '${requestName}':`, { url, options });
    }

    // Automatically add CSRF token for methods that require it
    const method = options.method ? options.method.toUpperCase() : 'GET';
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        options.headers = {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            ...options.headers,
        };
    }

    try {
        const response = await fetch(url, options);
        if (utilsScriptConfig.debug) {
            console.log(`[Fetch] Completed '${requestName}':`, { status: response.status, ok: response.ok });
        }
        if (!response.ok) {
            console.error(`[Fetch] Network response for '${requestName}' was not ok. Status: ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error(`[Fetch] There was a problem with the '${requestName}' fetch operation:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * Gets a cookie value by name.
 * @param {string} name - The name of the cookie to retrieve.
 * @returns {string|null} The cookie value or null if not found.
 */
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function copyCoords(elementOrId) {
    if (!elementOrId) return;

    let textToCopy;
    let isLegacyId = typeof elementOrId === 'string';

    if (isLegacyId) {
        // Legacy mode: argument is an ID string of the element containing the text.
        const textElement = document.getElementById(elementOrId);
        if (textElement) {
            textToCopy = textElement.innerText;
        }
    } else {
        // Modern mode: argument is the button element itself.
        textToCopy = elementOrId.dataset.copyText;
    }

    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                showActionAlert(`Copied: ${textToCopy}`, 'success');
            })
            .catch(err => {
                console.error('Failed to copy coordinates: ', err);
                showActionAlert('Failed to copy coordinates.', 'danger');
            });
    } else {
        console.error('Could not find text to copy for element/ID:', elementOrId);
        showActionAlert('Nothing to copy.', 'warning');
    }
}

/**
 * Displays a dismissible alert at the top of the page.
 * @param {string} message - The message to display in the alert.
 * @param {string} type - The Bootstrap alert type (e.g., 'success', 'danger', 'warning').
 */
function showActionAlert(message, type = 'success') {
    const container = document.getElementById('action-alert-container');
    if (!container) {
        console.error('Alert container not found.');
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
