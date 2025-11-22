/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */
(function () {
    'use strict';

    const SCRIPT_DEBUG = false;

    let allAidRequests = [];
    let listScriptConfig = {};
    let isInitialized = false;
    let selectedRequestId = null;

    document.addEventListener('DOMContentLoaded', initialize);

    /**
     * Main initialization function. Sets up everything.
     */
    function initialize() {
        if (isInitialized) return;
        isInitialized = true;

        if (SCRIPT_DEBUG) console.log('[List Script] Initialization started.');

        // Load the config data from the page
        const configEl = document.getElementById('aid-requests-config-json');
        if (configEl) {
            try {
                const backendConfig = JSON.parse(configEl.textContent);
                // Allow backend to override local debug setting if present
                if (typeof backendConfig.debug !== 'undefined') {
                     // Optionally respect backend debug flag here if we wanted to
                }
                Object.assign(listScriptConfig, backendConfig);
            } catch (e) {
                console.error('[List Script] Failed to parse config JSON.', e);
            }
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
        // On page load, we want standard visibility handling (hide d-none immediately), NOT fading.
        runFilterAndUpdates(initialFilterState, true);

        // After the first run, dispatch an event to let other components (like the map)
        // know what the authoritative initial filter state is.
        document.body.dispatchEvent(new CustomEvent('mapShouldUpdateFilter', {
            detail: initialFilterState
        }));


        // The map component depends on this script to be initialized first.
        if (typeof window.initializeAidRequestMap === 'function') {
            if (SCRIPT_DEBUG) console.log('[List Script] Calling window.initializeAidRequestMap...');
            window.initializeAidRequestMap(allAidRequests, initialFilterState);
        } else {
            console.error('[List Script] Map initialization function not found.');
        }

        // Set up all event listeners for the page.
        addPageEventListeners();
        initializeTooltips();
        setupModalHandlers();
    }

    function addPageEventListeners() {
        // Listen for filter changes from the filter script (i.e., user clicks)
        document.body.addEventListener('filterStateChange', function (e) {
            if (SCRIPT_DEBUG) console.log('[List Script] Filter change received.', e.detail);
            // User changed a filter: Apply immediately, no fade animation.
            runFilterAndUpdates(e.detail, true);
        });

        // Listen for clicks on the status or priority dropdown options in the aid request list.
        document.body.addEventListener('click', function(event) {
            const target = event.target.closest('.status-option, .priority-option');
            if (!target) return;

            event.preventDefault();

            const isStatusUpdate = target.classList.contains('status-option');
            const fieldName = isStatusUpdate ? 'status' : 'priority';
            const newValue = target.dataset[fieldName];
            const requestId = target.dataset.requestId;

            const row = document.getElementById(`aid-request-row-${requestId}`);
            if (!row) {
                console.error(`[List Script] Row not found for ID ${requestId}`);
                return;
            }

            const request = allAidRequests.find(r => r.id == requestId);
            if (!request) {
                console.error(`[List Script] Request data not found for ID ${requestId}`);
                return;
            }

            const updateUrl = row.dataset.urlUpdate;
            const oldValue = isStatusUpdate ? row.dataset.status : row.dataset.priority;

            if (newValue === oldValue) return;

            // Find the hidden button that triggers the generic confirmation modal
            const triggerButton = document.getElementById('status-priority-change-trigger');
            if (!triggerButton) {
                console.error('[List Script] Modal trigger button not found.');
                return;
            }

            // Populate the trigger button with all the data needed by the modal script
            Object.assign(triggerButton.dataset, {
                actionUrl: updateUrl,
                actionName: `Change ${fieldName}`,
                oldValue: oldValue,
                newValue: newValue,
                [fieldName]: newValue, // The key the server expects
                confirmButtonText: 'Confirm Change',
                requestId: request.id,
                requesterName: request.requester_name
            });

            if (SCRIPT_DEBUG) console.log('[List Script] Triggering modal for:', triggerButton.dataset);

            // Programmatically click the hidden button to show the modal
            triggerButton.click();
        });

        // Listen for successful updates from the modal action script
        document.body.addEventListener('aidRequestUpdated', function (e) {
            if (SCRIPT_DEBUG) console.log('[List Script] aidRequestUpdated received.');

            const updatedRequest = e.detail.request;
            if (!updatedRequest) return;

            const index = allAidRequests.findIndex(r => r.id === updatedRequest.id);
            if (index !== -1) {
                allAidRequests[index] = updatedRequest;

                // Re-run the filters and counts with the current state to reflect the change
                const currentFilterState = getFilterStateFromDOM();

                updateFilterCounts(currentFilterState);
                updateFilterSummary(currentFilterState);

                // Dispatch event to ensure map also re-evaluates its filter/counts with the new data state
                document.body.dispatchEvent(new CustomEvent('mapShouldUpdateFilter', {
                    detail: currentFilterState
                }));

                // Also, manually update the data attributes on the row itself
                const row = document.getElementById(`aid-request-row-${updatedRequest.id}`);
                if (row) {
                    row.dataset.status = updatedRequest.status;
                    row.dataset.priority = updatedRequest.priority || 'none';

                    // Trigger HTMX to re-render the row with the updated data from the server
                    htmx.trigger(row, `update-row-${updatedRequest.id}`);

                    // Use a one-time listener on the table body to catch the swap event,
                    // ensuring we catch it even if the original row element is replaced.
                    const swapHandler = function(evt) {
                        const targetId = evt.target.id || evt.detail?.target?.id;

                        if (targetId === `aid-request-row-${updatedRequest.id}`) {
                            const listBody = document.getElementById('aid-request-list-body');
                            if (listBody) listBody.removeEventListener('htmx:afterSwap', swapHandler);

                            // Get the NEW row element
                            const newRow = document.getElementById(`aid-request-row-${updatedRequest.id}`);
                            if (newRow) {
                                const isVisible = isRequestVisible(updatedRequest, currentFilterState);
                                if (SCRIPT_DEBUG) console.log(`[List Script] Row ${updatedRequest.id} visible after swap? ${isVisible}`);

                                // Apply visibility logic to THIS ROW ONLY
                                updateRowVisibility(newRow, isVisible, false); // immediate=false to allow fade

                                // We also need to update the visible count number in the header
                                let visibleCount = 0;
                                allAidRequests.forEach(r => {
                                    if (isRequestVisible(r, currentFilterState)) visibleCount++;
                                });
                                updateResultsCounters(visibleCount);
                            }
                        }
                    };

                    const listBody = document.getElementById('aid-request-list-body');
                    if (listBody) {
                        listBody.addEventListener('htmx:afterSwap', swapHandler);
                        // Safety timeout to remove listener if swap never happens/fails
                        setTimeout(() => listBody.removeEventListener('htmx:afterSwap', swapHandler), 5000);
                    }
                }
            }
        });

        // Listen for events from the map to sync the highlighted row
        document.body.addEventListener('popupOpenedOnMap', function(e) {
            const requestId = e.detail.requestId;
            if (selectedRequestId && selectedRequestId !== requestId) {
                unhighlightRow(selectedRequestId);
            }
            highlightRow(requestId);
            selectedRequestId = requestId;
        });

        document.body.addEventListener('popupClosedOnMap', function(e) {
            if (selectedRequestId) {
                unhighlightRow(selectedRequestId);
                selectedRequestId = null;
            }
        });
    }

    // Helper to determine if a single request should be visible
    function isRequestVisible(request, filterState) {
        const statusMatch = filterState.status.length === 0 || filterState.status.includes(request.status);
        const priority = request.priority || 'none';
        const priorityMatch = filterState.priority === 'all' || filterState.priority.includes(priority);
        const aidType = request.aid_type.slug;
        const aidTypeMatch = filterState.aid_type === 'all' || filterState.aid_type.includes(aidType);
        return statusMatch && priorityMatch && aidTypeMatch;
    }

    // Helper to handle the row visibility transition for a single row
    function updateRowVisibility(row, isVisible, immediate = false) {
        if (isVisible) {
             row.classList.remove('d-none');
             row.classList.remove('fade-out-row');
             row.style.opacity = '';
        } else {
             if (immediate) {
                 row.classList.add('d-none');
                 row.classList.remove('fade-out-row');
                 row.style.opacity = '';
             } else {
                 // Check if it's already hidden or fading to avoid restarting
                 if (!row.classList.contains('d-none') && !row.classList.contains('fade-out-row')) {

                     // Ensure start state is fully visible
                     row.style.opacity = '1';

                     // Force reflow
                     void row.offsetHeight;

                     // Small delay to ensure browser paints the visible state
                     setTimeout(() => {
                         row.classList.add('fade-out-row');
                         row.style.opacity = ''; // Remove inline style so class takes effect
                     }, 50);

                     setTimeout(() => {
                         // Only hide if still meant to be hidden (still has the class)
                         if (row.classList.contains('fade-out-row')) {
                             row.classList.add('d-none');
                             row.classList.remove('fade-out-row');
                         }
                     }, 3000);
                 }
             }
        }
    }

    /**
     * The main worker function that applies the current filter state to the list and updates the UI.
     * @param {object} filterState - The current state of all filters.
     */
    function runFilterAndUpdates(filterState, immediate = false) {
        if (!filterState) {
            console.error('[List Script] runFilterAndUpdates called without a filterState. Recovering by reading from DOM.');
            filterState = getFilterStateFromDOM();
        }

        let visibleCount = 0;

        allAidRequests.forEach(request => {
            const row = document.getElementById(`aid-request-row-${request.id}`);
            if (!row) return;

            const shouldBeVisible = isRequestVisible(request, filterState);
            if (shouldBeVisible) visibleCount++;

            updateRowVisibility(row, shouldBeVisible, immediate);
        });

        if (SCRIPT_DEBUG) console.log(`[List Script] Filter applied. Visible rows: ${visibleCount}`);

        updateResultsCounters(visibleCount);
        updateFilterCounts(filterState);
        updateFilterSummary(filterState);
    }

    function updateResultsCounters(visibleCount) {
        const resultsCounter = document.getElementById('results-counter');
        if (resultsCounter) {
            resultsCounter.textContent = `${visibleCount} of ${allAidRequests.length} requests`;
        }

        const listTotalCount = document.getElementById('list-total-count');
        if (listTotalCount) {
            listTotalCount.textContent = `${visibleCount}`;
        }
    }

    function updateFilterCounts(filterState) {

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

        if (SCRIPT_DEBUG) console.log('[List Script] Counts updated.', counts);

        updateCountUI('status', counts.byStatus);
        updateCountUI('priority', counts.byPriority);
        updateCountUI('aid_type', counts.byAidType);

        // Correctly calculate Active and Inactive totals from the intersectional `counts.byStatus` object.
        let activeTotal = 0;
        let inactiveTotal = 0;

        if (listScriptConfig.status_groups) {
            for (const status in counts.byStatus) {
                if (listScriptConfig.status_groups.active.includes(status)) {
                    activeTotal += counts.byStatus[status];
                }
                if (listScriptConfig.status_groups.inactive.includes(status)) {
                    inactiveTotal += counts.byStatus[status];
                }
            }
        }

        const activeTotalEl = document.getElementById('status-group-filter-active-total');
        if (activeTotalEl) activeTotalEl.textContent = `(${activeTotal})`;

        const inactiveTotalEl = document.getElementById('status-group-filter-inactive-total');
        if (inactiveTotalEl) inactiveTotalEl.textContent = `(${inactiveTotal})`;
    }

    function updateFilterSummary(filterState) {
        const summaryParts = [];

        const getLabelForValue = (type, value) => {
            const checkbox = document.querySelector(`[data-filter-type="${type}"][data-filter-value="${value}"]`);
            if (checkbox) {
                // Find the label associated with the checkbox and get its text, excluding the count span
                const label = checkbox.closest('.form-check').querySelector('label');
                if (label) {
                    // Clone the label, remove the count span, and then get the text content
                    const clone = label.cloneNode(true);
                    const countSpan = clone.querySelector('span');
                    if (countSpan) {
                        countSpan.remove();
                    }
                    return clone.textContent.trim();
                }
            }
            return value; // Fallback to the value itself
        };

        if (filterState.status && filterState.status.length > 0) {
            const statusNames = filterState.status.map(s => `"${getLabelForValue('status', s)}"`).join(', ');
            summaryParts.push(`<strong>Status:</strong> ${statusNames}`);
        }

        if (filterState.priority && filterState.priority !== 'all') {
            const priorityNames = filterState.priority.map(p => `"${getLabelForValue('priority', p)}"`).join(', ');
            summaryParts.push(`<strong>Priority:</strong> ${priorityNames}`);
        }

        if (filterState.aid_type && filterState.aid_type !== 'all') {
            const aidTypeNames = filterState.aid_type.map(a => `"${getLabelForValue('aid_type', a)}"`).join(', ');
            summaryParts.push(`<strong>Aid&nbsp;Type:</strong> ${aidTypeNames}`);
        }

        const summaryHTML = summaryParts.join('<br>');

        const mapSummaryEl = document.getElementById('map-filter-summary');
        const listSummaryEl = document.getElementById('list-filter-summary');

        if (mapSummaryEl) {
            mapSummaryEl.innerHTML = summaryHTML;
        }
        if (listSummaryEl) {
            listSummaryEl.innerHTML = summaryHTML;
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

    function highlightRow(requestId) {
        if (!requestId) return;
        const row = document.getElementById(`aid-request-row-${requestId}`);
        if (row) {
            row.classList.add('aidrequest-selected', 'shadow-sm');
            const icon = row.querySelector('.view-on-map-icon');
            if (icon) {
                icon.classList.remove('bi-geo-alt');
                icon.classList.add('bi-eye-fill');
                    }
                }
    }

    function unhighlightRow(requestId) {
        if (!requestId) return;
        const row = document.getElementById(`aid-request-row-${requestId}`);
        if (row) {
            row.classList.remove('aidrequest-selected', 'shadow-sm');
            const icon = row.querySelector('.view-on-map-icon');
            if (icon) {
                icon.classList.remove('bi-eye-fill');
                icon.classList.add('bi-geo-alt');
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

        // Add a handler for the new "View on Map" button
        document.body.addEventListener('click', function(event) {
            const viewBtn = event.target.closest('.btn-view-on-map');
            if (viewBtn) {
                event.preventDefault();

                const requestId = parseInt(viewBtn.dataset.requestId, 10);

                if (requestId === selectedRequestId) {
                    // Clicked the already selected one, so deselect it.
                    unhighlightRow(requestId);
                    selectedRequestId = null;
                    document.body.dispatchEvent(new CustomEvent('closePopupOnMap'));
                } else {
                    // A new one is being selected.
                    if (selectedRequestId) {
                        unhighlightRow(selectedRequestId);
                    }
                    highlightRow(requestId);
                    selectedRequestId = requestId;
                    document.body.dispatchEvent(new CustomEvent('showPopupForRequest', {
                        detail: { requestId: requestId }
                    }));
                }
            }

            // Handle the new copy URL link
            const copyLink = event.target.closest('.copy-url-link');
            if (copyLink) {
                event.preventDefault();
                const relativeUrl = copyLink.getAttribute('data-url');
                if (relativeUrl) {
                    const absoluteUrl = window.location.origin + relativeUrl;
                    navigator.clipboard.writeText(absoluteUrl).then(() => {
                        showActionAlert('Link copied to clipboard!', 'success');
                    }).catch(err => {
                        console.error('Failed to copy URL: ', err);
                        showActionAlert('Failed to copy link.', 'danger');
                    });
                }
            }

            // Handle clicks on the address copy icon
            const copyAddressIcon = event.target.closest('.copy-address-icon');
            if (copyAddressIcon) {
                const address = copyAddressIcon.dataset.address;
                if (address) {
                    navigator.clipboard.writeText(address).then(() => {
                        showActionAlert('Address copied to clipboard!', 'success');
                    }).catch(err => {
                        console.error('Failed to copy address:', err);
                        showActionAlert('Failed to copy address.', 'danger');
                    });
            }
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
