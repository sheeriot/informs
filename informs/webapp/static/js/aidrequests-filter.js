/**
 * aidrequests-filter.js
 *
 * Manages aid request filtering, counting, and display updates
 */
// Version 0.0.4

// Configuration and Data Store
window.aidRequestsStore = {
    debug: true,  // Set to false in production

    // Status group lookup table - matches Django model's ACTIVE_STATUSES and INACTIVE_STATUSES
    statusGroups: {
        active: ['new', 'assigned', 'resolved'],
        inactive: ['closed', 'rejected', 'other']
    },

    // Priority choices - matches Django model's PRIORITY_CHOICES
    priorityChoices: {
        high: 'High',
        medium: 'Medium',
        low: 'Low',
        null: 'None'  // null is used for "None" priority
    },

    // Initialization state
    initialized: false,
    initError: null,
    currentState: null,

    // Core data store
    data: {
        aidRequests: [],
        aidTypes: {},
        priorityChoices: {},

        // Current filter state
        filterState: {
            statuses: 'all',
            aidTypes: 'all',
            priorities: 'all'
        },

        // Counts
        serverCounts: null,
        counts: {
            total: 0,
            matched: 0,
            groups: {
                active: { total: 0, filtered: 0 },
                inactive: { total: 0, filtered: 0 }
            },
            byStatus: {},
            byAidType: {},
            byPriority: {}
        }
    },

    // DOM elements
    elements: {
        filterCard: null
    },

    // Utility functions
    utils: {
        isNullOrNone: function(value) {
            return value === null || value === 'null' || value === 'none' || value === undefined;
        },

        formatNullValue: function(value) {
            return this.isNullOrNone(value) ? 'None' : value;
        }
    },

    // Update aid request in store
    updateAidRequest: function(requestId, updates) {
        if (this.debug) {
            console.log('[Store] Updating aid request:', {
                requestId,
                updates,
                currentState: this.currentState
            });
        }

        // Find the aid request in the store using id only
        const request = this.data.aidRequests.find(r => String(r.id) === String(requestId));
        if (!request) {
            console.error('[Store] Aid request not found:', requestId);
            return;
        }

        // Update the request data
        if (updates.status) {
            request.status = updates.status;
            request.status_display = updates.status_display;
        }
        if (updates.priority) {
            request.priority = updates.priority;
            request.priority_display = updates.priority_display;
        }

        if (this.debug) {
            console.log('[Store] Updated request:', request);
        }

        // Recalculate counts and update display
        const filterState = getFilterState();
        const counts = getFilteredCounts(this.data.aidRequests, filterState);
        updateCountsDisplay(counts);

        // Update row visibility if needed
        const filterChangeEvent = new CustomEvent('aidRequestsFiltered', {
            detail: { filterState, counts }
        });
        document.dispatchEvent(filterChangeEvent);

        if (this.debug) {
            console.log('[Store] Aid request update complete');
        }
    }
};

// Main Initialization
document.addEventListener('DOMContentLoaded', async function() {
    if (aidRequestsStore.debug) console.log('[Filter] Initializing aid requests filter...');
    if (aidRequestsStore.debug) {
    console.time('initialization');
    }

    try {
        // Initialize filterCard reference
        aidRequestsStore.elements.filterCard = document.getElementById('aid-request-filter-card');
        if (!aidRequestsStore.elements.filterCard) {
            throw new Error('Filter card element not found');
        }

        // Initialize in sequence
        await initializeData();
        initializeUI();
        validateInitialState();

        // Calculate initial filter state and counts
        const filterState = getFilterState();
        const counts = getFilteredCounts(aidRequestsStore.data.aidRequests, filterState);

        // Store current state
        aidRequestsStore.currentState = { filterState, counts };
        aidRequestsStore.initialized = true;

        // Dispatch initialization complete event
        const initEvent = new CustomEvent('aidRequestsFilterReady', {
            detail: aidRequestsStore.currentState
        });
        document.dispatchEvent(initEvent);

        if (aidRequestsStore.debug) {
            console.log('[Filter] Initialization complete');
        console.timeEnd('initialization');
        }
    } catch (error) {
        console.error('[Filter] Initialization failed:', error);
        // Store error state
        aidRequestsStore.initError = error;
        // Dispatch error event
        const errorEvent = new CustomEvent('aidRequestsFilterError', {
            detail: { error }
        });
        document.dispatchEvent(errorEvent);
    }
});

// Data Initialization
async function initializeData() {
    if (aidRequestsStore.debug) {
    console.time('data-initialization');
    }

    try {
        // Load metadata first
        await Promise.all([
            initializeAidTypes(),
            initializePriorityChoices()
        ]);

        // Then load aid requests and calculate counts
        await initializeAidRequests();

        if (aidRequestsStore.debug) {
        console.timeEnd('data-initialization');
        }
    } catch (error) {
        console.error('[Filter] Data initialization failed:', error);
        throw error;
    }
}

async function initializeAidTypes() {
    if (aidRequestsStore.debug) {
    console.time('aid-types-load');
    }

    const element = document.getElementById('aid-types-json');
    if (!element) {
        throw new Error('Aid types configuration not found');
    }

    try {
        const types = JSON.parse(element.textContent);
        aidRequestsStore.data.aidTypes = types.reduce((acc, type) => {
            acc[type.slug] = type;
            return acc;
        }, {});

        if (aidRequestsStore.debug) {
            console.log('[Filter] Loaded aid types:', aidRequestsStore.data.aidTypes);
        console.timeEnd('aid-types-load');
        }
    } catch (error) {
        console.error('[Filter] Error parsing aid types:', error);
        throw error;
    }
}

async function initializePriorityChoices() {
    if (aidRequestsStore.debug) {
    console.time('priority-choices-load');
    }

    const element = document.getElementById('priority-choices-data');
    if (!element) {
        throw new Error('Priority choices data not found');
    }

    try {
        const choices = JSON.parse(JSON.parse(element.textContent));
        aidRequestsStore.data.priorityChoices = choices.reduce((acc, [value, label]) => {
            acc[value === null ? 'null' : value] = label;
            return acc;
        }, {});

        if (aidRequestsStore.debug) {
            console.log('[Filter] Loaded priority choices:', aidRequestsStore.data.priorityChoices);
        console.timeEnd('priority-choices-load');
        }
    } catch (error) {
        console.error('[Filter] Error parsing priority choices:', error);
        throw error;
    }
}

async function initializeAidRequests() {
    if (aidRequestsStore.debug) {
    console.time('aid-requests-load');
    }

    const element = document.getElementById('aid-locations-data');
    if (!element?.textContent.trim()) {
        throw new Error('Aid requests data not found');
    }

    try {
        // Load requests
        aidRequestsStore.data.aidRequests = JSON.parse(element.textContent);

        // Calculate initial counts using initial filter state
        const initialFilterState = {
            statuses: aidRequestsStore.statusGroups.active,  // Only active statuses
            aidTypes: 'all',                                // All aid types
            priorities: 'all'                               // All priorities
        };

        if (aidRequestsStore.debug) {
            console.log('[Filter] Using initial filter state:', initialFilterState);
        }

        aidRequestsStore.data.serverCounts = getFilteredCounts(
            aidRequestsStore.data.aidRequests,
            initialFilterState
        );

        if (aidRequestsStore.debug) {
            console.log('[Filter] Loaded aid requests:', {
            count: aidRequestsStore.data.aidRequests.length,
            initialCounts: aidRequestsStore.data.serverCounts
        });
        console.timeEnd('aid-requests-load');
        }
    } catch (error) {
        console.error('[Filter] Error loading aid requests:', error);
        throw error;
    }
}

// UI Initialization and Event Handlers
function initializeUI() {
    if (aidRequestsStore.debug) {
    console.time('ui-initialization');
    }

    const filterCard = aidRequestsStore.elements.filterCard;
    if (!filterCard) {
        console.error('[Filter] Filter card element not found during UI initialization');
        return;
    }

    if (aidRequestsStore.debug) console.log('[Filter] Initializing UI event handlers');

    // Add event listeners to all checkboxes (including group checkboxes)
    const allCheckboxes = filterCard.querySelectorAll('.filter-checkbox, [id^="status-group-filter-"]');
    if (aidRequestsStore.debug) {
        console.log('[Filter] Found checkboxes:', {
            total: allCheckboxes.length,
            ids: Array.from(allCheckboxes).map(cb => cb.id)
        });
    }

    allCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
        if (aidRequestsStore.debug) {
            console.log('[Filter] Added change handler to:', checkbox.id);
        }
    });

    // Add event listener to reset button
    const resetButton = filterCard.querySelector('#reset-all-filters');
    if (resetButton) {
        resetButton.addEventListener('click', handleResetClick);
        if (aidRequestsStore.debug) {
            console.log('[Filter] Added reset handler to button');
        }
    } else {
        console.error('[Filter] Reset button not found with ID: reset-all-filters');
    }

    if (aidRequestsStore.debug) {
        console.log('[Filter] UI initialization complete');
    console.timeEnd('ui-initialization');
    }
}

// Validation
function validateInitialState() {
    if (!aidRequestsStore.debug) return;

    console.time('validation');
    if (aidRequestsStore.debug) console.log('[Filter] Validating initial state...');

    const filterCard = aidRequestsStore.elements.filterCard;
    validateCheckboxStates(filterCard);
    validateCountsWithTemplate();

    console.timeEnd('validation');
}

function validateCheckboxStates(filterCard) {
    // Validate status checkboxes
    filterCard.querySelectorAll('[data-group="active"]').forEach(checkbox => {
        if (!checkbox.checked) {
            console.warn(`[Filter] Active status checkbox ${checkbox.id} should be checked initially`);
        }
    });

    filterCard.querySelectorAll('[data-group="inactive"]').forEach(checkbox => {
        if (checkbox.checked) {
            console.warn(`[Filter] Inactive status checkbox ${checkbox.id} should be unchecked initially`);
        }
    });

    // Validate aid type and priority checkboxes
    ['aid_type', 'priority'].forEach(type => {
        const allCheckbox = filterCard.querySelector(`#${type}-filter-all`);
        const typeCheckboxes = filterCard.querySelectorAll(`[data-filter-type="${type}"]:not([id="${type}-filter-all"])`);

        if (allCheckbox && !allCheckbox.checked) {
            console.warn(`[Filter] ${type} "All" checkbox should be checked initially`);
        }

        typeCheckboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                console.warn(`[Filter] ${type} checkbox ${checkbox.id} should be checked initially`);
            }
        });
    });
}

function validateCountsWithTemplate() {
    console.time('counts-validation');
    if (aidRequestsStore.debug) console.log('[Filter] Comparing counts with template...');

    const serverCounts = aidRequestsStore.data.serverCounts;
    const countElements = {
        total: document.getElementById('results-counter'),
        activeTotal: document.querySelector('#status-group-filter-active-total'),
        inactiveTotal: document.querySelector('#status-group-filter-inactive-total')
    };

    // Build comparison data
    const comparisonData = [
        // Total requests comparison
        {
            category: 'Total Requests',
            server: serverCounts.total,
            displayed: parseInt(countElements.total?.textContent.match(/(\d+)/)?.[1] || '0')
        },
        // Group totals comparison
        ...['active', 'inactive'].map(group => ({
            category: `${group.charAt(0).toUpperCase() + group.slice(1)} Group`,
            server: serverCounts.byGroup[group],
            displayed: parseInt(countElements[`${group}Total`]?.textContent.match(/\((\d+)\)/)?.[1] || '0')
        }))
    ];

    // Add match indicators
    comparisonData.forEach(row => {
        row.matches = row.server === row.displayed ? '✓' : '❌';
    });

    // Log results
    console.table(comparisonData);
    const mismatches = comparisonData.filter(row => row.matches === '❌');
    if (mismatches.length > 0) {
        console.warn('[Filter] Found count mismatches:', mismatches);
    }

    console.timeEnd('counts-validation');
}

function handleCheckboxChange(checkboxEvent) {
    const checkbox = checkboxEvent.target;
    const filterType = checkbox.dataset.filterType;

    if (aidRequestsStore.debug) console.log('[Filter] Checkbox changed:', {
        id: checkbox.id,
        checked: checkbox.checked,
        filterType,
        dataset: checkbox.dataset
    });

    // Handle different types of checkboxes
    if (filterType === 'status_group') {
        // Handle group checkbox (active/inactive)
        const group = checkbox.dataset.filterValue; // 'active' or 'inactive'
        const statusCheckboxes = aidRequestsStore.elements.filterCard
            .querySelectorAll(`input[data-filter-type="status"][data-group="${group}"]`);

        if (aidRequestsStore.debug) {
            console.log('[Filter] Updating status group:', {
                group,
                newState: checkbox.checked,
                foundCheckboxes: statusCheckboxes.length
            });
        }

        // Update all status checkboxes in this group
        statusCheckboxes.forEach(statusCheckbox => {
            statusCheckbox.checked = checkbox.checked;
        });
    } else if (filterType === 'status') {
        // Handle individual status checkbox
        const group = checkbox.dataset.group; // 'active' or 'inactive'
        const groupCheckbox = aidRequestsStore.elements.filterCard
            .querySelector(`#status-group-filter-${group}`);
        const groupStatusCheckboxes = aidRequestsStore.elements.filterCard
            .querySelectorAll(`input[data-filter-type="status"][data-group="${group}"]`);

        // Update group checkbox state
        const checkedCount = Array.from(groupStatusCheckboxes).filter(cb => cb.checked).length;
        groupCheckbox.checked = checkedCount === groupStatusCheckboxes.length;
        groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupStatusCheckboxes.length;

        if (aidRequestsStore.debug) {
            console.log('[Filter] Updated group state:', {
                group,
                checkedCount,
                total: groupStatusCheckboxes.length,
                groupState: {
                    checked: groupCheckbox.checked,
                    indeterminate: groupCheckbox.indeterminate
                }
            });
        }
    } else if (checkbox.id.endsWith('-all')) {
        // Handle "All" checkbox for aid types and priorities
        handleAllCheckbox(checkbox);
    } else {
        // Handle individual aid type and priority checkboxes
        handleIndividualCheckbox(checkbox);
    }

    // Get current filter state and update counts
    const filterState = getFilterState();
    const counts = getFilteredCounts(aidRequestsStore.data.aidRequests, filterState);
    updateCountsDisplay(counts);

    // Dispatch event for other components
    const filterChangeEvent = new CustomEvent('aidRequestsFiltered', {
        detail: { filterState, counts }
    });
    document.dispatchEvent(filterChangeEvent);

    if (aidRequestsStore.debug) console.log('[Filter] Filter change complete');
}

function handleAllCheckbox(allCheckbox) {
    const filterType = allCheckbox.dataset.filterType;
    const relatedCheckboxes = aidRequestsStore.elements.filterCard
        .querySelectorAll(`[data-filter-type="${filterType}"]:not([id$="-all"])`);

    relatedCheckboxes.forEach(checkbox => {
        checkbox.checked = allCheckbox.checked;
    });

    if (aidRequestsStore.debug) console.log('[Filter] Updated related checkboxes:', {
        filterType,
        checked: allCheckbox.checked,
        count: relatedCheckboxes.length
    });
}

function handleIndividualCheckbox(checkbox) {
    const filterType = checkbox.dataset.filterType;

    // Skip "All" checkbox handling for status groups
    if (filterType === 'status_group') {
        if (aidRequestsStore.debug) {
            console.log('[Filter] Status group checkbox clicked, skipping "All" checkbox handling');
        }
        return;
    }

    // Convert aid_type to aid-type for ID matching
    const allCheckboxId = filterType === 'aid_type' ? 'aid-type-filter-all' : `${filterType}-filter-all`;
    const allCheckbox = aidRequestsStore.elements.filterCard.querySelector(`#${allCheckboxId}`);

    if (!allCheckbox) {
        console.warn(`[Filter] All checkbox not found for ${filterType}`);
        return;
    }

    const relatedCheckboxes = aidRequestsStore.elements.filterCard
        .querySelectorAll(`[data-filter-type="${filterType}"]:not([id$="-all"])`);

    // Update "All" checkbox state
    const checkedCount = Array.from(relatedCheckboxes).filter(cb => cb.checked).length;

    if (checkedCount === relatedCheckboxes.length) {
        allCheckbox.checked = true;
        allCheckbox.indeterminate = false;
    } else if (checkedCount === 0) {
        allCheckbox.checked = false;
        allCheckbox.indeterminate = false;
    } else {
        allCheckbox.checked = false;
        allCheckbox.indeterminate = true;
    }

    if (aidRequestsStore.debug) console.log('[Filter] Updated "All" checkbox state:', {
        filterType,
        checkedCount,
        total: relatedCheckboxes.length,
        allCheckboxState: {
            checked: allCheckbox.checked,
            indeterminate: allCheckbox.indeterminate
        }
    });
}

function handleResetClick(resetEvent) {
    if (aidRequestsStore.debug) console.log('[Filter] Reset button clicked');
    console.time('reset-filters');

    const filterCard = aidRequestsStore.elements.filterCard;
    if (!filterCard) {
        console.error('[Filter] Filter card not found for reset');
        return;
    }

    // Reset status checkboxes to default state
    // Active statuses should be checked, inactive unchecked
    const activeStatusCheckboxes = filterCard.querySelectorAll('[data-filter-type="status"][data-group="active"]');
    const inactiveStatusCheckboxes = filterCard.querySelectorAll('[data-filter-type="status"][data-group="inactive"]');

    // Set active statuses to checked
    activeStatusCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
        if (aidRequestsStore.debug) console.log(`[Filter] Reset active status: ${checkbox.dataset.filterValue} to checked`);
    });

    // Set inactive statuses to unchecked
    inactiveStatusCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
        if (aidRequestsStore.debug) console.log(`[Filter] Reset inactive status: ${checkbox.dataset.filterValue} to unchecked`);
    });

    // Update status group checkboxes
    const activeGroupCheckbox = filterCard.querySelector('#status-group-filter-active');
    const inactiveGroupCheckbox = filterCard.querySelector('#status-group-filter-inactive');

    if (activeGroupCheckbox) {
        activeGroupCheckbox.checked = true;
        activeGroupCheckbox.indeterminate = false;
    }
    if (inactiveGroupCheckbox) {
        inactiveGroupCheckbox.checked = false;
        inactiveGroupCheckbox.indeterminate = false;
    }

    // Reset aid type checkboxes - all should be checked
    const aidTypeAll = filterCard.querySelector('#aid-type-filter-all');
    const aidTypeCheckboxes = filterCard.querySelectorAll('[data-filter-type="aid_type"]:not([id$="-all"])');

    if (aidTypeAll) {
        aidTypeAll.checked = true;
        aidTypeAll.indeterminate = false;
    }
    aidTypeCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
        if (aidRequestsStore.debug) console.log(`[Filter] Reset aid type: ${checkbox.dataset.filterValue} to checked`);
    });

    // Reset priority checkboxes - all should be checked
    const priorityAll = filterCard.querySelector('#priority-filter-all');
    const priorityCheckboxes = filterCard.querySelectorAll('[data-filter-type="priority"]:not([id$="-all"])');

    if (priorityAll) {
        priorityAll.checked = true;
        priorityAll.indeterminate = false;
    }
    priorityCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
        if (aidRequestsStore.debug) console.log(`[Filter] Reset priority: ${checkbox.dataset.filterValue} to checked`);
    });

    if (aidRequestsStore.debug) console.log('[Filter] Filters reset to initial state');
    console.timeEnd('reset-filters');

    // Get current filter state
    const filterState = getFilterState();

    // Calculate new counts based on current filter state
    const counts = getFilteredCounts(aidRequestsStore.data.aidRequests, filterState);

    // Update display with new counts
    updateCountsDisplay(counts);

    // Dispatch event for other components
    const filterChangeEvent = new CustomEvent('aidRequestsFiltered', {
        detail: { filterState, counts }
    });
    document.dispatchEvent(filterChangeEvent);

    if (aidRequestsStore.debug) {
        console.log('[Filter] Reset complete:', {
            filterState,
            counts
        });
    }
}

function calculateTotals() {
    if (aidRequestsStore.debug) {
        startTimer('totals-calculation');
        console.log('[Totals] Calculating totals...');
    }

    const { aidRequests } = aidRequestsStore.data;
    if (!aidRequests || !aidRequests.length) {
        console.error('[Totals] No aid requests data available');
        return;
    }

    // Get current filter state
    const checkedStatuses = getSelectedStatuses();
    const checkedAidTypes = getSelectedAidTypes();
    const checkedPriorities = getSelectedPriorities();

    if (aidRequestsStore.debug) {
        console.log('[Totals] Current filter state:', {
            statuses: checkedStatuses,
            aidTypes: checkedAidTypes,
            priorities: checkedPriorities
        });
    }

    // Initialize counts structure
    const counts = {
        total: aidRequests.length,
        matched: 0,
        byStatus: {},
        byAidType: {},
        byPriority: {},
        groups: {
            active: { filtered: 0 },
            inactive: { filtered: 0 }
        }
    };

    // First pass: Initialize count structures
    aidRequests.forEach(request => {
        // Initialize status counts
        if (!counts.byStatus[request.status]) {
            counts.byStatus[request.status] = {
                total: 0,
                filtered: 0,
                selected: checkedStatuses === 'all' || checkedStatuses.includes(request.status)
            };
        }
        counts.byStatus[request.status].total++;

        // Initialize aid type counts
        if (!counts.byAidType[request.aid_type.slug]) {
            counts.byAidType[request.aid_type.slug] = {
                total: 0,
                filtered: 0,
                selected: checkedAidTypes === 'all' || checkedAidTypes.includes(request.aid_type.slug)
            };
        }
        counts.byAidType[request.aid_type.slug].total++;

        // Initialize priority counts
        if (!counts.byPriority[request.priority]) {
            counts.byPriority[request.priority] = {
                total: 0,
                filtered: 0,
                selected: checkedPriorities === 'all' || checkedPriorities.includes(request.priority)
            };
        }
        counts.byPriority[request.priority].total++;
    });

    // Second pass: Calculate filtered counts
    aidRequests.forEach(request => {
        const matchesStatus = checkedStatuses === 'all' || checkedStatuses.includes(request.status);
        const matchesAidType = checkedAidTypes === 'all' || checkedAidTypes.includes(request.aid_type.slug);
        const matchesPriority = checkedPriorities === 'all' || checkedPriorities.includes(request.priority);

        // Update filtered counts based on other filters
        if (matchesAidType && matchesPriority) {
            counts.byStatus[request.status].filtered++;
            // Only add to group total if the status is selected
            if (counts.byStatus[request.status].selected) {
            if (aidRequestsStore.statusGroups.active.includes(request.status)) {
                counts.groups.active.filtered++;
            } else if (aidRequestsStore.statusGroups.inactive.includes(request.status)) {
                counts.groups.inactive.filtered++;
            }
            }
        }

        if (matchesStatus && matchesPriority) {
            counts.byAidType[request.aid_type.slug].filtered++;
        }

        if (matchesStatus && matchesAidType) {
            counts.byPriority[request.priority].filtered++;
        }

        // Update total matches
        if (matchesStatus && matchesAidType && matchesPriority) {
            counts.matched++;
        }
    });

    if (aidRequestsStore.debug) {
        endTimer('totals-calculation');
        console.log('[Totals] Updated counts:', counts);
    }

    // Update the store with new counts
    aidRequestsStore.data.counts = counts;
}

function applyFilters() {
    const { filterState, data } = aidRequestsStore;

    // Reset filtered counts
    Object.values(data.counts.byStatus).forEach(count => count.filtered = 0);
    Object.values(data.counts.byAidType).forEach(count => count.filtered = 0);
    Object.values(data.counts.byPriority).forEach(count => count.filtered = 0);
    data.counts.groups.active.filtered = 0;
    data.counts.groups.inactive.filtered = 0;

    if (aidRequestsStore.debug) {
        console.log('[Apply Filters] Current filter state:', filterState);
    }

    // Count matching requests
    data.counts.matched = data.aidRequests.reduce((count, request) => {
        const matchesStatus = filterState.statuses === 'all' || filterState.statuses.includes(request.status);
        const matchesAidType = filterState.aidTypes === 'all' || filterState.aidTypes.includes(request.aid_type.slug);
        const matchesPriority = filterState.priorities === 'all' || filterState.priorities.includes(request.priority);

        const matches = matchesStatus && matchesAidType && matchesPriority;
        if (matches) {
            // Update filtered counts
            data.counts.byStatus[request.status].filtered++;
            data.counts.byAidType[request.aid_type.slug].filtered++;
            data.counts.byPriority[request.priority].filtered++;

            // Update group filtered counts
            const group = Object.entries(aidRequestsStore.statusGroups)
                .find(([_, statuses]) => statuses.includes(request.status))?.[0];
            if (group) {
                data.counts.groups[group].filtered++;
            }
            return count + 1;
        }
        return count;
    }, 0);

    // Dispatch event for other components
    const event = new CustomEvent('aidRequestsFiltered', {
        detail: {
            filterState: filterState,
            counts: data.counts
        }
    });
    document.dispatchEvent(event);

    if (aidRequestsStore.debug) {
        console.log('[Apply Filters] Updated counts:', data.counts);
    }
}

function getFilterState() {
    if (aidRequestsStore.debug) console.log('[Filter] Getting current filter state');

    const filterState = {
        statuses: null,
        aidTypes: null,
        priorities: null
    };

    // Get status filters - collect all checked statuses
    const checkedStatuses = Array.from(
        aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="status"]:checked')
    ).map(cb => cb.dataset.filterValue);

    // Set statuses to null if none selected, otherwise use the array
    filterState.statuses = checkedStatuses.length > 0 ? checkedStatuses : null;

    // Get aid type filters
    const aidTypeAll = aidRequestsStore.elements.filterCard.querySelector('#aid-type-filter-all');
    if (aidTypeAll?.checked) {
        filterState.aidTypes = 'all';
    } else {
        const checkedAidTypes = Array.from(
            aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="aid_type"]:checked:not([id$="-all"])')
        ).map(cb => {
            const value = cb.dataset.filterValue;
            // Normalize: any form of none/null becomes null in the filter state
            return value === 'none' || value === 'null' ? null : value;
        });
        // Set aidTypes to null if none selected, otherwise use the array
        filterState.aidTypes = checkedAidTypes.length > 0 ? checkedAidTypes : null;
    }

    // Get priority filters
    const priorityAll = aidRequestsStore.elements.filterCard.querySelector('#priority-filter-all');
    if (priorityAll?.checked) {
        filterState.priorities = 'all';
    } else {
        const checkedPriorities = Array.from(
            aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="priority"]:checked:not([id$="-all"])')
        ).map(cb => {
            const value = cb.dataset.filterValue;
            // Normalize: any form of none/null becomes null in the filter state
            return value === 'none' || value === 'null' ? null : value;
        });
        // Set priorities to null if none selected, otherwise use the array
        filterState.priorities = checkedPriorities.length > 0 ? checkedPriorities : null;
    }

    if (aidRequestsStore.debug) console.log('[Filter] Current filter state:', filterState);
    return filterState;
}

function getSelectedStatuses() {
    if (aidRequestsStore.debug) console.log('Getting selected statuses...');

    // Get all status checkboxes (both active and inactive)
    const allStatusCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="status"]:not([id*="group-filter"])');
    const checkedStatusCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="status"]:checked:not([id*="group-filter"])');

    // If all status checkboxes are checked, return 'all'
    if (allStatusCheckboxes.length === checkedStatusCheckboxes.length) {
        if (aidRequestsStore.debug) {
            console.log('All statuses selected, returning "all"');
        }
        return 'all';
    }

    const statuses = Array.from(checkedStatusCheckboxes).map(cb => cb.getAttribute('data-filter-value'));
    if (aidRequestsStore.debug) {
        console.log('Selected statuses:', statuses);
    }
    return statuses;
}

function getSelectedAidTypes() {
    if (aidRequestsStore.debug) {
        console.log('Getting selected aid types...');
    }

    // Get all individual aid type checkboxes
    const allAidTypeCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="aid_type"]:not([id="aid-type-filter-all"])');
    const checkedAidTypeCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="aid_type"]:checked:not([id="aid-type-filter-all"])');

    // If all individual checkboxes are checked, return 'all'
    if (allAidTypeCheckboxes.length === checkedAidTypeCheckboxes.length) {
        if (aidRequestsStore.debug) {
            console.log('All aid types selected, returning "all"');
        }
        return 'all';
    }

    // Return array of checked aid type values
    const aidTypes = Array.from(checkedAidTypeCheckboxes).map(cb => cb.getAttribute('data-filter-value'));
    if (aidRequestsStore.debug) {
        console.log('Selected aid types:', aidTypes);
    }
    return aidTypes;
}

function getSelectedPriorities() {
    if (aidRequestsStore.debug) {
        console.log('Getting selected priorities...');
    }

    // Get all individual priority checkboxes
    const allPriorityCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="priority"]:not([id="priority-filter-all"])');
    const checkedPriorityCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll('[data-filter-type="priority"]:checked:not([id="priority-filter-all"])');

    // If all individual checkboxes are checked, return 'all'
    if (allPriorityCheckboxes.length === checkedPriorityCheckboxes.length) {
        if (aidRequestsStore.debug) {
            console.log('All priorities selected, returning "all"');
        }
        return 'all';
    }

    // Return array of checked priority values, handling null/none values
    const priorities = Array.from(checkedPriorityCheckboxes).map(cb => {
        const value = cb.getAttribute('data-filter-value');
        // Convert 'none' back to null for the backend
        return value === 'none' ? null : value;
    });
    if (aidRequestsStore.debug) {
        console.log('Selected priorities:', priorities);
    }
    return priorities;
}

function updateCountsDisplay(counts) {
    if (aidRequestsStore.debug) {
    console.time('display-update');
    }

    const filterCard = aidRequestsStore.elements.filterCard;
    if (!filterCard) {
        console.error('[Filter] Filter card element not found');
        return;
    }

    // Validate counts structure
    if (!counts.byAidType || !counts.byPriority) {
        console.error('[Filter] Invalid counts structure:', counts);
        return;
    }

    if (aidRequestsStore.debug) console.log('[Filter] Updating display with counts:', counts);

    // Update results counter
    const resultsCounter = filterCard.querySelector('#results-counter');
    if (resultsCounter) {
        resultsCounter.textContent = `${counts.matched} of ${counts.total} locations`;

        // Update badge classes based on count
        resultsCounter.classList.remove('badge-success', 'badge-warning', 'badge-danger');
        if (counts.matched === counts.total) {
            resultsCounter.classList.add('badge-success');
        } else if (counts.matched === 0) {
            resultsCounter.classList.add('badge-danger');
        } else {
            resultsCounter.classList.add('badge-warning');
        }
    }

    // Update status group totals and individual status counts
    ['active', 'inactive'].forEach(group => {
        const groupTotal = filterCard.querySelector(`#status-group-filter-${group}-total`);
        if (groupTotal) {
            const total = counts.groups[group].filtered;
            groupTotal.textContent = `(${total})`;
            if (aidRequestsStore.debug) console.log(`[Filter] Updated ${group} group total:`, total);
        }

        // Update individual status counts
        if (counts.groups[group].statuses) {
            counts.groups[group].statuses.forEach(status => {
                const countElement = filterCard.querySelector(`#status-filter-${status.slug}-count`);
                if (countElement) {
                    countElement.textContent = `(${status.filtered})`;
                    if (aidRequestsStore.debug) console.log(`[Filter] Updated status count for ${status.slug}:`, status.filtered);
                }
            });
        }
    });
    if (aidRequestsStore.debug) console.log('[Filter] Status group counts:', counts.groups);

    // Update aid type counts and total
    let aidTypeTotal = 0;
    Object.entries(counts.byAidType).forEach(([slug, data]) => {
        const selector = `#aid-type-${slug}-count`;
        const countElement = filterCard.querySelector(selector);
        if (countElement) {
            countElement.textContent = `(${data.filtered})`;
            if (aidRequestsStore.debug) console.log(`[Filter] Updated aid type count for ${slug}:`, data.filtered);

            // Only add to total if this aid type is selected
            const checkbox = filterCard.querySelector(`#aid-type-filter-${slug}`);
            if (checkbox?.checked) {
                aidTypeTotal += data.filtered;
            }
        } else if (aidRequestsStore.debug) {
            // Only log if debug is enabled and we're actually looking for this element
            const checkbox = filterCard.querySelector(`#aid-type-filter-${slug}`);
            if (checkbox) {
            console.warn(`[Filter] Aid type count element not found for selector: ${selector}`);
            }
        }
    });

    // Update aid type "All" label with total
    const aidTypeAllLabel = filterCard.querySelector('label[for="aid-type-filter-all"]');
    if (aidTypeAllLabel) {
        aidTypeAllLabel.textContent = `All (${aidTypeTotal})`;
        if (aidRequestsStore.debug) console.log('[Filter] Updated aid type total:', aidTypeTotal);
    }
    if (aidRequestsStore.debug) console.log('[Filter] Aid type counts:', counts.byAidType);

    // Update priority counts and total
    let priorityTotal = 0;
    Object.entries(counts.byPriority).forEach(([value, data]) => {
        const slug = value === 'null' ? 'none' : value;
        const selector = `#priority-${slug}-count`;
        const countElement = filterCard.querySelector(selector);
        if (countElement) {
            countElement.textContent = `(${data.filtered})`;
            if (aidRequestsStore.debug) console.log(`[Filter] Updated priority count for ${slug}:`, data.filtered);

            // Only add to total if this priority is selected
            const checkbox = filterCard.querySelector(`#priority-filter-${slug}`);
            if (checkbox?.checked) {
                priorityTotal += data.filtered;
            }
        } else if (aidRequestsStore.debug) {
            // Only log if debug is enabled and we're actually looking for this element
            const checkbox = filterCard.querySelector(`#priority-filter-${slug}`);
            if (checkbox) {
            console.warn(`[Filter] Priority count element not found for selector: ${selector}`);
            }
        }
    });

    // Update priority "All" label with total
    const priorityAllLabel = filterCard.querySelector('label[for="priority-filter-all"]');
    if (priorityAllLabel) {
        priorityAllLabel.textContent = `All (${priorityTotal})`;
        if (aidRequestsStore.debug) console.log('[Filter] Updated priority total:', priorityTotal);
    }
    if (aidRequestsStore.debug) console.log('[Filter] Priority counts:', counts.byPriority);

    if (aidRequestsStore.debug) {
        console.log('[Filter] Display update complete');
    console.timeEnd('display-update');
    }
}

function formatFilteredCount(filtered, total) {
    return `${filtered} of ${total} locations`;
}

// Add AJAX update handler
function handleAidRequestUpdate(fieldOpSlug, requestId, updates) {
    if (window.aidRequestsStore.debug) {
        console.log(`Sending update for aid request ${requestId}:`, {
            fieldOpSlug,
            updates,
            currentStore: { ...window.aidRequestsStore.data }
        });
    }

    fetch(`/aidrequests/${fieldOpSlug}/update/${requestId}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
        },
        body: JSON.stringify(updates)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (window.aidRequestsStore.debug) {
                console.log(`Successfully updated aid request ${requestId}:`, {
                    oldData: window.aidRequestsStore.data.aidRequests.find(r => r.pk === requestId || r.id === requestId),
                    newData: data
                });
            }
            // Update the store with the new data
            window.aidRequestsStore.updateAidRequest(requestId, {
                status: data.status,
                status_display: data.status_display,
                priority: data.priority,
                priority_display: data.priority_display
            });
        } else {
            console.error('Error updating aid request:', data.error);
        }
    })
    .catch(error => {
        console.error('Error updating aid request:', error);
    });
}

// Helper functions
function determineCheckboxGroupState(checkboxes) {
    const total = checkboxes.length;
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

    return {
        allSelected: checkedCount === total,
        someSelected: checkedCount > 0 && checkedCount < total,
        noneSelected: checkedCount === 0,
        count: checkedCount,
        total: total
    };
}

function updateParentCheckboxState(parentCheckbox, childCheckboxes) {
    // Guard against null parent checkbox
    if (!parentCheckbox) {
        if (aidRequestsStore.debug) {
            console.warn('Parent checkbox not found, skipping state update');
        }
        return;
    }

    const state = determineCheckboxGroupState(childCheckboxes);
    const label = parentCheckbox.nextElementSibling;

    if (!label) {
        console.warn('Label not found for parent checkbox');
        return;
    }

    // Get the count span, create it if it doesn't exist
    let countSpan = label.querySelector('.text-muted');
    if (!countSpan) {
        countSpan = document.createElement('span');
        countSpan.className = 'text-muted ms-1';
        label.appendChild(countSpan);
    }

    // Check if this is a status group checkbox
    const isStatusGroup = parentCheckbox.id.includes('status-group-filter');

    // Update checkbox state
    if (state.allSelected) {
        parentCheckbox.checked = true;
        parentCheckbox.indeterminate = false;
        if (!isStatusGroup) {
            label.firstChild.textContent = 'All ';
        }
    } else if (state.someSelected) {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = true;
        if (!isStatusGroup) {
            label.firstChild.textContent = 'Some ';
        }
    } else {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = false;
        if (!isStatusGroup) {
            label.firstChild.textContent = 'None ';
        }
    }

    if (aidRequestsStore.debug) {
        console.log(`Parent checkbox ${parentCheckbox.id} state:`, {
            checked: parentCheckbox.checked,
            indeterminate: parentCheckbox.indeterminate,
            groupState: state,
            labelText: label.firstChild.textContent,
            isStatusGroup
        });
    }
}

function calculateServerCounts() {
    if (aidRequestsStore.debug) {
        console.time('server-counts');
        console.log('[Server Counts] Calculating initial counts...');
    }

    // Initial filter state matches the checkbox states:
    // - Active statuses are checked
    // - Inactive statuses are unchecked
    // - All aid types are checked
    // - All priorities are checked
    const initialFilterState = {
        statuses: aidRequestsStore.statusGroups.active,  // Only active statuses
        aidTypes: 'all',                                // All aid types selected
        priorities: 'all'                               // All priorities selected
    };

    if (aidRequestsStore.debug) {
        console.log('[Server Counts] Using initial filter state:', initialFilterState);
    }

    // Use the same filtered counts function to ensure consistency
    const counts = getFilteredCounts(aidRequestsStore.data.aidRequests, initialFilterState);

    if (aidRequestsStore.debug) {
        console.log('[Server Counts] Calculated:', counts);
        console.timeEnd('server-counts');
    }

    return counts;
}

function getFilteredCounts(aidRequests, filterState) {
    if (aidRequestsStore.debug) {
    console.time('count-calculation');
    }

    if (aidRequestsStore.debug) console.log('[Filter] Calculating filtered counts with state:', filterState);

    // Initialize counts structure
    const counts = {
        total: aidRequests.length,
        matched: 0,
        groups: {
            active: {
                filtered: 0,
                statuses: aidRequestsStore.statusGroups.active.map(status => ({
                    slug: status,
                    filtered: 0,
                    checked: filterState.statuses ? filterState.statuses.includes(status) : false
                }))
            },
            inactive: {
                filtered: 0,
                statuses: aidRequestsStore.statusGroups.inactive.map(status => ({
                    slug: status,
                    filtered: 0,
                    checked: filterState.statuses ? filterState.statuses.includes(status) : false
                }))
            }
        },
        byAidType: Object.keys(aidRequestsStore.data.aidTypes).reduce((acc, slug) => {
            acc[slug] = { filtered: 0, total: 0 };
            return acc;
        }, {}),
        byPriority: Object.keys(aidRequestsStore.data.priorityChoices).reduce((acc, value) => {
            acc[value === 'null' ? null : value] = { filtered: 0, total: 0 };
            return acc;
        }, {})
    };

    // Calculate all counts in a single pass
    aidRequests.forEach(request => {
        // Find which group this status belongs to
        const group = Object.entries(aidRequestsStore.statusGroups)
            .find(([_, statuses]) => statuses.includes(request.status))?.[0];

        if (!group) {
            console.warn(`[Filter] Unknown status group for status: ${request.status}`);
            return;
        }

        // Handle null filter states - if a filter is null, nothing matches it
        const matchesStatus = filterState.statuses === 'all' || (filterState.statuses && filterState.statuses.includes(request.status));
        const matchesAidType = filterState.aidTypes === 'all' || (filterState.aidTypes && filterState.aidTypes.includes(request.aid_type.slug));
        const matchesPriority = filterState.priorities === 'all' || (filterState.priorities && filterState.priorities.includes(request.priority));

        // Always update status filtered counts for display
        const status = counts.groups[group].statuses.find(s => s.slug === request.status);
        if (status && matchesAidType && matchesPriority) {
            status.filtered++;
            // Only add to group total if the status is checked
            if (status.checked) {
                counts.groups[group].filtered++;
            }
        }

        // Update aid type counts
        const aidTypeKey = request.aid_type.slug;
        if (counts.byAidType[aidTypeKey]) {
            counts.byAidType[aidTypeKey].total++;
            // For aid types, we want to show potential matches with selected statuses
            if (matchesStatus && matchesPriority) {
                counts.byAidType[aidTypeKey].filtered++;
            }
        }

        // Update priority counts
        const priorityKey = request.priority === null ? 'null' : request.priority;
        if (counts.byPriority[priorityKey]) {
            counts.byPriority[priorityKey].total++;
            // For priorities, we want to show potential matches with selected statuses
            if (matchesStatus && matchesAidType) {
                counts.byPriority[priorityKey].filtered++;
            }
        }

        // Update total matches - only count items that match all selected filters
        // If any filter is null, no items will match
        if (filterState.statuses !== null && filterState.aidTypes !== null && filterState.priorities !== null &&
            matchesStatus && matchesAidType && matchesPriority) {
            counts.matched++;
        }
    });

    if (aidRequestsStore.debug) {
        console.log('[Filter] Status counts:', {
            active: counts.groups.active.statuses.map(s => `${s.slug}: ${s.filtered} (${s.checked ? 'checked' : 'unchecked'})`),
            inactive: counts.groups.inactive.statuses.map(s => `${s.slug}: ${s.filtered} (${s.checked ? 'checked' : 'unchecked'})`)
        });
        console.log('[Filter] Group totals:', {
            active: counts.groups.active.filtered,
            inactive: counts.groups.inactive.filtered
        });
        console.log('[Filter] Aid type counts:', counts.byAidType);
        console.log('[Filter] Priority counts:', counts.byPriority);
    }
    if (aidRequestsStore.debug) {
    console.timeEnd('count-calculation');
    }

    return counts;
}
