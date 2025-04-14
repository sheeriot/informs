/**
 * list-aid-requests.js
 *
 * Implements List.js for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering, sorting, and searching functionality
 */

// Configuration object
window.listjsConfig = {
    debug: true  // Set to true to enable debugging output
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
    if (window.listjsConfig.debug) {
        console.log('Updating row visibility with filter state:', filterState);
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('Table body not found');
        return;
    }

    const rows = tableBody.getElementsByTagName('tr');
    const visibleIds = [];

    Array.from(rows).forEach(row => {
        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority');
        const id = row.getAttribute('data-id');

        if (window.listjsConfig.debug) {
            console.log(`Row ${id} - Status: ${status}, Aid Type: ${aidType}, Priority: ${priority}`);
        }

        // Check if row matches current filters
        const matchesStatus = !filterState.statuses.length || filterState.statuses.includes(status);
        const matchesAidType = !filterState.aidTypes.length || filterState.aidTypes.includes(aidType);
        const matchesPriority = !filterState.priorities.length || filterState.priorities.includes(priority);

        const isVisible = matchesStatus && matchesAidType && matchesPriority;

        // Update visibility
        if (isVisible) {
            row.classList.remove('d-none');
            visibleIds.push(parseInt(id));
        } else {
            row.classList.add('d-none');
        }
    });

    if (window.listjsConfig.debug) {
        console.log('Visible IDs for Map:', visibleIds);
    }

    // Dispatch event with only the visible IDs
    const event = new CustomEvent('aidRequestsFiltered', {
        detail: {
            visibleIds: visibleIds
        }
    });
    document.dispatchEvent(event);

    // Update results counter
    updateResultsCounter();
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

    // Trigger initial filter to show all rows
    if (window.statusFilterConfig && window.statusFilterConfig.triggerFilterChange) {
        window.statusFilterConfig.triggerFilterChange();
    }
});
