/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */

// Configuration
const listConfig = {
    debug: false  // Set to false in production
};

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
    if (window.aidRequestsStore.debug) {
        console.log('List View: Updating row visibility with filter state:', filterState);
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('Table body not found');
        return;
    }

    const rows = tableBody.getElementsByTagName('tr');
    const debugRows = [];

    Array.from(rows).forEach(row => {
        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority');
        const id = row.getAttribute('data-id');

        // Check if row matches current filters
        const matchesStatus = filterState.statuses === 'all' || filterState.statuses.includes(status);
        const matchesAidType = filterState.aidTypes === 'all' || filterState.aidTypes.includes(aidType);
        const matchesPriority = filterState.priorities === 'all' || filterState.priorities.includes(priority);

        const isVisible = matchesStatus && matchesAidType && matchesPriority;

        // Collect debug info
        if (window.aidRequestsStore.debug) {
            debugRows.push({
                ID: id,
                Status: status,
                'Aid Type': aidType,
                Priority: priority,
                'Filter Match': isVisible,
                'Status Match': matchesStatus,
                'Aid Type Match': matchesAidType,
                'Priority Match': matchesPriority
            });
        }

        // Update visibility using Bootstrap's d-none class
        if (isVisible) {
            row.classList.remove('d-none');
        } else {
            row.classList.add('d-none');
        }
    });

    if (window.aidRequestsStore.debug) {
        console.log('List View: Filter Results:', debugRows);
    }
}

// Function to update the results counter
function updateResultsCounter() {
    const counter = document.getElementById('results-counter');
    if (!counter) return;

    const visibleRows = document.querySelectorAll('#aid-request-list-body tr:not(.d-none)');
    const totalRows = document.querySelectorAll('#aid-request-list-body tr').length;

    counter.textContent = `${visibleRows.length} of ${totalRows} requests`;

    // Update counter badge classes based on results
    counter.classList.remove('bg-success', 'bg-warning', 'bg-danger');
    if (visibleRows.length === totalRows) {
        counter.classList.add('bg-success');
    } else if (visibleRows.length === 0) {
        counter.classList.add('bg-danger');
    } else {
        counter.classList.add('bg-warning');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Update results counter on initial load
    updateResultsCounter();

    // Listen for filter change events
    document.addEventListener('aidRequestsFiltered', function(event) {
        if (window.aidRequestsStore.debug) {
            console.group('List View: Filter Event Received');
            console.log('Filter State:', event.detail.filterState);
            console.log('Counts:', event.detail.counts);
            console.groupEnd();
        }

        // Update row visibility based on received filter state
        updateRowVisibility(event.detail.filterState);
    });

    // Listen for aid request updates
    document.addEventListener('aidRequestUpdated', function(event) {
        if (window.aidRequestsStore.debug) {
            console.group('List View: Update Event Received');
            console.log('Update:', event.detail);
            console.groupEnd();
        }

        const { id, updates, filterState } = event.detail;

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
