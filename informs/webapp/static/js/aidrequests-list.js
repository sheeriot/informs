/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */

// Configuration
const listConfig = { debug: false };

// Main initialization check
if (window.aidRequestsStore?.initialized) {
    if (listConfig.debug) {
        console.table({
            filterState: window.aidRequestsStore.currentState,
            statusGroups: window.aidRequestsStore.statusGroups
        });
    }
    try {
        initializeWithFilter(window.aidRequestsStore.currentState);
    } catch (error) {
        console.error('[List] Failed to initialize with existing filter state:', error);
    }
} else if (window.aidRequestsStore?.initError) {
    console.error('[List] Filter initialization failed:', window.aidRequestsStore.initError);
} else {
    if (listConfig.debug) console.log('[List] Waiting for filter initialization...');

    // Wait for filter initialization
    document.addEventListener('aidRequestsFilterReady', function(event) {
        try {
            initializeWithFilter(event.detail);
        } catch (error) {
            console.error('[List] Failed to initialize with filter event:', error);
        }
    });

    document.addEventListener('aidRequestsFilterError', function(event) {
        console.error('[List] Filter initialization failed:', event.detail.error);
    });
}

// Update list summary with filter state and counts
function updateListSummary(filterState, counts) {
    const summaryElement = document.getElementById('list-filter-summary');
    if (!summaryElement) return;

    // Build summary text
    const parts = [];
    let visibleCount = counts ? counts.matched : 0;
    let totalCount = counts ? counts.total : 0;

    // Create count element
    const countText = `${visibleCount} of ${totalCount} requests`;

    // Build filter parts - in order: Aid Type, Status, Priority
    if (filterState.aidTypes === null) {
        parts.push('Type: None selected');
    } else if (filterState.statuses === null) {
        parts.push('Status: None selected');
    } else if (filterState.priorities === null) {
        parts.push('Priority: None selected');
    } else {
        // Only add other filters if no filter is null

        // 1. Aid Type
        if (filterState.aidTypes !== 'all' && Array.isArray(filterState.aidTypes) && filterState.aidTypes.length > 0) {
            const typeLabels = filterState.aidTypes.map(type => {
                if (type === null) {
                    return 'None';
                }
                const config = window.aidRequestsStore.data.aidTypes[type];
                return config ? config.name : type;
            });
            parts.push(`Type: ${typeLabels.join(', ')}`);
        }

        // 2. Status
        if (filterState.statuses !== 'all' && Array.isArray(filterState.statuses) && filterState.statuses.length > 0) {
            const statusLabels = filterState.statuses.map(status => {
                return status.charAt(0).toUpperCase() + status.slice(1);
            });
            parts.push(`Status: ${statusLabels.join(', ')}`);
        }

        // 3. Priority
        if (filterState.priorities !== 'all' && Array.isArray(filterState.priorities) && filterState.priorities.length > 0) {
            const priorityLabels = filterState.priorities.map(p => {
                if (p === null) {
                    return 'None';
                }
                return p.charAt(0).toUpperCase() + p.slice(1);
            });
            parts.push(`Priority: ${priorityLabels.join(', ')}`);
        }
    }

    // Create the summary HTML
    summaryElement.innerHTML = `
        <div class="small text-muted lh-1">
            <div class="mb-1">${countText}</div>
            ${parts.map(part => `<div class="mb-1">${part}</div>`).join('')}
        </div>
    `;

    if (listConfig.debug) {
        console.table({
            visibleCount,
            totalCount,
            filters: parts
        });
    }
}

// Core initialization function
function initializeWithFilter(filterState) {
    if (!window.aidRequestsStore) {
        throw new Error('aidRequestsStore not available');
    }

    window.STATUS_GROUPS = window.aidRequestsStore.statusGroups;
    if (!window.STATUS_GROUPS || !window.STATUS_GROUPS.active || !window.STATUS_GROUPS.inactive) {
        throw new Error('Status groups not properly initialized in store');
    }

    if (listConfig.debug) {
        console.table({
            active: window.STATUS_GROUPS.active,
            inactive: window.STATUS_GROUPS.inactive
        });
    }

    initialize();

    if (filterState.filterState) {
        updateRowVisibility(filterState.filterState);
        updateListSummary(filterState.filterState, filterState.counts);
    }
}

// Initialize the list view
function initialize() {
    if (listConfig.debug) console.log('[List] Starting initialization...');

    // Add validation of initial state
    validateInitialState();

    // Verify table elements
    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('[List] Table body not found');
        return;
    }

    // Log initial state
    if (listConfig.debug) {
        console.log('[List] Initial table state:', {
            totalRows: tableBody.getElementsByTagName('tr').length,
            visibleRows: Array.from(tableBody.getElementsByTagName('tr'))
                .filter(row => !row.classList.contains('d-none')).length,
            hasEmptyRow: !!document.getElementById('aid-request-empty-row')
        });
    }

    // Listen for filter change events
    document.addEventListener('aidRequestsFiltered', function(event) {
        if (listConfig.debug) {
            console.log('[List] Filter event received:', {
                filterState: event.detail.filterState,
                counts: event.detail.counts
            });
        }

        // Update row visibility and summary based on received filter state
        updateRowVisibility(event.detail.filterState);
        updateListSummary(event.detail.filterState, event.detail.counts);
    });

    if (listConfig.debug) console.log('[List] Initialization complete');
}

// Update row visibility based on filter state
function updateRowVisibility(filterState) {
    if (!filterState) return;

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) return;

    const rows = tableBody.getElementsByTagName('tr');
    let visibleCount = 0;
    const totalRows = rows.length;

    Array.from(rows).forEach(row => {
        if (row.id === 'aid-request-empty-row') return;

        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority');

        // Handle null filter states - if any filter is null, only show rows that match that null state
        let isVisible;

        if (filterState.aidTypes === null) {
            // If aid types is null, hide all rows
            isVisible = false;
        } else if (filterState.statuses === null) {
            // If statuses is null, hide all rows (as no status can be null)
            isVisible = false;
        } else if (filterState.priorities === null) {
            // If priorities is null, only show rows with null priority
            isVisible = priority === 'none';
        } else {
            // Normal filtering when no null states
            const matchesStatus = filterState.statuses === 'all' ||
                                (Array.isArray(filterState.statuses) &&
                                 filterState.statuses.includes(status));

            const matchesAidType = filterState.aidTypes === 'all' ||
                                  (Array.isArray(filterState.aidTypes) &&
                                   filterState.aidTypes.includes(aidType));

            const matchesPriority = filterState.priorities === 'all' ||
                                   (Array.isArray(filterState.priorities) &&
                                    filterState.priorities.includes(priority === 'none' ? null : priority));

            isVisible = matchesStatus && matchesAidType && matchesPriority;
        }

        if (isVisible) {
            row.classList.remove('d-none');
            visibleCount++;
        } else {
            row.classList.add('d-none');
        }
    });

    const emptyRow = document.getElementById('aid-request-empty-row');
    if (emptyRow) {
        emptyRow.classList.toggle('d-none', visibleCount > 0);
    }

    if (listConfig.debug) {
        console.table({
            totalRows,
            visibleRows: visibleCount,
            filters: filterState
        });
    }
}

// Validate initial state
function validateInitialState() {
    if (!listConfig.debug) return;

    // Only validate if we have STATUS_GROUPS
    if (!window.STATUS_GROUPS || !window.STATUS_GROUPS.inactive) {
        if (listConfig.debug) console.log('[List] Skipping validation - waiting for STATUS_GROUPS');
        return;
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.warn('[List] Cannot validate initial state - table body not found');
        return;
    }

    const rows = Array.from(tableBody.getElementsByTagName('tr'));
    const issues = [];

    rows.forEach(row => {
        if (row.id === 'aid-request-empty-row') return;

        const status = row.getAttribute('data-status');
        // Safety check for status groups
        if (!status) {
            issues.push(`Row ${row.getAttribute('data-id')} has invalid status`);
            return;
        }

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
        console.warn('[List] Initial state validation issues:', issues);
        console.table(issues);
    } else {
        console.log('[List] Initial state validation passed');
    }
}
