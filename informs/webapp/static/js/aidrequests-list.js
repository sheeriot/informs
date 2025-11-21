/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */
(function () {
    'use strict';
    console.log('[List Script] File loading.'); // Unconditional log

    let allAidRequests = [];
    let listScriptConfig = { debug: false }; // Default config
    let isInitialized = false;

    document.addEventListener('DOMContentLoaded', function () {
        initialize();
    });

    /**
     * Main initialization function. Sets up everything.
     */
    function initialize() {
        if (isInitialized) {
            // This is a safeguard, but should not be hit if the templates are correct.
            // console.warn('[List Script] Attempted to initialize again. Aborting.');
            return;
        }
        isInitialized = true;
        if (listScriptConfig.debug) console.log('[List Script] Initialization started.');

        // Attempt to load the debug flag from the body dataset
        if (document.body.dataset.debug === 'true') {
            listScriptConfig.debug = true;
        }

        // Load the config data
        const configEl = document.getElementById('aid-requests-config-json');
        if (configEl) {
            listScriptConfig = JSON.parse(configEl.textContent);
        } else {
            console.error("[List Script] Config data element ('aid-requests-config-json') not found. Using defaults.");
        }

        // Load the aid request data directly from its script tag
        const dataEl = document.getElementById('all-requests-json');
        if (!dataEl) {
            console.error("[List Script] Aid request data element ('all-requests-json') not found. Aborting.");
            return;
        }
        try {
            allAidRequests = JSON.parse(dataEl.textContent);
        } catch (e) {
            console.error('[List Script] Failed to parse aid request data:', e);
            return;
        }

        // Get the initial filter state from the DOM.
        const initialFilterState = getFilterStateFromDOM();

        // Apply the initial filter to set the correct visibility and get initial counts
        runFilterAndUpdates(initialFilterState);

        // After the first run, dispatch an event to let other components (like the map)
        // know what the authoritative initial filter state is.
        document.body.dispatchEvent(new CustomEvent('mapShouldUpdateFilter', {
            detail: initialFilterState
        }));


        // The map component depends on this script to be initialized first.
        if (window.initializeAidRequestMap) {
            // if (listScriptConfig.debug) console.log('[List Script] Calling window.initializeAidRequestMap...');
            window.initializeAidRequestMap(allAidRequests);
        } else {
            console.error('[List Script] Map initialization function not found.');
        }

        // Set up all event listeners for the page.
        addPageEventListeners();
        initializeTooltips();
        setupModalHandlers(); // Initialize modal handlers
    }

    function addPageEventListeners() {
        // Listen for filter changes from the filter script (i.e., user clicks)
        document.body.addEventListener('filterStateChange', function (e) {
            if (listScriptConfig.debug) {
                console.log('[List Script] Received filterStateChange event from user action.', e.detail);
            }
            runFilterAndUpdates(e.detail);
        });

        // Listen for clicks on the status or priority dropdown options in the aid request list.
        document.body.addEventListener('click', function(event) {
            const target = event.target.closest('.status-option, .priority-option');
            if (!target) return;

            event.preventDefault(); // Stop the link from navigating to '#'

            const isStatusUpdate = target.classList.contains('status-option');
            const fieldName = isStatusUpdate ? 'status' : 'priority';
            const newValue = target.dataset[fieldName];
            const requestId = target.dataset.requestId;

            const row = document.getElementById(`aid-request-row-${requestId}`);
            if (!row) {
                console.error(`[List Script] Could not find row for request ID ${requestId}`);
                return;
            }

            // The 'aidrequest-actions' script needs this info for the modal title
            const request = allAidRequests.find(r => r.id == requestId);
            if (!request) {
                console.error(`[List Script] Could not find request data for ID ${requestId} in local store.`);
                return;
            }

            const updateUrl = row.dataset.urlUpdate;
            const oldValue = isStatusUpdate ? row.dataset.status : row.dataset.priority;

            if (newValue === oldValue) {
                if (listScriptConfig.debug) console.log(`[List Script] ${fieldName} is already '${newValue}'. No action taken.`);
                return;
            }

            // Find the hidden button that triggers the generic confirmation modal
            const triggerButton = document.getElementById('status-priority-change-trigger');
            if (!triggerButton) {
                console.error('[List Script] Could not find the modal trigger button #status-priority-change-trigger');
                return;
            }

            // Populate the trigger button with all the data needed by the modal script
            triggerButton.dataset.actionUrl = updateUrl;
            triggerButton.dataset.actionName = `Change ${fieldName}`;
            triggerButton.dataset.oldValue = oldValue;
            triggerButton.dataset.newValue = newValue;
            triggerButton.dataset[fieldName] = newValue; // The key the server expects
            triggerButton.dataset.confirmButtonText = `Confirm Change`;

            // Data for the modal title, making the actions script more generic
            triggerButton.dataset.requestId = request.id;
            triggerButton.dataset.requesterName = request.requester_name;


            if (listScriptConfig.debug) {
                console.log('[List Script] Populating and clicking hidden modal trigger:', triggerButton.dataset);
            }

            // Programmatically click the hidden button to show the modal
            triggerButton.click();
        });

        // Listen for successful updates from the modal action script
        document.body.addEventListener('aidRequestUpdated', function (e) {
            if (listScriptConfig.debug) {
                console.log('[List Script] Received aidRequestUpdated event. Refreshing data and filters.');
            }
            const updatedRequest = e.detail.request;
            if(updatedRequest) {
                const index = allAidRequests.findIndex(r => r.id === updatedRequest.id);
                if (index !== -1) {
                    allAidRequests[index] = updatedRequest;
                    if (listScriptConfig.debug) {
                        console.log(`[List Script] Updated request #${updatedRequest.id} in local store.`);
                    }
                    // Re-run the filters and counts with the current state to reflect the change
                    runFilterAndUpdates(getFilterStateFromDOM());

                    // Also, manually update the data attributes on the row itself
                    const row = document.getElementById(`aid-request-row-${updatedRequest.id}`);
                    if (row) {
                        row.dataset.status = updatedRequest.status;
                        row.dataset.priority = updatedRequest.priority || 'none';
                        // Trigger HTMX to re-render the row with the updated data from the server
                        htmx.trigger(row, `update-row-${updatedRequest.id}`);
                    }

                }
            }
        });
    }

    /**
     * The main worker function that applies the current filter state to the list and updates the UI.
     * @param {object} filterState - The current state of all filters.
     */
    function runFilterAndUpdates(filterState) {
        if (!filterState) {
            console.error('[List Script] runFilterAndUpdates called without a filterState. Recovering by reading from DOM.');
            filterState = getFilterStateFromDOM();
        }
        // if (listScriptConfig.debug) console.log('[List Script] Running filter and updates with state:', filterState);

        const counts = applyListFilter(filterState);
        updateFilterCounts(filterState, counts);
    }

    function applyListFilter(filterState) {
        let visibleCount = 0;
        const groupCounts = { active: 0, inactive: 0 };

        allAidRequests.forEach(request => {
            const row = document.getElementById(`aid-request-row-${request.id}`);
            if (!row) return;

            const statusMatch = filterState.status.length === 0 || filterState.status.includes(request.status);

            const priority = request.priority || 'none';
            const priorityMatch = filterState.priority === 'all' || filterState.priority.includes(priority);

            const aidType = request.aid_type.slug;
            const aidTypeMatch = filterState.aid_type === 'all' || filterState.aid_type.includes(aidType);

            if (statusMatch && priorityMatch && aidTypeMatch) {
                row.classList.remove('d-none');
                visibleCount++;
                // Count which group the newly visible item belongs to.
                if (listScriptConfig.status_groups.active.includes(request.status)) {
                    groupCounts.active++;
                } else if (listScriptConfig.status_groups.inactive.includes(request.status)) {
                    groupCounts.inactive++;
                }
            } else {
                row.classList.add('d-none');
            }
        });

        if (listScriptConfig.debug) {
            console.log(`[List Script] Applied filter. Visible rows: ${visibleCount}`);
        }

        const resultsCounter = document.getElementById('results-counter');
        if (resultsCounter) {
            resultsCounter.textContent = `${visibleCount} of ${allAidRequests.length} requests`;
        }
        return groupCounts;
    }

    function updateFilterCounts(filterState, groupCounts) {
        if (listScriptConfig.debug) console.log(`[List Script] Updating filter counts.`);

        const counts = { byStatus: {}, byPriority: {}, byAidType: {} };

        document.querySelectorAll('[data-filter-type="status"]').forEach(el => { if(el.dataset.filterValue) counts.byStatus[el.dataset.filterValue] = 0 });
        document.querySelectorAll('[data-filter-type="priority"]').forEach(el => { if(el.dataset.filterValue) counts.byPriority[el.dataset.filterValue] = 0 });
        document.querySelectorAll('[data-filter-type="aid_type"]').forEach(el => { if(el.dataset.filterValue) counts.byAidType[el.dataset.filterValue] = 0 });

        allAidRequests.forEach(request => {
            const priority = request.priority || 'none';
            const aidType = request.aid_type.slug;

            const priorityMatchForStatus = filterState.priority === 'all' || filterState.priority.includes(priority);
            const aidTypeMatchForStatus = filterState.aid_type === 'all' || filterState.aid_type.includes(aidType);
            if (priorityMatchForStatus && aidTypeMatchForStatus && counts.byStatus.hasOwnProperty(request.status)) {
                counts.byStatus[request.status]++;
            }

            const statusMatchForPriority = filterState.status.length === 0 || filterState.status.includes(request.status);
            const aidTypeMatchForPriority = filterState.aid_type === 'all' || filterState.aid_type.includes(aidType);
            if (statusMatchForPriority && aidTypeMatchForPriority && counts.byPriority.hasOwnProperty(priority)) {
                counts.byPriority[priority]++;
            }

            const statusMatchForAidType = filterState.status.length === 0 || filterState.status.includes(request.status);
            const priorityMatchForAidType = filterState.priority === 'all' || filterState.priority.includes(priority);
            if (statusMatchForAidType && priorityMatchForAidType && counts.byAidType.hasOwnProperty(aidType)) {
                counts.byAidType[aidType]++;
            }
        });

        if (listScriptConfig.debug) console.log('[List Script] Calculated intersectional counts:', counts);

        updateCountUI('status', counts.byStatus);
        updateCountUI('priority', counts.byPriority);
        updateCountUI('aid_type', counts.byAidType);

        // After all individual counts are updated, use the accurate groupCounts from applyListFilter.
        if (groupCounts) {
            const activeTotal = Object.values(counts.byStatus).reduce((sum, current) => sum + current, 0);
            const inactiveTotal = Object.values(counts.byStatus).reduce((sum, current) => sum + current, 0); // This line was removed from the new_code, but should be removed here as well.
            if (listScriptConfig.debug) {
                console.log(`[List Script] New Group Totals -> Active: ${activeTotal}, Inactive: ${inactiveTotal}`);
            }
            const activeTotalEl = document.getElementById('status-group-filter-active-total');
            if (activeTotalEl) activeTotalEl.textContent = `(${activeTotal})`;

            const inactiveTotalEl = document.getElementById('status-group-filter-inactive-total');
            if (inactiveTotalEl) inactiveTotalEl.textContent = `(${inactiveTotal})`;
        }
    }

    function updateCountUI(filterType, counts) {
        for (const [value, count] of Object.entries(counts)) {
            if (value === 'all') continue;
            // Use the filterType directly (e.g., 'aid_type') to match the template's ID generation.
            const elementId = `${filterType}-${value}-count`;
            const el = document.getElementById(elementId);

            if (el) {
                el.textContent = `(${count})`;
            }

            const checkbox = document.getElementById(`${filterType.replace('_', '-')}-filter-${value}`);
            if (checkbox) {
                const label = checkbox.closest('.form-check').querySelector('label');
                // Per user request: DO NOT disable checkboxes. Only mute the text.
                const shouldBeMuted = count === 0;
                if (label) {
                    label.classList.toggle('text-muted', shouldBeMuted);
                }
            }
        }

        const allCountEl = document.getElementById(`${filterType.replace('_', '-')}-all-count`);
        if (allCountEl) {
            let selectedItemsCount = 0;
            const childCheckboxes = document.querySelectorAll(`.filter-checkbox[data-filter-type="${filterType}"]:not([data-filter-value="all"])`);
            childCheckboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    const value = checkbox.dataset.filterValue;
                    if (counts[value]) {
                        selectedItemsCount += counts[value];
                    }
                }
            });

            allCountEl.textContent = `(${selectedItemsCount})`;

            const allCheckbox = document.getElementById(`${filterType.replace('_', '-')}-filter-all`);
            if (allCheckbox) {
                const shouldBeMuted = selectedItemsCount === 0;
                const label = allCheckbox.closest('.form-check').querySelector('label');
                if (label) {
                    label.classList.toggle('text-muted', shouldBeMuted);
                }
            }
        }
    }

    function getFilterStateFromDOM() {
        const filterCard = document.getElementById('aid-request-filter-card');
        if (!filterCard) return {};

        const getCheckedValues = (selector) =>
            Array.from(filterCard.querySelectorAll(selector))
                 .filter(cb => cb.checked)
                 .map(cb => cb.dataset.filterValue);

        // Correctly determines if an "All" checkbox is fully checked.
        const isAllChecked = (selector) => {
            const allCheckbox = filterCard.querySelector(selector);
            // It's only 'all' if the main checkbox is checked and not indeterminate.
            return allCheckbox && allCheckbox.checked && !allCheckbox.indeterminate;
        };

        // Gets the values of all checked child checkboxes for a given type.
        const getCheckedChildValues = (type) =>
            Array.from(filterCard.querySelectorAll(`[data-filter-type="${type}"]:not([id$="-all"])`))
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.filterValue);


        const aidTypes = isAllChecked('#aid-type-filter-all') ? 'all' : getCheckedChildValues('aid_type');
        const priorities = isAllChecked('#priority-filter-all') ? 'all' : getCheckedChildValues('priority');
        const statuses = getCheckedValues('[data-filter-type="status"]');

        return { status: statuses, priority: priorities, aid_type: aidTypes };
    }

    function initializeTooltips() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }

    function setupModalHandlers() {
        const actionConfirmationModal = document.getElementById('actionConfirmationModal');
        if (!actionConfirmationModal) return;

        const modalInstance = bootstrap.Modal.getOrCreateInstance(actionConfirmationModal);

        actionConfirmationModal.addEventListener('show.bs.modal', function (event) {
            const triggerButton = event.relatedTarget;
            if (!triggerButton || !triggerButton.dataset.actionUrl) return;

            const modalTitle = actionConfirmationModal.querySelector('.modal-title');
            const modalBody = actionConfirmationModal.querySelector('.modal-body-dynamic');
            const confirmBtn = actionConfirmationModal.querySelector('.confirm-action-btn');

            // --- Populate Title ---
            const aidRequestId = triggerButton.dataset.requestId;
            const requesterName = triggerButton.dataset.requesterName;
            const fieldOpName = listScriptConfig.fieldOpName || 'FieldOp';
            const fieldOpSlug = listScriptConfig.fieldOpSlug || '';

            if (modalTitle && aidRequestId) {
                modalTitle.innerHTML = `
                    <div class="d-flex flex-column">
                        <small class="fw-bold"><i class="bi bi-truck me-2"></i>${fieldOpName} (${fieldOpSlug})</small>
                        <small><i class="bi bi-life-preserver me-2"></i>Aid Request #${aidRequestId}: ${requesterName}</small>
                    </div>`;
            }

            // --- Populate Body ---
            const oldValue = triggerButton.dataset.oldValue;
            const newValue = triggerButton.dataset.newValue;
            const actionName = triggerButton.dataset.actionName;

            if (modalBody && oldValue && newValue) {
                 modalBody.innerHTML = `
                    <h5 class="mb-3">${actionName}</h5>
                    <div class="ms-3">
                         <p class="mb-1"><strong>From:</strong> <span class="text-muted">${oldValue}</span></p>
                         <p class="mb-0"><strong>To:</strong> <span class="fs-5">${newValue}</span></p>
                    </div>`;
            }

            // --- Configure Confirm Button ---
            if (confirmBtn) {
                const newConfirmBtn = confirmBtn.cloneNode(true);
                confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

                newConfirmBtn.addEventListener('click', function() {
                    const url = triggerButton.dataset.actionUrl;
                    const payload = { ...triggerButton.dataset };
                    delete payload.bsToggle;
                    delete payload.bsTarget;
                    // ... clean up other data attributes if needed

                    // Blur the button before hiding the modal to prevent ARIA warnings
                    newConfirmBtn.blur();

                    fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken'),
                        },
                        body: JSON.stringify(payload)
                    })
                    .then(response => {
                        if (!response.ok) throw new Error('Network response was not ok.');
                        return response.json();
                    })
                    .then(updatedRequest => {
                        modalInstance.hide();
                        document.body.dispatchEvent(new CustomEvent('aidRequestUpdated', {
                            detail: { request: updatedRequest }
                        }));
                    })
                    .catch(error => {
                        console.error('[List Script] Error updating request:', error);
                        // Optionally show an error in the modal
                    });
                });
            }
        });
    }

    // --- INITIALIZATION ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
