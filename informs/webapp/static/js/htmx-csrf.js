/**
 * htmx-csrf.js
 * Configure HTMX to include CSRF token in all requests.
 * Requires getCookie() from informs-utils.js to be loaded before this file.
 */

(function() {
    'use strict';

    /**
     * Configure HTMX to include CSRF token in all requests
     * Also add X-Requested-With header so Django recognizes HTMX requests as AJAX
     */
    document.body.addEventListener('htmx:configRequest', function(event) {
        const csrfToken = getCookie('csrftoken');
        if (csrfToken) {
            event.detail.headers['X-CSRFToken'] = csrfToken;
        }
        // Add X-Requested-With header so Django's @login_required returns 401 instead of redirecting
        event.detail.headers['X-Requested-With'] = 'XMLHttpRequest';
    });

    /**
     * Handle HTMX response errors, especially authentication errors
     * This prevents infinite polling when session expires
     */
    document.body.addEventListener('htmx:responseError', function(event) {
        const status = event.detail.xhr.status;
        const target = event.detail.target;

        // Handle authentication/authorization errors (400, 401, 403)
        // Also handle redirects (302) which indicate login required
        if (status === 400 || status === 401 || status === 403 || status === 302) {
            // Stop polling on elements that have periodic triggers
            if (target && target.hasAttribute('hx-trigger')) {
                const trigger = target.getAttribute('hx-trigger');
                // If trigger includes "every", stop it
                if (trigger && trigger.includes('every')) {
                    target.setAttribute('hx-trigger', 'none');
                    // Show error message if target is empty or shows loading state
                    if (!target.innerHTML || target.innerHTML.includes('Loading') || target.innerHTML.includes('hourglass')) {
                        target.innerHTML = '<span class="badge bg-warning text-dark" title="Session expired - please refresh the page"><i class="bi bi-exclamation-triangle me-1"></i>Auth Error</span>';
                    }
                }
            }
        }
    });

})();
