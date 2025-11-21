document.addEventListener('DOMContentLoaded', function () {
    const scriptConfig = {
        debug: true // Set to false in production
    };

    let statusClearTimer = null; // Variable to hold the timer ID

    if (scriptConfig.debug) {
        console.log("tak-alert-htmx.js loaded and debug mode is on.");
        // htmx.logAll();
    }

    document.body.addEventListener('htmx:configRequest', function(evt) {
        // Add CSRF token to all POST requests
        if (evt.detail.verb === 'post') {
            evt.detail.headers['X-CSRFToken'] = getCookie('csrftoken');
        }

        // If the request is from the TAK alert button, handle visibility and dynamic parameters
        if (evt.detail.elt.id === 'htmx-tak-alert-button') {
             if (scriptConfig.debug) {
                console.log('[TAK Alert] Intercepted HTMX request from TAK button.', evt.detail);
                console.log('[TAK Alert] Parameters before modification:', JSON.parse(JSON.stringify(evt.detail.parameters)));
            }
            // Clear any pending timeout to hide the status, so the new status isn't hidden prematurely
            if (statusClearTimer) {
                clearTimeout(statusClearTimer);
                if (scriptConfig.debug) {
                    console.log('Cleared previous status-hide timer.');
                }
            }

            // Ensure the target container is visible before the request
            const targetId = evt.detail.elt.getAttribute('hx-target');
            if (targetId) {
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.classList.remove('d-none');
                }
            }

            const action = evt.detail.elt.dataset.action;

            // If it's the list view, get visible aid request IDs
            if (action === 'aid_request_list') {
                const aidRequestIds = getVisibleAidRequestIds();
                // Add the IDs to the parameters that will be sent
                evt.detail.parameters['aidrequests'] = JSON.stringify(aidRequestIds);
                 if (scriptConfig.debug) {
                    console.log('[TAK Alert] Added aidrequests to parameters:', evt.detail.parameters);
                }
            }
        }
    });

    // Listen for our custom event from the server to clear the status message
    document.body.addEventListener('takStatusFinal', function(evt) {
        if (scriptConfig.debug) {
            console.log('Caught "takStatusFinal" event:', evt);
        }
        const statusElement = document.getElementById('send-cot-status');
        if (scriptConfig.debug) {
            console.log('Found status element:', statusElement);
        }

        if (statusElement) {
            if (scriptConfig.debug) {
                console.log('Setting 10-second timer to hide status element.');
            }
            // Store the timer ID so we can clear it if needed
            statusClearTimer = setTimeout(function() {
                if (scriptConfig.debug) {
                    console.log('Timer finished. Hiding status element now.');
                }
                statusElement.classList.add('d-none');
            }, 10000); // 10 seconds
        }
    });

    function getVisibleAidRequestIds() {
        const tableBody = document.querySelector('#aid-request-list-body');
        if (!tableBody) return [];

        return Array.from(tableBody.getElementsByTagName('tr'))
            .filter(row => !row.classList.contains('d-none') && row.id !== 'aid-request-empty-row')
            .map(row => row.getAttribute('data-id'))
            .filter(id => id);
    }
});
