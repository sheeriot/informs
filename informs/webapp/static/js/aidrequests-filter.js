/**
 * status-filter.js
 *
 * Handles status filter interactions and state management
 * Provides checkbox group behavior and filter event triggering
 */

// Configuration object
window.aidRequestsStore = {
    debug: true,  // Set to false in production
    // Status group lookup table - maps status codes to their group (active/inactive)
    statusGroups: {
        active: ['new', 'assigned', 'resolved'],
        inactive: ['closed', 'rejected', 'other']
    },
    // Store the actual data
    data: {
        aidRequests: [],
        aidTypes: {},
        priorityChoices: {},  // Will store priority lookup
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
    // Store DOM elements
    elements: {
        filterCard: null
    },

    // Add methods to handle updates
    updateAidRequest: function(id, updates) {
        if (this.debug) {
            console.log(`Updating aid request ${id} with:`, updates);
        }

        // Find the aid request in our data
        const request = this.data.aidRequests.find(req => req.pk === id || req.id === id);
        if (!request) {
            console.error(`Aid request ${id} not found in store`);
            return;
        }

        // Store old values for recounting
        const oldStatus = request.status;
        const oldPriority = request.priority;

        // Update the request
        Object.assign(request, updates);

        // Recalculate counts
        this.recalculateCounts({
            id: id,
            oldStatus,
            newStatus: updates.status,
            oldPriority,
            newPriority: updates.priority
        });

        // Reapply filters to update visibility
        this.applyFilters();

        // Dispatch update event for other components
        const event = new CustomEvent('aidRequestUpdated', {
            detail: {
                id: id,
                updates: updates,
                request: request,
                filterState: this.filterState,
                counts: this.data.counts
            }
        });
        document.dispatchEvent(event);
    },

    recalculateCounts: function(change) {
        const counts = this.data.counts;

        if (change.oldStatus !== change.newStatus) {
            // Update status counts
            if (counts.byStatus[change.oldStatus]) {
                counts.byStatus[change.oldStatus].total--;
                counts.byStatus[change.oldStatus].filtered--;
            }
            if (!counts.byStatus[change.newStatus]) {
                counts.byStatus[change.newStatus] = { total: 0, filtered: 0 };
            }
            counts.byStatus[change.newStatus].total++;
            counts.byStatus[change.newStatus].filtered++;

            // Update group counts
            const oldGroup = Object.entries(this.statusGroups)
                .find(([_, statuses]) => statuses.includes(change.oldStatus))?.[0];
            const newGroup = Object.entries(this.statusGroups)
                .find(([_, statuses]) => statuses.includes(change.newStatus))?.[0];

            if (oldGroup) {
                counts.groups[oldGroup].total--;
                counts.groups[oldGroup].filtered--;
            }
            if (newGroup) {
                counts.groups[newGroup].total++;
                counts.groups[newGroup].filtered++;
            }
        }

        if (change.oldPriority !== change.newPriority) {
            // Update priority counts
            if (counts.byPriority[change.oldPriority]) {
                counts.byPriority[change.oldPriority].total--;
                counts.byPriority[change.oldPriority].filtered--;
            }
            if (!counts.byPriority[change.newPriority]) {
                counts.byPriority[change.newPriority] = { total: 0, filtered: 0 };
            }
            counts.byPriority[change.newPriority].total++;
            counts.byPriority[change.newPriority].filtered++;
        }

        if (this.debug) {
            console.log('Updated counts after change:', this.data.counts);
        }
    }
};

// Main program
document.addEventListener('DOMContentLoaded', function() {
    if (aidRequestsStore.debug) {
        console.log('Initializing aid requests data store...');
    }

    // Initialize filterCard reference first
    aidRequestsStore.elements.filterCard = document.getElementById('aid-request-filter-card');
    if (!aidRequestsStore.elements.filterCard) {
        console.error('[Filter UI] Filter card element not found. Aborting initialization.');
        return;
    }

    // Load initial data from DOM
    initializeDataStore();

    // Initialize filter UI - only add event listeners, no value changes
    initializeFilterUI();

    // Validate initial state matches template
    if (aidRequestsStore.debug) {
        validateInitialState();
    }
});

function initializeDataStore() {

    // Load priority choices
    const priorityChoicesElement = document.getElementById('priority-choices-data');
    if (priorityChoicesElement) {
        try {
            const priorityChoices = JSON.parse(JSON.parse(priorityChoicesElement.textContent));
            aidRequestsStore.data.priorityChoices = priorityChoices.reduce((acc, [value, label]) => {
                acc[value === null ? 'null' : value] = label;
                return acc;
            }, {});
            if (aidRequestsStore.debug) {
                console.log('[Data Store] Loaded priority choices:', aidRequestsStore.data.priorityChoices);
            }
        } catch (error) {
            console.error('[Data Store] Error parsing priority choices:', error);
        }
    }

    // Load aid requests data
    const aidLocationsElement = document.getElementById('aid-locations-data');
    if (aidLocationsElement && aidLocationsElement.textContent.trim()) {
        try {
            const aidRequests = JSON.parse(aidLocationsElement.textContent);
            aidRequestsStore.data.aidRequests = aidRequests;

            if (aidRequestsStore.debug) {
                console.log('[Data Store] Loaded aid requests data:', aidRequests);
            }

            // Get initial server-rendered counts
            const serverCounts = getServerCounts();

            // Initialize counts structure with ALL server counts
            aidRequestsStore.data.counts = {
                total: serverCounts.total,
                matched: serverCounts.total,
                byStatus: serverCounts.byStatus,
                byAidType: serverCounts.byAidType,
                byPriority: serverCounts.byPriority,
                groups: {
                    active: {
                        total: serverCounts.byGroup.active,
                        filtered: serverCounts.byGroup.active
                    },
                    inactive: {
                        total: serverCounts.byGroup.inactive,
                        filtered: serverCounts.byGroup.inactive
                    }
                }
            };

            if (aidRequestsStore.debug) {
                console.log('[Data Store] Status groups:', aidRequestsStore.statusGroups);
                console.log('[Data Store] Initialized store with server counts:', aidRequestsStore.data.counts);
            }
        } catch (error) {
            console.error('[Data Store] Error parsing aid requests data:', error);
        }
    }

    // Load aid types configuration
    const aidTypesElement = document.getElementById('aid-types-json');
    if (aidTypesElement) {
        try {
            const aidTypesArray = JSON.parse(aidTypesElement.textContent);
            aidRequestsStore.data.aidTypes = aidTypesArray.reduce((acc, type) => {
                acc[type.slug] = type;
                return acc;
            }, {});
            if (aidRequestsStore.debug) {
                console.log('[Data Store] Loaded aid types:', aidRequestsStore.data.aidTypes);
            }
        } catch (error) {
            console.error('[Data Store] Error parsing aid types:', error);
        }
    }
}

function calculateTotals() {
    if (aidRequestsStore.debug) {
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
            active: { total: 0, filtered: 0 },
            inactive: { total: 0, filtered: 0 }
        }
    };

    // First pass: calculate total counts for each category
    aidRequests.forEach(request => {
        // Count by status
        if (!counts.byStatus[request.status]) {
            counts.byStatus[request.status] = { total: 0, filtered: 0 };
        }
        counts.byStatus[request.status].total++;

        // Count by group
        if (aidRequestsStore.statusGroups.active.includes(request.status)) {
            counts.groups.active.total++;
        } else if (aidRequestsStore.statusGroups.inactive.includes(request.status)) {
            counts.groups.inactive.total++;
        }

        // Count by aid type
        const aidType = request.aid_type.slug;
        if (!counts.byAidType[aidType]) {
            counts.byAidType[aidType] = { total: 0, filtered: 0 };
        }
        counts.byAidType[aidType].total++;

        // Count by priority
        if (!counts.byPriority[request.priority]) {
            counts.byPriority[request.priority] = { total: 0, filtered: 0 };
        }
        counts.byPriority[request.priority].total++;
    });

    // Second pass: calculate filtered counts based on all filter criteria
    aidRequests.forEach(request => {
        const matchesStatus = checkedStatuses === 'all' || checkedStatuses.includes(request.status);
        const matchesAidType = checkedAidTypes === 'all' || checkedAidTypes.includes(request.aid_type.slug);
        const matchesPriority = checkedPriorities === 'all' || checkedPriorities.includes(request.priority);

        // Only increment filtered counts if ALL criteria match
        if (matchesStatus && matchesAidType && matchesPriority) {
            counts.matched++;

            // Increment filtered counts for each category
            counts.byStatus[request.status].filtered++;
            counts.byAidType[request.aid_type.slug].filtered++;
            counts.byPriority[request.priority].filtered++;

            // Update group filtered counts
            if (aidRequestsStore.statusGroups.active.includes(request.status)) {
                counts.groups.active.filtered++;
            } else if (aidRequestsStore.statusGroups.inactive.includes(request.status)) {
                counts.groups.inactive.filtered++;
            }
        }
    });

    if (aidRequestsStore.debug) {
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

function initializeFilterUI() {
    if (aidRequestsStore.debug) {
        console.log('[Filter UI] Initializing event listeners...');
    }

    // Add event listeners for all checkboxes within the filter card
    aidRequestsStore.elements.filterCard.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });

    // Add event listener for reset button
    const resetButton = aidRequestsStore.elements.filterCard.querySelector('#reset-all-filters');
    if (resetButton) {
        resetButton.addEventListener('click', handleResetClick);
    }
}

function handleCheckboxChange() {
    const filterType = this.dataset.filterType;
    const statusGroup = this.dataset.filterValue;  // for status group checkboxes (active/inactive)
    const group = this.dataset.group;
    const isGroupCheckbox = filterType === 'status_group';

    if (aidRequestsStore.debug) {
        console.log('[Checkbox Change]', {
            id: this.id,
            filterType,
            statusGroup,
            group,
            isGroupCheckbox,
            checked: this.checked
        });
    }

    if (filterType === 'status_group') {
        // When a group checkbox (active/inactive) is clicked
        const groupCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll(`[data-filter-type="status"][data-group="${statusGroup}"]:not([id*="group-filter"])`);
        if (aidRequestsStore.debug) {
            console.log(`[Group Change] Setting ${groupCheckboxes.length} checkboxes in group ${statusGroup} to ${this.checked}`);
        }
        groupCheckboxes.forEach(cb => {
            cb.checked = this.checked;
        });
        this.indeterminate = false;
    } else if (filterType === 'status' && group) {
        // When an individual status checkbox is clicked
        const groupCheckbox = aidRequestsStore.elements.filterCard.querySelector(`#status-group-filter-${group}`);
        const groupCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll(`[data-filter-type="status"][data-group="${group}"]:not([id*="group-filter"])`);
        if (groupCheckboxes.length > 0) {
            updateParentCheckboxState(groupCheckbox, groupCheckboxes);
        }
    } else if (filterType === 'aid_type' || filterType === 'priority') {
        const allCheckboxId = `${filterType === 'aid_type' ? 'aid-type' : filterType}-filter-all`;
        const allCheckbox = aidRequestsStore.elements.filterCard.querySelector(`#${allCheckboxId}`);
        const typeCheckboxes = aidRequestsStore.elements.filterCard.querySelectorAll(`[data-filter-type="${filterType}"]:not([id="${allCheckboxId}"])`);

        if (this.id === allCheckboxId) {
            // If "All" checkbox was clicked, update all child checkboxes
            if (typeCheckboxes.length > 0) {
                typeCheckboxes.forEach(cb => cb.checked = this.checked);
                this.indeterminate = false;
            }
        } else {
            // If individual checkbox was clicked, update "All" checkbox state
            if (typeCheckboxes.length > 0) {
                updateParentCheckboxState(allCheckbox, typeCheckboxes);
            }
        }
    }

    // Calculate new counts and update display
    calculateTotals();
    updateCountsDisplay();
    triggerFilterChange();
}

function handleResetClick() {
    aidRequestsStore.elements.filterCard.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        if (checkbox) {
            // Reset to original state: all checked except inactive status group
            if (checkbox.id.includes('status-group-filter-inactive') ||
                checkbox.dataset.group === 'inactive' ||
                checkbox.id.includes('status-filter-cancelled') ||
                checkbox.id.includes('status-filter-rejected')) {
                checkbox.checked = false;
            } else {
                checkbox.checked = true;
            }
            checkbox.indeterminate = false;
        }
    });

    // Calculate new counts and update display
    calculateTotals();
    updateCountsDisplay();
    triggerFilterChange();
}

function validateInitialState() {
    const filterCard = aidRequestsStore.elements.filterCard;
    if (!filterCard) return;

    console.log('Validating initial state...');

    // Check status checkboxes
    const activeStatuses = filterCard.querySelectorAll('[data-group="active"]');
    const inactiveStatuses = filterCard.querySelectorAll('[data-group="inactive"]');

    activeStatuses.forEach(checkbox => {
        if (!checkbox.checked) {
            console.warn(`Active status checkbox ${checkbox.id} should be checked initially`);
        }
    });

    inactiveStatuses.forEach(checkbox => {
        if (checkbox.checked) {
            console.warn(`Inactive status checkbox ${checkbox.id} should be unchecked initially`);
        }
    });

    // Check aid type and priority checkboxes
    ['aid_type', 'priority'].forEach(type => {
        const allCheckbox = filterCard.querySelector(`#${type}-filter-all`);
        const typeCheckboxes = filterCard.querySelectorAll(`[data-filter-type="${type}"]:not([id="${type}-filter-all"])`);

        if (allCheckbox && !allCheckbox.checked) {
            console.warn(`${type} "All" checkbox should be checked initially`);
        }

        typeCheckboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                console.warn(`${type} checkbox ${checkbox.id} should be checked initially`);
            }
        });
    });
}

// Listen for filter change events
document.addEventListener('aidRequestsFiltered', function(event) {
    if (aidRequestsStore.debug) {
        console.log('Filter change event received:', event.detail);
        console.log('%cFilter State', 'font-weight: bold; color: #2196F3;');

        // Format each filter value safely
        const formatFilterValue = (value) => {
            if (value === 'all') return 'All';
            if (Array.isArray(value)) return value.join(', ') || 'None';
            return 'None';
        };

        console.table({
            'Statuses': formatFilterValue(event.detail.filterState.statuses),
            'Aid Types': formatFilterValue(event.detail.filterState.aidTypes),
            'Priorities': formatFilterValue(event.detail.filterState.priorities)
        });
    }

    // Update row visibility
    if (typeof updateRowVisibility === 'function') {
        updateRowVisibility(event.detail.filterState);
    } else {
        console.error('updateRowVisibility function not found');
    }
});

// Functions
function triggerFilterChange() {
    if (aidRequestsStore.debug) console.log('Filter change triggered');

    // Get selected values for each filter type
    const checkedStatuses = getSelectedStatuses();
    const checkedAidTypes = getSelectedAidTypes();
    const checkedPriorities = getSelectedPriorities();

    if (aidRequestsStore.debug) {
        console.log('Filter State Before Event Emission:', {
            statuses: checkedStatuses,
            aidTypes: checkedAidTypes,
            priorities: checkedPriorities
        });
    }

    // Calculate and update counts
    calculateTotals();
    updateCountsDisplay();

    // Create and dispatch filter event with only specific selected values
    const filterEvent = new CustomEvent('aidRequestsFiltered', {
        detail: {
            filterState: {
                statuses: checkedStatuses,
                aidTypes: checkedAidTypes,
                priorities: checkedPriorities
            }
        }
    });

    if (aidRequestsStore.debug) console.log('Event detail:', filterEvent.detail);

    document.dispatchEvent(filterEvent);
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

// Helper function to format the filtered count display consistently
function formatFilteredCount(filtered, total) {
    return `${filtered} of ${total} requests`;
}

function updateCountsDisplay() {
    if (aidRequestsStore.debug) {
        console.log('[Counts Display] Updating counts display...');
    }

    if (!aidRequestsStore.elements.filterCard) {
        console.error('[Counts Display] Filter card not found');
        return;
    }

    // Get current filter state
    const checkedStatuses = getSelectedStatuses();
    const checkedAidTypes = getSelectedAidTypes();
    const checkedPriorities = getSelectedPriorities();

    // Pre-calculate all counts in a single pass
    const counts = {
        byStatus: {},
        byAidType: {},
        byPriority: {},
        activeTotal: 0,
        inactiveTotal: 0,
        allAidTypesTotal: 0,
        allPrioritiesTotal: 0
    };

    // Initialize count objects
    Object.keys(aidRequestsStore.data.counts.byStatus).forEach(status => {
        counts.byStatus[status] = 0;
    });
    Object.keys(aidRequestsStore.data.counts.byAidType).forEach(type => {
        counts.byAidType[type] = 0;
    });
    Object.keys(aidRequestsStore.data.counts.byPriority).forEach(priority => {
        counts.byPriority[priority] = 0;
    });

    // Single pass through the data to calculate all counts
    aidRequestsStore.data.aidRequests.forEach(request => {
        const matchesStatus = checkedStatuses === 'all' || checkedStatuses.includes(request.status);
        const matchesAidType = checkedAidTypes === 'all' || checkedAidTypes.includes(request.aid_type.slug);
        const matchesPriority = checkedPriorities === 'all' || checkedPriorities.includes(request.priority);

        // Update status counts if other filters match
        if (matchesAidType && matchesPriority) {
            counts.byStatus[request.status]++;
            if (aidRequestsStore.statusGroups.active.includes(request.status)) {
                counts.activeTotal++;
            } else if (aidRequestsStore.statusGroups.inactive.includes(request.status)) {
                counts.inactiveTotal++;
            }
        }

        // Update aid type counts if other filters match
        if (matchesStatus && matchesPriority) {
            counts.byAidType[request.aid_type.slug]++;
            counts.allAidTypesTotal++;
        }

        // Update priority counts if other filters match
        if (matchesStatus && matchesAidType) {
            counts.byPriority[request.priority]++;
            counts.allPrioritiesTotal++;
        }
    });

    // Update results counter
    const resultsCounter = document.getElementById('results-counter');
    if (resultsCounter) {
        const matched = aidRequestsStore.data.counts.matched;
        const total = aidRequestsStore.data.counts.total;
        resultsCounter.textContent = formatFilteredCount(matched, total);

        // Update counter badge classes
        resultsCounter.classList.remove('bg-success', 'bg-warning', 'bg-danger');
        if (matched === total) {
            resultsCounter.classList.add('bg-success');
        } else if (matched === 0) {
            resultsCounter.classList.add('bg-danger');
        } else {
            resultsCounter.classList.add('bg-warning');
        }
    }

    // Update map filter summary
    updateMapFilterSummary();

    // Get current filter state
    const activeGroupCheckbox = aidRequestsStore.elements.filterCard.querySelector('#status-group-filter-active');
    const inactiveGroupCheckbox = aidRequestsStore.elements.filterCard.querySelector('#status-group-filter-inactive');

    // Update status counts
    Object.entries(counts.byStatus).forEach(([status, count]) => {
        const countElement = aidRequestsStore.elements.filterCard.querySelector(`#status-filter-${status}-count`);
        if (countElement) {
            const isActive = aidRequestsStore.statusGroups.active.includes(status);
            const groupCheckbox = isActive ? activeGroupCheckbox : inactiveGroupCheckbox;
            const showFiltered = isActive && groupCheckbox && groupCheckbox.checked;

            const displayCount = showFiltered ?
                aidRequestsStore.data.counts.byStatus[status].filtered :
                count;

            countElement.textContent = `(${displayCount})`;
        }
    });

    // Update group totals
    const activeTotal = aidRequestsStore.elements.filterCard.querySelector('#status-group-filter-active-total');
    const inactiveTotal = aidRequestsStore.elements.filterCard.querySelector('#status-group-filter-inactive-total');

    if (activeTotal) {
        const displayCount = activeGroupCheckbox && activeGroupCheckbox.checked ?
            aidRequestsStore.data.counts.groups.active.filtered :
            counts.activeTotal;
        activeTotal.textContent = `(${displayCount})`;
    }

    if (inactiveTotal) {
        inactiveTotal.textContent = `(${counts.inactiveTotal})`;
    }

    // Update aid type counts
    Object.entries(counts.byAidType).forEach(([aidType, count]) => {
        const countElement = aidRequestsStore.elements.filterCard.querySelector(`#aid-type-${aidType}-count`);
        if (countElement) {
            countElement.textContent = `(${count})`;
        }
    });

    // Update "All" aid types count
    const allAidTypesCount = aidRequestsStore.elements.filterCard.querySelector('#aid-type-filter-all + label');
    if (allAidTypesCount) {
        allAidTypesCount.innerHTML = `All <span class="text-muted">(${counts.allAidTypesTotal})</span>`;
    }

    // Update priority counts
    Object.entries(counts.byPriority).forEach(([priority, count]) => {
        const countElement = aidRequestsStore.elements.filterCard.querySelector(`#priority-${priority}-count`);
        if (countElement) {
            countElement.textContent = `(${count})`;
        }
    });

    // Update "All" priorities count
    const allPrioritiesCount = aidRequestsStore.elements.filterCard.querySelector('#priority-filter-all + label');
    if (allPrioritiesCount) {
        allPrioritiesCount.innerHTML = `All <span class="text-muted">(${counts.allPrioritiesTotal})</span>`;
    }

    if (aidRequestsStore.debug) {
        console.log('[Counts Display] Display update complete');
    }
}

function updateMapFilterSummary() {
    const summaryElement = document.getElementById('map-filter-summary');
    if (!summaryElement) {
        console.error('[Map Summary] Summary element not found');
        return;
    }

    const checkedStatuses = getSelectedStatuses();
    const checkedAidTypes = getSelectedAidTypes();
    const checkedPriorities = getSelectedPriorities();

    const parts = [];

    // Add status filter summary - only if not 'all'
    if (checkedStatuses !== 'all' && checkedStatuses.length > 0) {
        parts.push(`status=[${checkedStatuses.join('|')}]`);
    }

    // Add aid type filter summary - only if not 'all'
    if (checkedAidTypes !== 'all' && checkedAidTypes.length > 0) {
        const aidTypeNames = checkedAidTypes.map(type => {
            const countElement = document.querySelector(`label[for="aid-type-filter-${type}"]`);
            return countElement ? countElement.textContent.split('(')[0].trim() : type;
        });
        parts.push(`type=[${aidTypeNames.join('|')}]`);
    }

    // Add priority filter summary - only if not 'all'
    if (checkedPriorities !== 'all' && checkedPriorities.length > 0) {
        parts.push(`priority=[${checkedPriorities.join('|')}]`);
    }

    // Add matched count from the aidRequestsStore
    const totalMatched = aidRequestsStore.data.counts.matched;
    const totalRequests = aidRequestsStore.data.counts.total;

    // Update the summary text
    if (parts.length > 0) { // If we have filters
        summaryElement.textContent = parts.join(', ') + ', ' + formatFilteredCount(totalMatched, totalRequests);
    } else {
        summaryElement.textContent = formatFilteredCount(totalMatched, totalRequests);
    }

    if (aidRequestsStore.debug) {
        console.log('[Map Summary] Updated text:', summaryElement.textContent);
    }
}

// Update the row visibility check function to handle 'all'
function updateRowVisibility(filters) {
    if (aidRequestsStore.debug) {
        console.log('[Row Visibility] Updating with filters:', filters);
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('[Row Visibility] Table body not found');
        return;
    }

    const rows = tableBody.querySelectorAll('.aid-request-row');
    if (aidRequestsStore.debug) {
        console.log(`[Row Visibility] Found ${rows.length} rows to process`);
    }

    rows.forEach(row => {
        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority') || null; // Handle null priority

        const matchesStatus = filters.statuses === 'all' || filters.statuses.includes(status);
        const matchesAidType = filters.aidTypes === 'all' || filters.aidTypes.includes(aidType);
        const matchesPriority = filters.priorities === 'all' ||
            (priority === null && filters.priorities.includes(null)) ||
            filters.priorities.includes(priority);

        if (aidRequestsStore.debug) {
            console.log(`[Row Visibility] Row ${row.id}:`, {
                status,
                aidType,
                priority,
                matches: {
                    status: matchesStatus,
                    aidType: matchesAidType,
                    priority: matchesPriority
                }
            });
        }

        // Use d-none class for visibility
        if (matchesStatus && matchesAidType && matchesPriority) {
            row.classList.remove('d-none');
        } else {
            row.classList.add('d-none');
        }
    });

    // Update empty row visibility
    const emptyRow = document.getElementById('aid-request-empty-row');
    if (emptyRow) {
        const visibleRows = tableBody.querySelectorAll('.aid-request-row:not(.d-none)').length;
        if (visibleRows === 0) {
            emptyRow.classList.remove('d-none');
        } else {
            emptyRow.classList.add('d-none');
        }
    }
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

    if (state.allSelected) {
        parentCheckbox.checked = true;
        parentCheckbox.indeterminate = false;
    } else if (state.someSelected) {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = true;
    } else {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = false;
    }

    if (aidRequestsStore.debug) {
        console.log(`Parent checkbox ${parentCheckbox.id} state:`, {
            checked: parentCheckbox.checked,
            indeterminate: parentCheckbox.indeterminate,
            groupState: state
        });
    }
}

function getServerCounts() {
    const counts = {
        total: 0,
        matched: 0,
        byStatus: {},
        byAidType: {},
        byPriority: {},
        byGroup: {
            active: 0,
            inactive: 0
        }
    };

    // Get data from the JSON payload
    const aidLocationsElement = document.getElementById('aid-locations-data');
    if (!aidLocationsElement || !aidLocationsElement.textContent.trim()) {
        console.error('Aid locations data not found');
        return counts;
    }

    try {
        const aidRequests = JSON.parse(aidLocationsElement.textContent);
        counts.total = aidRequests.length;

        // Count everything from the actual data
        aidRequests.forEach(request => {
            const isActive = aidRequestsStore.statusGroups.active.includes(request.status);

            // Only count as matched if status is active (matching template's initial visibility)
            if (isActive) {
                counts.matched++;
            }

            // Count by status
            if (!counts.byStatus[request.status]) {
                counts.byStatus[request.status] = { total: 0, filtered: 0 };
            }
            counts.byStatus[request.status].total++;
            // Only count as filtered if status is active
            if (isActive) {
                counts.byStatus[request.status].filtered++;
            }

            // Update group counts
            if (isActive) {
                counts.byGroup.active++;
            } else if (aidRequestsStore.statusGroups.inactive.includes(request.status)) {
                counts.byGroup.inactive++;
            }

            // Count by aid type
            const aidType = request.aid_type.slug;
            if (!counts.byAidType[aidType]) {
                counts.byAidType[aidType] = { total: 0, filtered: 0 };
            }
            counts.byAidType[aidType].total++;
            // Only count as filtered if status is active
            if (isActive) {
                counts.byAidType[aidType].filtered++;
            }

            // Count by priority
            if (!counts.byPriority[request.priority]) {
                counts.byPriority[request.priority] = { total: 0, filtered: 0 };
            }
            counts.byPriority[request.priority].total++;
            // Only count as filtered if status is active
            if (isActive) {
                counts.byPriority[request.priority].filtered++;
            }
        });

        if (aidRequestsStore.debug) {
            console.log('[Server Counts] Calculated from JSON data:', {
                total: counts.total,
                matched: counts.matched,
                byGroup: counts.byGroup,
                byStatus: counts.byStatus,
                byAidType: counts.byAidType,
                byPriority: counts.byPriority
            });
        }

        return counts;
    } catch (error) {
        console.error('[Server Counts] Error processing aid requests data:', error);
        return counts;
    }
}

function calculateJavaScriptCounts() {
    const counts = {
        total: 0,
        byStatus: {},
        byGroup: {
            active: 0,
            inactive: 0
        }
    };

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('Table body not found');
        return counts;
    }

    const rows = tableBody.getElementsByTagName('tr');
    counts.total = rows.length;

    Array.from(rows).forEach(row => {
        const status = row.getAttribute('data-status');
        if (status) {
            counts.byStatus[status] = (counts.byStatus[status] || 0) + 1;

            // Count by group
            if (aidRequestsStore.statusGroups.active.includes(status)) {
                counts.byGroup.active++;
            } else if (aidRequestsStore.statusGroups.inactive.includes(status)) {
                counts.byGroup.inactive++;
            }
        }
    });

    return counts;
}

function initializeCheckboxStates() {
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) return;

    // Set initial checkbox states
    filterCard.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        const group = checkbox.dataset.group;
        const filterType = checkbox.dataset.filterType;
        const isGroupCheckbox = checkbox.id.includes('group-filter');

        // Set initial state based on filter type
        if (filterType === 'status') {
            // For status checkboxes, only uncheck inactive ones
            const isInactive = group === 'inactive' ||
                             (isGroupCheckbox && checkbox.id.includes('inactive')) ||
                             aidRequestsStore.statusGroups.inactive.includes(checkbox.getAttribute('data-filter-value'));
            checkbox.checked = !isInactive;
        } else {
            // Aid types and priorities start checked
            checkbox.checked = true;
        }
    });

    // Update parent checkbox states
    // Initialize aid type "All" checkbox
    const aidTypeAll = filterCard.querySelector('#aid-type-filter-all');
    if (aidTypeAll) {
        const aidTypeCheckboxes = filterCard.querySelectorAll('[data-filter-type="aid_type"]:not([id="aid-type-filter-all"])');
        updateParentCheckboxState(aidTypeAll, aidTypeCheckboxes);
    }

    // Initialize priority "All" checkbox
    const priorityAll = filterCard.querySelector('#priority-filter-all');
    if (priorityAll) {
        const priorityCheckboxes = filterCard.querySelectorAll('[data-filter-type="priority"]:not([id="priority-filter-all"])');
        updateParentCheckboxState(priorityAll, priorityCheckboxes);
    }

    // Initialize status group checkboxes
    ['active', 'inactive'].forEach(group => {
        const groupCheckbox = filterCard.querySelector(`#status-group-filter-${group}`);
        if (groupCheckbox) {
            const groupCheckboxes = filterCard.querySelectorAll(`[data-group="${group}"]:not([id*="group-filter"])`);
            updateParentCheckboxState(groupCheckbox, groupCheckboxes);
        }
    });
}
