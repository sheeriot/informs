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

    document.addEventListener('DOMContentLoaded', function () {
        initialize();
    });

    function initialize() {
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

        if (listScriptConfig.debug) {
            console.log(`[List Script] Initialization started.`);
            console.log(`[List Script] Loaded ${allAidRequests.length} aid requests into the local store.`);
        }

        // The server renders the initial checkbox state. Read it directly from the DOM.
        const initialFilterState = getFilterStateFromDOM();
        if (listScriptConfig.debug) {
            console.log('[List Script] Reading initial filter state from DOM:', initialFilterState);
        }

        // Run the first filter pass WITHOUT updating counts.
        // The template is now the source of truth for the initial render.
        applyListFilter(initialFilterState);

        // Dispatch the true initial state for other components like the map to use.
        if (listScriptConfig.debug) {
            console.log('[List Script] Dispatching authoritative initial filter state for other components.');
        }
        document.body.dispatchEvent(new CustomEvent('filterStateChange', {
            detail: initialFilterState,
            bubbles: true
        }));

        // Set up all event listeners for the page.
        addPageEventListeners();
        initializeTooltips();

        // KICK OFF MAP INITIALIZATION
        // Use a timeout to ensure the map script has loaded and the DOM is fully ready.
        setTimeout(() => {
            if (window.initializeAidRequestMap) {
                if (listScriptConfig.debug) {
                    console.log('[List Script] Calling window.initializeAidRequestMap...');
                }
                window.initializeAidRequestMap(allAidRequests);
            } else {
                console.error('[List Script] Map initializer function (window.initializeAidRequestMap) not found.');
            }
        }, 0);
    }

    function addPageEventListeners() {
        // Listen for filter changes from the filter script (i.e., user clicks)
        document.body.addEventListener('filterStateChange', function (e) {
            if (listScriptConfig.debug) {
                console.log('[List Script] Received filterStateChange event from user action.', e.detail);
            }
            runFilterAndUpdates(e.detail);
        });

        // Add other listeners for HTMX, modals etc. as needed.
    }

    function runFilterAndUpdates(filterState) {
        if (!filterState) {
            console.error('[List Script] runFilterAndUpdates called without a filterState.');
            return;
        }
        if (listScriptConfig.debug) {
            console.log('[List Script] Running filter and updates with state:', filterState);
        }
        // applyListFilter now returns the counts of visible items per status group.
        const groupCounts = applyListFilter(filterState);
        updateFilterCounts(filterState, groupCounts); // Pass the new counts to the UI updater.
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
             if (listScriptConfig.debug) {
                console.log(`[List Script] New Group Totals -> Active: ${groupCounts.active}, Inactive: ${groupCounts.inactive}`);
            }
            const activeTotalEl = document.getElementById('status-group-filter-active-total');
            if (activeTotalEl) activeTotalEl.textContent = `(${groupCounts.active})`;

            const inactiveTotalEl = document.getElementById('status-group-filter-inactive-total');
            if (inactiveTotalEl) inactiveTotalEl.textContent = `(${groupCounts.inactive})`;
        }
    }

    function updateCountUI(filterType, counts) {
        for (const [value, count] of Object.entries(counts)) {
            if (value === 'all') continue;
            const el = document.getElementById(`${filterType.replace('_', '-')}-${value}-count`);
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
            const allCheckbox = document.getElementById(`${filterType.replace('_', '-')}-filter-all`);
            const allCount = Object.values(counts).reduce((sum, current) => sum + current, 0);
            allCountEl.textContent = `(${allCount})`;
            if (allCheckbox) {
                // Per user request: DO NOT disable checkboxes. Only mute the text.
                const shouldBeMuted = allCount === 0;
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

        const isAllOrIndeterminate = (selector) => {
            const allCheckbox = filterCard.querySelector(selector);
            return allCheckbox && (allCheckbox.checked || allCheckbox.indeterminate);
        };

        const getIndeterminateValues = (type) =>
            Array.from(filterCard.querySelectorAll(`[data-filter-type="${type}"]:not([id$="-all"])`))
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.filterValue);


        const aidTypes = isAllOrIndeterminate('#aid-type-filter-all') ? 'all' : getIndeterminateValues('aid_type');
        const priorities = isAllOrIndeterminate('#priority-filter-all') ? 'all' : getIndeterminateValues('priority');
        const statuses = getCheckedValues('[data-filter-type="status"]');

        return { status: statuses, priority: priorities, aid_type: aidTypes };
    }

    function initializeTooltips() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
})();
