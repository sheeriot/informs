/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */

// Configuration - enable debug logging as needed
const listConfig = { debug: false }
console.log('listConfig', listConfig);
// Define status groups if not already defined
if (typeof window.STATUS_GROUPS === 'undefined') {
    window.STATUS_GROUPS = {
        active: ['PENDING', 'IN_PROGRESS', 'SCHEDULED', 'ON_HOLD'],
        inactive: ['COMPLETED', 'CANCELLED', 'REJECTED']
    };
}

// Helper function to determine if a status is active
function isActiveStatus(status) {
    return window.STATUS_GROUPS.active.includes(status);
}

// Helper function to determine if a status is inactive
function isInactiveStatus(status) {
    return window.STATUS_GROUPS.inactive.includes(status);
}

// Helper function to get priority badge class
function getPriorityBadgeClass(priority) {
    if (!priority) return 'bg-secondary'; // Handle undefined/null priority
    const priorityLower = priority.toLowerCase();
    switch (priorityLower) {
        case 'high':
            return 'bg-danger';
        case 'medium':
            return 'bg-warning';
        case 'low':
            return 'bg-primary';
        case 'none':
            return 'bg-secondary';
        default:
            return 'bg-secondary';
    }
}

// Function to update row visibility based on filter state
function updateRowVisibility(filterState) {
    if (!filterState) {
        console.warn('[List View] No filter state provided');
        return;
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('[List View] Table body not found');
        return;
    }

    const rows = tableBody.getElementsByTagName('tr');
    let visibleCount = 0;
    const totalRows = rows.length;

    Array.from(rows).forEach(row => {
        // Skip the empty message row
        if (row.id === 'aid-request-empty-row') return;

        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority');

        // Check if row matches current filters
        const matchesStatus = filterState.statuses === 'all' || filterState.statuses.includes(status);
        const matchesAidType = filterState.aidTypes === 'all' || filterState.aidTypes.includes(aidType);
        const matchesPriority = filterState.priorities === 'all' || filterState.priorities.includes(priority);

        const isVisible = matchesStatus && matchesAidType && matchesPriority;

        if (isVisible) {
            row.classList.remove('d-none');
            visibleCount++;
        } else {
            row.classList.add('d-none');
        }
    });

    // Handle empty state
    const emptyRow = document.getElementById('aid-request-empty-row');
    if (emptyRow) {
        if (visibleCount === 0) {
            emptyRow.classList.remove('d-none');
        } else {
            emptyRow.classList.add('d-none');
        }
    }

    if (listConfig.debug) {
        console.log('[List View] Visibility updated:', {
            totalRows: totalRows,
            visibleRows: visibleCount,
            filters: filterState
        });
    }
}

// Function to update the results counter
// function updateResultsCounter() {
//     const counter = document.getElementById('results-counter');
//     if (!counter) return;

//     const visibleRows = document.querySelectorAll('#aid-request-list-body tr:not(.d-none)');
//     const totalRows = document.querySelectorAll('#aid-request-list-body tr').length;

//     counter.textContent = `${visibleRows.length} of ${totalRows} requests`;

//     // Update counter badge classes based on results
//     counter.classList.remove('bg-success', 'bg-warning', 'bg-danger');
//     if (visibleRows.length === totalRows) {
//         counter.classList.add('bg-success');
//     } else if (visibleRows.length === 0) {
//         counter.classList.add('bg-danger');
//     } else {
//         counter.classList.add('bg-warning');
//     }
// }

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (listConfig.debug) console.warn('[List View] Initializing aid requests list view...');

    // Verify data store availability
    if (!window.aidRequestsStore) {
        console.error('[List View] aidRequestsStore not found - table functionality will be limited');
        return;
    }

    // Add validation of initial state
    validateInitialState();

    // Verify table elements
    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('[List View] Table body not found');
        return;
    }

    // Log initial state
    const initialRows = tableBody.getElementsByTagName('tr');
    if (listConfig.debug) console.warn('[List View] Initial table state:', {
        totalRows: initialRows.length,
        visibleRows: Array.from(initialRows).filter(row => !row.classList.contains('d-none')).length,
        hasEmptyRow: !!document.getElementById('aid-request-empty-row')
    });

    // Listen for filter change events
    document.addEventListener('aidRequestsFiltered', function(event) {
        if (listConfig.debug) {
            console.log('[List View] Filter event received:', {
                filterState: event.detail.filterState,
                counts: event.detail.counts
            });
        }

        // Update row visibility based on received filter state
        updateRowVisibility(event.detail.filterState);
    });

    // Listen for aid request updates
    document.addEventListener('aidRequestUpdated', function(event) {
        if (listConfig.debug) {
            console.log('[List View] Update event received:', event.detail);
        }

        const { id, updates, request, filterState } = event.detail;

        // Find and update the row
        const row = document.querySelector(`#aid-request-list-body tr[data-id="${id}"]`);
        if (row) {
            // Update data attributes
            if (updates.status) {
                row.setAttribute('data-status', updates.status);
            }
            if (updates.priority) {
                row.setAttribute('data-priority', updates.priority);
            }

            // Update displayed values
            if (updates.status_display) {
                const statusCell = row.querySelector('.status-display');
                if (statusCell) statusCell.textContent = updates.status_display;
            }
            if (updates.priority_display) {
                const priorityCell = row.querySelector('.priority-display');
                if (priorityCell) priorityCell.textContent = updates.priority_display;
            }

            // Update row visibility based on current filters
            updateRowVisibility(filterState);
        }
    });
});

// Function to validate initial state
function validateInitialState() {
    if (!listConfig.debug) return;

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) return;

    const rows = Array.from(tableBody.getElementsByTagName('tr'));
    const issues = [];

    rows.forEach(row => {
        if (row.id === 'aid-request-empty-row') return;

        const status = row.getAttribute('data-status');
        const isInactive = window.STATUS_GROUPS.inactive.includes(status);
        const isHidden = row.classList.contains('d-none');

        // Check if visibility matches status
        if (isInactive && !isHidden) {
            issues.push(`Row ${row.getAttribute('data-id')} with inactive status ${status} should be hidden`);
        }
        if (!isInactive && isHidden) {
            issues.push(`Row ${row.getAttribute('data-id')} with active status ${status} should be visible`);
        }
    });

    // Log any issues found
    if (issues.length > 0) {
        console.warn('[List View] Initial state validation issues:', issues);
        console.table(issues);
    } else {
        console.log('[List View] Initial state validation passed');
    }
}
