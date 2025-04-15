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
