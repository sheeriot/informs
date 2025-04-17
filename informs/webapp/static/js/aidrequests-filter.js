/**
 * status-filter.js
 *
 * Handles status filter interactions and state management
 * Provides checkbox group behavior and filter event triggering
 */

// Configuration object
window.aidRequestsStore = {
    debug: false,  // Set to true to enable debugging output
    // Status group lookup table - maps status codes to their group (active/inactive)
    statusGroups: {
        active: ['new', 'assigned', 'resolved'],
        inactive: ['closed', 'rejected', 'other']
    },
    // Store the actual data
    data: {
        aidRequests: [],
        aidTypes: {},
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
    // Store current filter state
    filterState: {
        statuses: 'all',
        aidTypes: 'all',
        priorities: 'all'
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

    // Load initial data from DOM
    initializeDataStore();

    // Initialize filter UI
    initializeFilterUI();
});

function initializeDataStore() {
    // Load aid requests data
    const aidLocationsElement = document.getElementById('aid-locations-data');
    if (aidLocationsElement && aidLocationsElement.textContent.trim()) {
        try {
            aidRequestsStore.data.aidRequests = JSON.parse(aidLocationsElement.textContent);
        } catch (error) {
            console.error('Error parsing aid requests data:', error);
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
        } catch (error) {
            console.error('Error parsing aid types:', error);
        }
    }

    // Calculate initial counts
    calculateCounts();

    if (aidRequestsStore.debug) {
        console.log('Data store initialized:', aidRequestsStore);
    }
}

function calculateCounts() {
    const counts = aidRequestsStore.data.counts;
    const requests = aidRequestsStore.data.aidRequests;

    // Reset counts
    counts.total = requests.length;
    counts.matched = requests.length; // Initially all match
    counts.groups.active = { total: 0, filtered: 0 };
    counts.groups.inactive = { total: 0, filtered: 0 };
    counts.byStatus = {};
    counts.byAidType = {};
    counts.byPriority = {};

    // Count everything
    requests.forEach(request => {
        // Count by status
        if (!counts.byStatus[request.status]) {
            counts.byStatus[request.status] = { total: 0, filtered: 0 };
        }
        counts.byStatus[request.status].total++;
        counts.byStatus[request.status].filtered++;

        // Count by group
        const group = Object.entries(aidRequestsStore.statusGroups)
            .find(([_, statuses]) => statuses.includes(request.status))?.[0];
        if (group) {
            counts.groups[group].total++;
            counts.groups[group].filtered++;
        }

        // Count by aid type
        if (!counts.byAidType[request.aid_type]) {
            counts.byAidType[request.aid_type] = { total: 0, filtered: 0 };
        }
        counts.byAidType[request.aid_type].total++;
        counts.byAidType[request.aid_type].filtered++;

        // Count by priority
        if (!counts.byPriority[request.priority]) {
            counts.byPriority[request.priority] = { total: 0, filtered: 0 };
        }
        counts.byPriority[request.priority].total++;
        counts.byPriority[request.priority].filtered++;
    });
}

function applyFilters() {
    const { filterState, data } = aidRequestsStore;

    // Reset filtered counts
    Object.values(data.counts.byStatus).forEach(count => count.filtered = 0);
    Object.values(data.counts.byAidType).forEach(count => count.filtered = 0);
    Object.values(data.counts.byPriority).forEach(count => count.filtered = 0);
    data.counts.groups.active.filtered = 0;
    data.counts.groups.inactive.filtered = 0;

    // Count matching requests
    data.counts.matched = data.aidRequests.reduce((count, request) => {
        const matchesStatus = filterState.statuses === 'all' || filterState.statuses.includes(request.status);
        const matchesAidType = filterState.aidTypes === 'all' || filterState.aidTypes.includes(request.aid_type);
        const matchesPriority = filterState.priorities === 'all' || filterState.priorities.includes(request.priority);

        const matches = matchesStatus && matchesAidType && matchesPriority;
        if (matches) {
            // Update filtered counts
            data.counts.byStatus[request.status].filtered++;
            data.counts.byAidType[request.aid_type].filtered++;
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
        console.log('Applied filters:', filterState);
        console.log('Updated counts:', data.counts);
    }
}

function initializeFilterUI() {
    if (aidRequestsStore.debug) {
        console.log('Initializing status filter functionality');
    }

    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return;
    }

    // Get both sets of counts
    const serverCounts = getServerCounts();
    const jsCounts = calculateJavaScriptCounts();

    // Create comparison table
    console.log('%cCount Comparison Table', 'font-size: 14px; font-weight: bold; color: #2196F3;');
    console.table({
        'Total Requests': {
            'Server Count': serverCounts.total,
            'JS Count': jsCounts.total,
            'Match?': serverCounts.total === jsCounts.total ? '✅' : '❌'
        },
        'Active Group': {
            'Server Count': serverCounts.byGroup.active,
            'JS Count': jsCounts.byGroup.active,
            'Match?': serverCounts.byGroup.active === jsCounts.byGroup.active ? '✅' : '❌'
        },
        'Inactive Group': {
            'Server Count': serverCounts.byGroup.inactive,
            'JS Count': jsCounts.byGroup.inactive,
            'Match?': serverCounts.byGroup.inactive === jsCounts.byGroup.inactive ? '✅' : '❌'
        },
        ...Object.keys({...serverCounts.byStatus, ...jsCounts.byStatus}).reduce((acc, status) => ({
            ...acc,
            [`Status: ${status}`]: {
                'Server Count': serverCounts.byStatus[status] || 0,
                'JS Count': jsCounts.byStatus[status] || 0,
                'Match?': (serverCounts.byStatus[status] || 0) === (jsCounts.byStatus[status] || 0) ? '✅' : '❌'
            }
        }), {})
    });

    // Store initial counts
    aidRequestsStore.data.counts.total = serverCounts.total;
    aidRequestsStore.data.counts.matched = serverCounts.total;

    // Store initial group counts
    ['active', 'inactive'].forEach(group => {
        const count = serverCounts.byGroup[group];
        aidRequestsStore.data.counts.groups[group].total = count;
        aidRequestsStore.data.counts.groups[group].filtered = count;
    });

    // Add event listeners for all checkboxes within the filter card
    filterCard.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const group = this.dataset.group;
            const filterType = this.dataset.filterType;
            const isGroupCheckbox = this.id.includes('group-filter');

            if (isGroupCheckbox && group) {
                // Handle group checkbox (active/inactive)
                const groupCheckboxes = filterCard.querySelectorAll(`[data-group="${group}"]:not([id*="group-filter"])`);
                groupCheckboxes.forEach(cb => cb.checked = this.checked);
            } else if (group) {
                // Handle individual status checkbox
                const groupCheckbox = filterCard.querySelector(`#status-group-filter-${group}`);
                if (groupCheckbox) {
                    const groupCheckboxes = filterCard.querySelectorAll(`[data-group="${group}"]:not([id*="group-filter"])`);
                    updateParentCheckboxState(groupCheckbox, groupCheckboxes);
                }
            } else if (filterType === 'aid_type' || filterType === 'priority') {
                const allCheckboxId = `${filterType}-filter-all`;
                const allCheckbox = filterCard.querySelector(`#${allCheckboxId}`);
                const typeCheckboxes = filterCard.querySelectorAll(`[data-filter-type="${filterType}"]:not([id="${allCheckboxId}"])`);

                if (this.id === allCheckboxId) {
                    // If "All" checkbox was clicked, update all child checkboxes
                    typeCheckboxes.forEach(cb => cb.checked = this.checked);
                    this.indeterminate = false;
                } else {
                    // If individual checkbox was clicked, update "All" checkbox state
                    const allChecked = Array.from(typeCheckboxes).every(cb => cb.checked);
                    const someChecked = Array.from(typeCheckboxes).some(cb => cb.checked);

                    allCheckbox.checked = allChecked;
                    allCheckbox.indeterminate = !allChecked && someChecked;
                }
            }

            triggerFilterChange();
        });
    });

    // Initialize checkbox states
    initializeCheckboxStates();

    // Add event listener for reset button
    const resetButton = filterCard.querySelector('#reset-all-filters');
    if (resetButton) {
        resetButton.addEventListener('click', function() {
            filterCard.querySelectorAll('.filter-checkbox').forEach(checkbox => {
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
                }
            });

            // Re-initialize all checkbox states
            initializeCheckboxStates();
            triggerFilterChange();
        });
    }

    // Calculate initial counts
    calculateTotals();
    updateCountsDisplay();
}

// Listen for filter change events
document.addEventListener('aidRequestsFiltered', function(event) {
    if (aidRequestsStore.debug) {
        console.log('Filter change event received:', event.detail);
        console.log('%cFilter State', 'font-weight: bold; color: #2196F3;');
        console.table({
            'Statuses': event.detail.filterState.statuses.join(', ') || 'None',
            'Aid Types': event.detail.filterState.aidTypes.join(', ') || 'None',
            'Priorities': event.detail.filterState.priorities.join(', ') || 'None'
        });
    }

    // Update row visibility
    if (typeof updateRowVisibility === 'function') {
        updateRowVisibility({
            statuses: event.detail.filterState.statuses,
            aidTypes: event.detail.filterState.aidTypes,
            priorities: event.detail.filterState.priorities
        });
    } else {
        console.error('updateRowVisibility function not found');
    }
});

// Functions
function triggerFilterChange() {
    if (aidRequestsStore.debug) {
        console.log('Filter change triggered');
    }

    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return;
    }

    // Get selected values for each filter type
    const checkedStatuses = getSelectedStatuses();
    const checkedAidTypes = getSelectedAidTypes();
    const checkedPriorities = getSelectedPriorities();

    if (aidRequestsStore.debug) {
        console.group('Filter State Before Event Emission');
        console.log('Selected statuses:', checkedStatuses);
        console.log('Selected aid types:', checkedAidTypes);
        console.log('Selected priorities:', checkedPriorities);
        console.groupEnd();
    }

    // Calculate and update counts
    calculateTotals();
    updateCountsDisplay();

    // Create and dispatch filter event with only specific selected values
    const event = new CustomEvent('aidRequestsFiltered', {
        detail: {
            filterState: {
                statuses: checkedStatuses,
                aidTypes: checkedAidTypes,
                priorities: checkedPriorities
            }
        }
    });

    if (aidRequestsStore.debug) {
        console.group('Emitting Filter Event');
        console.log('Event detail:', event.detail);
        console.groupEnd();
    }

    document.dispatchEvent(event);
}

function getSelectedStatuses() {
    if (aidRequestsStore.debug) {
        console.log('Getting selected statuses...');
    }
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return [];
    }

    // Get all status checkboxes (both active and inactive)
    const allStatusCheckboxes = filterCard.querySelectorAll('[data-filter-type="status"]:not([id*="group-filter"])');
    const checkedStatusCheckboxes = filterCard.querySelectorAll('[data-filter-type="status"]:checked:not([id*="group-filter"])');

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
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return [];
    }

    // Get all individual aid type checkboxes
    const allAidTypeCheckboxes = filterCard.querySelectorAll('[data-filter-type="aid_type"]:not([id="aid-type-filter-all"])');
    const checkedAidTypeCheckboxes = filterCard.querySelectorAll('[data-filter-type="aid_type"]:checked:not([id="aid-type-filter-all"])');

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
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return [];
    }

    // Get all individual priority checkboxes
    const allPriorityCheckboxes = filterCard.querySelectorAll('[data-filter-type="priority"]:not([id="priority-filter-all"])');
    const checkedPriorityCheckboxes = filterCard.querySelectorAll('[data-filter-type="priority"]:checked:not([id="priority-filter-all"])');

    // If all individual checkboxes are checked, return 'all'
    if (allPriorityCheckboxes.length === checkedPriorityCheckboxes.length) {
        if (aidRequestsStore.debug) {
            console.log('All priorities selected, returning "all"');
        }
        return 'all';
    }

    // Return array of checked priority values
    const priorities = Array.from(checkedPriorityCheckboxes).map(cb => cb.getAttribute('data-filter-value'));
    if (aidRequestsStore.debug) {
        console.log('Selected priorities:', priorities);
    }
    return priorities;
}

// Functions to handle counts
function calculateTotals() {
    if (aidRequestsStore.debug) {
        console.log('Calculating totals...');
    }

    // On initial load, preserve the server-side counts
    if (aidRequestsStore.isInitialLoad) {
        if (aidRequestsStore.debug) {
            console.log('Initial load - preserving server-side counts');
        }
        aidRequestsStore.isInitialLoad = false;
        return;
    }

    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return;
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('Table body not found');
        return;
    }

    const rows = tableBody.getElementsByTagName('tr');

    // Reset counts
    aidRequestsStore.data.counts = {
        total: 0,
        matched: 0,
        groups: {
            active: { total: 0, filtered: 0 },
            inactive: { total: 0, filtered: 0 }
        },
        aidTypes: {},
        priorities: {}
    };

    // Get current filter state
    const checkedStatuses = getSelectedStatuses();
    const checkedAidTypes = getSelectedAidTypes();
    const checkedPriorities = getSelectedPriorities();

    // Count rows
    Array.from(rows).forEach(row => {
        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority');
        const isVisible = row.style.display !== 'none';

        aidRequestsStore.data.counts.total++;
        if (isVisible) {
            aidRequestsStore.data.counts.matched++;
        }

        // Initialize counters if needed
        if (aidType && !aidRequestsStore.data.counts.aidTypes[aidType]) {
            aidRequestsStore.data.counts.aidTypes[aidType] = { total: 0, filtered: 0 };
        }
        if (priority && !aidRequestsStore.data.counts.priorities[priority]) {
            aidRequestsStore.data.counts.priorities[priority] = { total: 0, filtered: 0 };
        }

        // Count by status group
        if (status) {
            const group = Object.entries(aidRequestsStore.statusGroups)
                .find(([_, statuses]) => statuses.includes(status))?.[0];

            if (group) {
                aidRequestsStore.data.counts.groups[group].total++;
                if (isVisible) {
                    aidRequestsStore.data.counts.groups[group].filtered++;
                }
            }
        }

        // Count by aid type
        if (aidType) {
            aidRequestsStore.data.counts.aidTypes[aidType].total++;
            if (isVisible) {
                aidRequestsStore.data.counts.aidTypes[aidType].filtered++;
            }
        }

        // Count by priority
        if (priority) {
            aidRequestsStore.data.counts.priorities[priority].total++;
            if (isVisible) {
                aidRequestsStore.data.counts.priorities[priority].filtered++;
            }
        }
    });

    if (aidRequestsStore.debug) {
        console.log('=== Count Summary ===');
        console.table({
            'Total Requests': aidRequestsStore.data.counts.total,
            'Matched Requests': aidRequestsStore.data.counts.matched,
            'Active Group Total': aidRequestsStore.data.counts.groups.active.total,
            'Active Group Filtered': aidRequestsStore.data.counts.groups.active.filtered,
            'Inactive Group Total': aidRequestsStore.data.counts.groups.inactive.total,
            'Inactive Group Filtered': aidRequestsStore.data.counts.groups.inactive.filtered
        });
        console.log('Aid Types Counts:', aidRequestsStore.data.counts.aidTypes);
        console.log('Priorities Counts:', aidRequestsStore.data.counts.priorities);
    }
}

function updateCountsDisplay() {
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) return;

    // Update card title counter with total matched vs total
    const resultsCounter = document.getElementById('results-counter');
    if (resultsCounter) {
        resultsCounter.textContent = `${aidRequestsStore.data.counts.matched} of ${aidRequestsStore.data.counts.total} requests`;

        // Update counter badge classes
        resultsCounter.classList.remove('bg-success', 'bg-warning', 'bg-danger');
        if (aidRequestsStore.data.counts.matched === aidRequestsStore.data.counts.total) {
            resultsCounter.classList.add('bg-success');
        } else if (aidRequestsStore.data.counts.matched === 0) {
            resultsCounter.classList.add('bg-danger');
        } else {
            resultsCounter.classList.add('bg-warning');
        }
    }

    // Update map filter summary
    updateMapFilterSummary();

    // Update status group counts
    ['active', 'inactive'].forEach(group => {
        const groupTotal = filterCard.querySelector(`#status-group-filter-${group}-total`);
        if (groupTotal) {
            const counts = aidRequestsStore.data.counts.groups[group];
            groupTotal.textContent = `(${counts.filtered})`;
        }
    });

    // Update individual status counts
    Object.entries(aidRequestsStore.statusGroups).forEach(([group, statuses]) => {
        statuses.forEach(status => {
            const countElement = filterCard.querySelector(`#status-filter-${status}-count`);
            if (countElement) {
                // Count visible rows with this status
                const count = Array.from(document.querySelectorAll(`[data-status="${status}"]:not([style*="display: none"])`)).length;
                countElement.textContent = `(${count})`;
            }
        });
    });

    // Update aid type counts with filtered totals
    Object.entries(aidRequestsStore.data.counts.aidTypes).forEach(([aidType, counts]) => {
        const countElement = filterCard.querySelector(`#aid-type-${aidType}-count`);
        if (countElement) {
            countElement.textContent = `(${counts.filtered})`;
        }
    });

    // Update priority counts with filtered totals
    Object.entries(aidRequestsStore.data.counts.priorities).forEach(([priority, counts]) => {
        const countElement = filterCard.querySelector(`#priority-${priority}-count`);
        if (countElement) {
            countElement.textContent = `(${counts.filtered})`;
        }
    });

    // Update "All" checkboxes counts
    const aidTypeAll = filterCard.querySelector('label[for="aid-type-filter-all"]');
    if (aidTypeAll) {
        const totalAidTypeFiltered = Object.values(aidRequestsStore.data.counts.aidTypes)
            .reduce((sum, counts) => sum + counts.filtered, 0);
        aidTypeAll.textContent = `All (${totalAidTypeFiltered})`;
    }

    const priorityAll = filterCard.querySelector('label[for="priority-filter-all"]');
    if (priorityAll) {
        const totalPriorityFiltered = Object.values(aidRequestsStore.data.counts.priorities)
            .reduce((sum, counts) => sum + counts.filtered, 0);
        priorityAll.textContent = `All (${totalPriorityFiltered})`;
    }
}

function updateMapFilterSummary() {
    const summaryElement = document.getElementById('map-filter-summary');
    if (!summaryElement) return;

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
    parts.push(`showing ${totalMatched} of ${totalRequests}`);

    // Update the summary text
    if (parts.length > 1) { // More than just the count
        summaryElement.textContent = parts.join(', ');
    } else {
        summaryElement.textContent = `showing all ${totalRequests} requests`;
    }

    if (aidRequestsStore.debug) {
        console.log('Map filter summary:', parts.join(', '));
    }
}

// Update the row visibility check function to handle 'all'
function updateRowVisibility(filters) {
    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('Table body not found');
        return;
    }

    const rows = tableBody.getElementsByTagName('tr');
    Array.from(rows).forEach(row => {
        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority');

        const matchesStatus = filters.statuses === 'all' || filters.statuses.includes(status);
        const matchesAidType = filters.aidTypes === 'all' || filters.aidTypes.includes(aidType);
        const matchesPriority = filters.priorities === 'all' || filters.priorities.includes(priority);

        row.style.display = (matchesStatus && matchesAidType && matchesPriority) ? '' : 'none';
    });
}

// Add AJAX update handler
function handleAidRequestUpdate(fieldOpSlug, requestId, updates) {
    if (window.aidRequestsStore.debug) {
        console.log(`Sending update for aid request ${requestId}:`, updates);
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
function determineGroupState(checkboxes) {
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
    const state = determineGroupState(childCheckboxes);

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
        byStatus: {},
        byGroup: {
            active: 0,
            inactive: 0
        }
    };

    // Get status counts and calculate totals from the actual table data
    const tableBody = document.querySelector('#aid-request-list-body');
    if (tableBody) {
        const rows = tableBody.getElementsByTagName('tr');
        counts.total = rows.length;

        // Calculate status counts and group totals
        Array.from(rows).forEach(row => {
            const status = row.getAttribute('data-status');
            if (status) {
                counts.byStatus[status] = (counts.byStatus[status] || 0) + 1;

                // Update group counts based on status
                if (aidRequestsStore.statusGroups.active.includes(status)) {
                    counts.byGroup.active++;
                } else if (aidRequestsStore.statusGroups.inactive.includes(status)) {
                    counts.byGroup.inactive++;
                }
            }
        });
    }

    return counts;
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

    // Initialize aid type "All" checkbox
    const aidTypeAll = filterCard.querySelector('#aid-type-filter-all');
    if (aidTypeAll) {
        const aidTypeCheckboxes = filterCard.querySelectorAll('[data-filter-type="aid_type"]:not([id="aid-type-filter-all"])');
        const allChecked = Array.from(aidTypeCheckboxes).every(cb => cb.checked);
        const someChecked = Array.from(aidTypeCheckboxes).some(cb => cb.checked);

        aidTypeAll.checked = allChecked;
        aidTypeAll.indeterminate = !allChecked && someChecked;
    }

    // Initialize priority "All" checkbox
    const priorityAll = filterCard.querySelector('#priority-filter-all');
    if (priorityAll) {
        const priorityCheckboxes = filterCard.querySelectorAll('[data-filter-type="priority"]:not([id="priority-filter-all"])');
        const allChecked = Array.from(priorityCheckboxes).every(cb => cb.checked);
        const someChecked = Array.from(priorityCheckboxes).some(cb => cb.checked);

        priorityAll.checked = allChecked;
        priorityAll.indeterminate = !allChecked && someChecked;
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
