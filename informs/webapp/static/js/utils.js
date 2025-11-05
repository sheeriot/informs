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
