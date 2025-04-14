/**
 * status-filter.js
 *
 * Handles status filter interactions and state management
 * Provides checkbox group behavior and filter event triggering
 */

// Configuration object
statusFilterConfig = {
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
            const isGroupCheckbox = this.id.includes('group-filter');

            if (isGroupCheckbox) {
                // Handle group checkbox
                const groupCheckboxes = filterCard.querySelectorAll(`[data-group="${group}"]`);
                groupCheckboxes.forEach(cb => {
                    if (cb !== this) { // Don't update the group checkbox itself
                        cb.checked = this.checked;
                    }
                });
            } else {
                // Handle individual checkbox
                const groupCheckbox = filterCard.querySelector(`#${group}`);
                const groupCheckboxes = filterCard.querySelectorAll(`[data-group="${group}"]:not(#${group})`);
                const allChecked = Array.from(groupCheckboxes).every(cb => cb.checked);
                groupCheckbox.checked = allChecked;
            }

            triggerFilterChange();
        });
    });

    // Add event listener for reset button within the filter card
    filterCard.querySelector('#reset-all-filters').addEventListener('click', function() {
        filterCard.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            // Reset to original state: all checked except inactive status group
            if (checkbox.id.includes('status-group-filter-inactive') ||
                checkbox.dataset.group === 'inactive' ||
                checkbox.id.includes('status-filter-cancelled') ||
                checkbox.id.includes('status-filter-rejected')) {
                checkbox.checked = false;
            } else {
                checkbox.checked = true;
            }
        });
        triggerFilterChange();
    });
});

// Listen for filter change events
document.addEventListener('filterChange', function(event) {
    if (statusFilterConfig.debug) {
        console.log('Filter change event received:', event.detail);
        console.log('%cFilter State', 'font-weight: bold; color: #2196F3;');
        console.table({
            'Statuses': getSelectedStatuses().join(', ') || 'None',
            'Aid Types': getSelectedAidTypes().join(', ') || 'None',
            'Priorities': getSelectedPriorities().join(', ') || 'None'
        });
    }

    // Update row visibility
    if (typeof updateRowVisibility === 'function') {
        updateRowVisibility({
            statuses: getSelectedStatuses(),
            aidTypes: getSelectedAidTypes(),
            priorities: getSelectedPriorities()
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
    const event = new CustomEvent('filterChange', {
        detail: {
            statuses: checkedStatuses,
            aidTypes: checkedAidTypes,
            priorities: checkedPriorities
        }
    });
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
