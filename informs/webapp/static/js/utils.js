function copyCoordinates(buttonElement) {
    const textToCopy = buttonElement.dataset.copyText;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalIcon = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="bi bi-check-lg text-success"></i>'; // Success icon
        setTimeout(() => {
            buttonElement.innerHTML = originalIcon;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

let alertTimeoutId;

function showActionAlert(message, type = 'warning') {
    const container = document.getElementById('action-alert-container');
    if (!container) return;

    // Clear any existing timeout to prevent race conditions
    if (alertTimeoutId) {
        clearTimeout(alertTimeoutId);
    }

    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    container.innerHTML = alertHtml;

    alertTimeoutId = setTimeout(() => {
        const alertElement = container.querySelector('.alert');
        if (alertElement) {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alertElement);
            if (bsAlert) {
                bsAlert.close();
            }
        }
    }, 3000);
}

const apiConfig = {
    debug: true, // Master debug switch for API calls
};

/**
 * A wrapper for the fetch API that adds logging for Azure Maps calls.
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options object for the fetch call.
 * @param {string} apiName - A friendly name for the API being called (for logging).
 * @returns {Promise<Response>} A promise that resolves with the fetch response.
 */
async function fetchWithLogging(url, options = {}, apiName = 'Azure Maps API') {
    if (apiConfig.debug) {
        console.log(`[API Call] Preparing to call ${apiName}.`);
        console.log(`[API Call] URL: ${url}`);
    }

    try {
        const response = await fetch(url, options);
        if (apiConfig.debug) {
            console.log(`[API Call] Received response from ${apiName}. Status: ${response.status}`);
        }
        return response;
    } catch (error) {
        if (apiConfig.debug) {
            console.error(`[API Call] Error calling ${apiName}:`, error);
        }
        // Re-throw the error so the calling function's catch block can handle it.
        throw error;
    }
}
