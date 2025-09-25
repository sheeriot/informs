const scriptConfig = {
    debug: false,
    enabled: false,
};

document.addEventListener('DOMContentLoaded', function () {
    if (!scriptConfig.enabled) {
        if (scriptConfig.debug) console.log('Status poller is disabled.');
        // Hide the map spinner and show a placeholder if the poller is off
        const staticMapSpinner = document.getElementById('static-map-spinner');
        const staticMapImg = document.getElementById('static-map-img');
        if (staticMapSpinner) staticMapSpinner.classList.add('d-none');
        if (staticMapImg) {
            staticMapImg.alt = "Map generation is currently disabled.";
            staticMapImg.classList.remove('d-none');
        }
        return;
    }

    const statusContainer = document.getElementById('processing-status-container');
    if (!statusContainer) {
        if (scriptConfig.debug) console.log('Status container not found. Polling stopped.');
        return;
    }

    const aidRequestId = statusContainer.dataset.aidrequestId;
    const fieldOpSlug = statusContainer.dataset.fieldopSlug;
    const pollingUrl = `/api/${fieldOpSlug}/aidrequest/${aidRequestId}/status/`;
    const maxPolls = 30; // Poll for a maximum of 60 seconds (30 polls * 2s interval)
    let pollCount = 0;

    const statusList = document.getElementById('processing-status-list');
    const staticMapImg = document.getElementById('static-map-img');
    const staticMapSpinner = document.getElementById('static-map-spinner');

    // Keep track of displayed statuses to avoid recreating elements
    const displayedStatuses = new Set();

    const statusLabels = {
        location_status: 'Saving Location',
        map_status: 'Generating Map',
        email_status: 'Sending Email Notifications',
        cot_status: 'Sending CoT Alerts'
    };

    const updateStatusUI = (statusKey, statusValue) => {
        if (!statusList) return;

        const label = statusLabels[statusKey];
        if (!label) return;

        // Create the list item if it's the first time we see a non-pending status
        if (statusValue !== 'Pending' && !displayedStatuses.has(statusKey)) {
            const li = document.createElement('li');
            li.id = `status-item-${statusKey}`;
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `${label} <span id="status-span-${statusKey}"></span>`;
            statusList.appendChild(li);
            displayedStatuses.add(statusKey);
        }

        const statusSpan = document.getElementById(`status-span-${statusKey}`);
        if (!statusSpan) return;

        let icon = '<div class="spinner-border spinner-border-sm" role="status"></div>';
        let textClass = 'text-muted';

        switch (statusValue) {
            case 'Success':
                icon = '<i class="bi bi-check-circle-fill text-success"></i>';
                textClass = 'text-success';
                break;
            case 'Failed':
            case 'Skipped':
                icon = '<i class="bi bi-x-circle-fill text-danger"></i>';
                textClass = 'text-danger';
                break;
            case 'In Progress':
            case 'Queued':
                textClass = 'text-primary';
                break;
            case 'Pending':
                 // Don't show anything for pending
                return;
        }
        statusSpan.innerHTML = `${icon} <span class="${textClass}">${statusValue}</span>`;
    };

    const pollForStatus = () => {
        pollCount++;
        if (pollCount > maxPolls) {
            if (scriptConfig.debug) console.log('Max poll count reached. Stopping.');
            // Handle timeout
            const pendingKeys = Object.keys(statusLabels).filter(key => !displayedStatuses.has(key));
            pendingKeys.forEach(key => {
                 updateStatusUI(key, 'Timeout');
            });
            if (staticMapSpinner) staticMapSpinner.classList.add('d-none');
            clearInterval(pollingInterval);
            return;
        }

        fetch(pollingUrl)
            .then(response => response.json())
            .then(data => {
                if (scriptConfig.debug) console.log('Poll response:', data);

                updateStatusUI('location_status', data.location_status);
                updateStatusUI('map_status', data.map_status);
                updateStatusUI('email_status', data.email_status);
                updateStatusUI('cot_status', data.cot_status);

                if (data.map_status === 'Success' && staticMapImg && data.map_url) {
                    if (staticMapSpinner) staticMapSpinner.classList.add('d-none');
                    if (staticMapImg.src !== data.map_url) {
                        staticMapImg.src = data.map_url;
                    }
                    staticMapImg.classList.remove('d-none');
                } else if (data.map_status === 'Failed' && staticMapSpinner) {
                    staticMapSpinner.classList.add('d-none');
                }

                if (data.all_done) {
                    if (scriptConfig.debug) console.log('All tasks complete. Stopping poll.');
                    clearInterval(pollingInterval);
                }
            })
            .catch(error => {
                console.error('Error polling for status:', error);
                clearInterval(pollingInterval);
            });
    };

    const pollingInterval = setInterval(pollForStatus, 2000);
});
