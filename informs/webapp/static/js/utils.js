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

if (typeof window.utilsConfig === 'undefined') {
    window.utilsConfig = {
        alertTimeoutId: null,
        apiDebug: false, // Master debug switch for API calls
    };
}


function showActionAlert(message, type = 'success') {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = [
        `<div class="alert alert-${type} alert-dismissible fade show" role="alert" style="position: fixed; top: 1rem; right: 1rem; z-index: 1056;">`,
        `   <div>${message}</div>`,
        '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
        '</div>'
    ].join('');

    const alertElement = wrapper.firstChild;
    document.body.appendChild(alertElement);

    // Clear previous timeout if it exists
    if (window.utilsConfig.alertTimeoutId) {
        clearTimeout(window.utilsConfig.alertTimeoutId);
    }

    // Set a new timeout to remove the alert
    window.utilsConfig.alertTimeoutId = setTimeout(() => {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alertElement);
        if (bsAlert) {
            bsAlert.close();
        }
    }, 5000);
}

// Global API configuration
if (typeof window.apiConfig === 'undefined') {
    window.apiConfig = {
        debug: false, // Master debug switch for API calls
    };
}

/**
 * A wrapper for the fetch API that adds logging for Azure Maps calls.
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options object for the fetch call.
 * @param {string} apiName - A friendly name for the API being called (for logging).
 * @returns {Promise<Response>} A promise that resolves with the fetch response.
 */
async function fetchWithLogging(url, options = {}, apiName = 'Azure Maps API') {
    if (window.apiConfig.debug) {
        console.log(`[API Call] Preparing to call ${apiName}.`);
        console.log(`[API Call] URL: ${url}`);
    }

    try {
        const response = await fetch(url, options);
        if (window.apiConfig.debug) {
            console.log(`[API Call] Received response from ${apiName}. Status: ${response.status}`);
        }
        return response;
    } catch (error) {
        if (window.apiConfig.debug) {
            console.error(`[API Call] Error calling ${apiName}:`, error);
        }
        // Re-throw the error so the calling function's catch block can handle it.
        throw error;
    }
}
