/**
 * status-filter.js
 *
 * Handles status filter interactions and state management
 * Provides checkbox group behavior and filter event triggering
 */

// Configuration object
window.statusFilterConfig = {
    debug: true,  // Set to true to enable debugging output
    // Status group lookup table - maps status codes to their group (active/inactive)
    statusGroups: {
        active: ['new', 'assigned', 'resolved'],
        inactive: ['closed', 'rejected', 'other']
    },
    // Store counts
    counts: {
        total: 0,
        matched: 0,
        groups: {
            active: { total: 0, filtered: 0 },
            inactive: { total: 0, filtered: 0 }
        },
        aidTypes: {},
        priorities: {}
    }
};

// Main program
document.addEventListener('DOMContentLoaded', function() {
    if (statusFilterConfig.debug) {
        console.log('Initializing status filter functionality');
    }

    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return;
    }

    // Add event listeners for all checkboxes within the filter card
    filterCard.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const group = this.dataset.group;
            const filterType = this.dataset.filterType;
            const isGroupCheckbox = this.id.includes('group-filter');

            if (isGroupCheckbox && group) {
                // Handle group checkbox
                const groupCheckboxes = filterCard.querySelectorAll(`[data-group="${group}"]:not([id*="group-filter"])`);
                groupCheckboxes.forEach(cb => {
                    if (cb) {
                        cb.checked = this.checked;
                    }
                });
            } else if (group) {
                // Handle individual checkbox within a group
                const groupId = `status-group-filter-${group}`;
                const groupCheckbox = filterCard.querySelector(`#${groupId}`);
                if (groupCheckbox) {
                    const groupCheckboxes = filterCard.querySelectorAll(`[data-group="${group}"]:not([id*="group-filter"])`);
                    const allChecked = Array.from(groupCheckboxes).every(cb => cb && cb.checked);
                    groupCheckbox.checked = allChecked;
                }
            } else if (filterType === 'aid_type' || filterType === 'priority') {
                // Handle "All" checkbox for aid types and priorities
                const allCheckboxId = `${filterType}-filter-all`;
                const allCheckbox = filterCard.querySelector(`#${allCheckboxId}`);
                const typeCheckboxes = filterCard.querySelectorAll(`[data-filter-type="${filterType}"]:not([id="${allCheckboxId}"])`);

                if (this.id === allCheckboxId) {
                    // If "All" checkbox was clicked
                    typeCheckboxes.forEach(cb => {
                        if (cb) {
                            cb.checked = this.checked;
                        }
                    });
                } else {
                    // If individual checkbox was clicked
                    if (allCheckbox) {
                        const allChecked = Array.from(typeCheckboxes).every(cb => cb && cb.checked);
                        allCheckbox.checked = allChecked;
                    }
                }
            }

            triggerFilterChange();
        });
    });

    // Add event listener for reset button within the filter card
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
            triggerFilterChange();
        });
    }

    // Calculate initial counts
    calculateTotals();
    updateCountsDisplay();
});

// Listen for filter change events
document.addEventListener('aidRequestsFiltered', function(event) {
    if (statusFilterConfig.debug) {
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
    if (statusFilterConfig.debug) {
        console.log('Filter change triggered');
    }

    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return;
    }

    // Get all checked checkboxes within the filter card
    const checkedStatuses = Array.from(filterCard.querySelectorAll('[data-group="active"]:checked, [data-group="inactive"]:checked'))
        .map(cb => cb.getAttribute('data-filter-value'));
    const checkedAidTypes = Array.from(filterCard.querySelectorAll('[data-filter-type="aid_type"]:checked:not([id="aid-type-filter-all"])'))
        .map(cb => cb.getAttribute('data-filter-value'));
    const checkedPriorities = Array.from(filterCard.querySelectorAll('[data-filter-type="priority"]:checked:not([id="priority-filter-all"])'))
        .map(cb => cb.getAttribute('data-filter-value'));

    if (statusFilterConfig.debug) {
        console.log('Checked statuses:', checkedStatuses);
        console.log('Checked aid types:', checkedAidTypes);
        console.log('Checked priorities:', checkedPriorities);
    }

    // Calculate and update counts
    calculateTotals();
    updateCountsDisplay();

    // Update row visibility based on current filter state
    updateRowVisibility({
        statuses: checkedStatuses,
        aidTypes: checkedAidTypes,
        priorities: checkedPriorities
    });

    // Create and dispatch a synthetic change event
    const event = new CustomEvent('aidRequestsFiltered', {
        detail: {
            filterState: {
                statuses: checkedStatuses,
                aidTypes: checkedAidTypes,
                priorities: checkedPriorities
            }
        }
    });

    if (statusFilterConfig.debug) {
        console.log('Dispatching filter event:', event.detail);
    }

    document.dispatchEvent(event);
}

function getSelectedStatuses() {
    if (statusFilterConfig.debug) {
        console.log('Getting selected statuses...');
    }
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return [];
    }

    const activeCheckboxes = filterCard.querySelectorAll('[data-group="active"]:checked');
    const inactiveCheckboxes = filterCard.querySelectorAll('[data-group="inactive"]:checked');

    if (statusFilterConfig.debug) {
        console.log('Active checkboxes:', activeCheckboxes);
        console.log('Inactive checkboxes:', inactiveCheckboxes);
    }

    const statuses = [
        ...Array.from(activeCheckboxes).map(cb => cb.getAttribute('data-filter-value')),
        ...Array.from(inactiveCheckboxes).map(cb => cb.getAttribute('data-filter-value'))
    ];

    if (statusFilterConfig.debug) {
        console.log('Selected statuses:', statuses);
    }
    return statuses;
}

function getSelectedAidTypes() {
    if (statusFilterConfig.debug) {
        console.log('Getting selected aid types...');
    }
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return [];
    }

    const allCheckbox = filterCard.querySelector('#aid-type-filter-all');
    if (allCheckbox && allCheckbox.checked) {
        if (statusFilterConfig.debug) {
            console.log('All aid types selected');
        }
        return ['all'];
    }
    const checkboxes = filterCard.querySelectorAll('[data-filter-type="aid_type"]:checked:not([id="aid-type-filter-all"])');
    const aidTypes = Array.from(checkboxes).map(cb => cb.getAttribute('data-filter-value'));
    if (statusFilterConfig.debug) {
        console.log('Selected aid types:', aidTypes);
    }
    return aidTypes;
}

function getSelectedPriorities() {
    if (statusFilterConfig.debug) {
        console.log('Getting selected priorities...');
    }
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        console.error('Filter card element not found');
        return [];
    }

    const allCheckbox = filterCard.querySelector('#priority-filter-all');
    if (allCheckbox && allCheckbox.checked) {
        if (statusFilterConfig.debug) {
            console.log('All priorities selected');
        }
        return ['all'];
    }
    const checkboxes = filterCard.querySelectorAll('[data-filter-type="priority"]:checked:not([id="priority-filter-all"])');
    const priorities = Array.from(checkboxes).map(cb => cb.getAttribute('data-filter-value'));
    if (statusFilterConfig.debug) {
        console.log('Selected priorities:', priorities);
    }
    return priorities;
}

// Functions to handle counts
function calculateTotals() {
    if (statusFilterConfig.debug) {
        console.log('Calculating totals...');
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
    statusFilterConfig.counts = {
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

        statusFilterConfig.counts.total++;

        // Initialize counters if needed
        if (aidType && !statusFilterConfig.counts.aidTypes[aidType]) {
            statusFilterConfig.counts.aidTypes[aidType] = { total: 0, filtered: 0 };
        }
        if (priority && !statusFilterConfig.counts.priorities[priority]) {
            statusFilterConfig.counts.priorities[priority] = { total: 0, filtered: 0 };
        }

        // Check if row matches current filters
        const matchesStatus = !checkedStatuses.length || checkedStatuses.includes(status);
        const matchesAidType = checkedAidTypes.includes('all') || !checkedAidTypes.length || checkedAidTypes.includes(aidType);
        const matchesPriority = checkedPriorities.includes('all') || !checkedPriorities.length || checkedPriorities.includes(priority);

        // Count by status group
        if (status) {
            const group = Object.entries(statusFilterConfig.statusGroups)
                .find(([_, statuses]) => statuses.includes(status))?.[0];

            if (group) {
                statusFilterConfig.counts.groups[group].total++;

                // Update filtered count if it matches other filters
                if (matchesAidType && matchesPriority) {
                    statusFilterConfig.counts.groups[group].filtered++;
                }
            }
        }

        // Count by aid type
        if (aidType) {
            statusFilterConfig.counts.aidTypes[aidType].total++;
            // Update filtered count if it matches other filters
            if (matchesStatus && matchesPriority) {
                statusFilterConfig.counts.aidTypes[aidType].filtered++;
            }
        }

        // Count by priority
        if (priority) {
            statusFilterConfig.counts.priorities[priority].total++;
            // Update filtered count if it matches other filters
            if (matchesStatus && matchesAidType) {
                statusFilterConfig.counts.priorities[priority].filtered++;
            }
        }

        // Update total matched count if row matches all filters
        if (matchesStatus && matchesAidType && matchesPriority) {
            statusFilterConfig.counts.matched++;
        }
    });

    if (statusFilterConfig.debug) {
        console.log('=== Count Summary ===');
        console.table({
            'Total Requests': statusFilterConfig.counts.total,
            'Matched Requests': statusFilterConfig.counts.matched,
            'Active Group Total': statusFilterConfig.counts.groups.active.total,
            'Active Group Filtered': statusFilterConfig.counts.groups.active.filtered,
            'Inactive Group Total': statusFilterConfig.counts.groups.inactive.total,
            'Inactive Group Filtered': statusFilterConfig.counts.groups.inactive.filtered
        });
        console.log('Aid Types Counts:', statusFilterConfig.counts.aidTypes);
        console.log('Priorities Counts:', statusFilterConfig.counts.priorities);
    }
}

function updateCountsDisplay() {
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) return;

    // Update card title counter with total matched vs total
    const resultsCounter = document.getElementById('results-counter');
    if (resultsCounter) {
        resultsCounter.textContent = `${statusFilterConfig.counts.matched} of ${statusFilterConfig.counts.total} requests`;

        // Update counter badge classes
        resultsCounter.classList.remove('bg-success', 'bg-warning', 'bg-danger');
        if (statusFilterConfig.counts.matched === statusFilterConfig.counts.total) {
            resultsCounter.classList.add('bg-success');
        } else if (statusFilterConfig.counts.matched === 0) {
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
            const counts = statusFilterConfig.counts.groups[group];
            groupTotal.textContent = `(${counts.filtered})`;
        }
    });

    // Update individual status counts
    Object.entries(statusFilterConfig.statusGroups).forEach(([group, statuses]) => {
        statuses.forEach(status => {
            const countElement = filterCard.querySelector(`#status-filter-${status}-count`);
            if (countElement) {
                const count = Array.from(document.querySelectorAll(`[data-status="${status}"]`)).length;
                countElement.textContent = `(${count})`;
            }
        });
    });

    // Update aid type counts with filtered totals
    Object.entries(statusFilterConfig.counts.aidTypes).forEach(([aidType, counts]) => {
        const countElement = filterCard.querySelector(`#aid-type-${aidType}-count`);
        if (countElement) {
            countElement.textContent = `(${counts.filtered})`;
        }
    });

    // Update priority counts with filtered totals
    Object.entries(statusFilterConfig.counts.priorities).forEach(([priority, counts]) => {
        const countElement = filterCard.querySelector(`#priority-${priority}-count`);
        if (countElement) {
            countElement.textContent = `(${counts.filtered})`;
        }
    });

    // Update "All" checkboxes counts
    const aidTypeAll = filterCard.querySelector('label[for="aid-type-filter-all"]');
    if (aidTypeAll) {
        const totalAidTypeFiltered = Object.values(statusFilterConfig.counts.aidTypes)
            .reduce((sum, counts) => sum + counts.filtered, 0);
        aidTypeAll.textContent = `All (${totalAidTypeFiltered})`;
    }

    const priorityAll = filterCard.querySelector('label[for="priority-filter-all"]');
    if (priorityAll) {
        const totalPriorityFiltered = Object.values(statusFilterConfig.counts.priorities)
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

    // Add status filter summary
    if (checkedStatuses.length > 0) {
        parts.push(`status=[${checkedStatuses.join('|')}]`);
    }

    // Add aid type filter summary
    if (!checkedAidTypes.includes('all') && checkedAidTypes.length > 0) {
        const aidTypeNames = checkedAidTypes.map(type => {
            const countElement = document.querySelector(`label[for="aid-type-filter-${type}"]`);
            return countElement ? countElement.textContent.split('(')[0].trim() : type;
        });
        parts.push(`type=[${aidTypeNames.join('|')}]`);
    }

    // Add priority filter summary
    if (!checkedPriorities.includes('all') && checkedPriorities.length > 0) {
        parts.push(`priority=[${checkedPriorities.join('|')}]`);
    }

    // Add matched count from the statusFilterConfig
    const totalMatched = statusFilterConfig.counts.matched;
    const totalRequests = statusFilterConfig.counts.total;
    parts.push(`showing ${totalMatched} of ${totalRequests}`);

    // Update the summary text
    if (parts.length > 1) { // More than just the count
        summaryElement.textContent = parts.join(', ');
    } else {
        summaryElement.textContent = `showing all ${totalRequests} requests`;
    }

    if (statusFilterConfig.debug) {
        console.log('Map filter summary:', parts.join(', '));
    }
}
