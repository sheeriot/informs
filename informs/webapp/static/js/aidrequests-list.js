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
        console.log('[List] Filter already initialized, using current state:', {
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
    console.error('[List] Filter initialization previously failed:', window.aidRequestsStore.initError);
} else {
    if (listConfig.debug) console.log('[List] Waiting for filter initialization...');

    // Wait for filter initialization
    document.addEventListener('aidRequestsFilterReady', function(event) {
        if (listConfig.debug) {
            console.log('[List] Filter ready event received:', {
                filterState: event.detail,
                store: {
                    statusGroups: window.aidRequestsStore.statusGroups,
                    initialized: window.aidRequestsStore.initialized
                }
            });
        }
        try {
            initializeWithFilter(event.detail);
        } catch (error) {
            console.error('[List] Failed to initialize with filter event:', error);
        }
    });

    // Handle filter initialization errors
    document.addEventListener('aidRequestsFilterError', function(event) {
        console.error('[List] Filter initialization failed:', event.detail.error);
    });
}

// Core initialization function
function initializeWithFilter(filterState) {
    if (listConfig.debug) {
        console.log('[List] Initializing with filter state:', filterState);
    }

    // Ensure we have access to the store and status groups
    if (!window.aidRequestsStore) {
        throw new Error('aidRequestsStore not available');
    }

    // Get status groups from store
    window.STATUS_GROUPS = window.aidRequestsStore.statusGroups;
    if (!window.STATUS_GROUPS || !window.STATUS_GROUPS.active || !window.STATUS_GROUPS.inactive) {
        throw new Error('Status groups not properly initialized in store');
    }

    if (listConfig.debug) {
        console.log('[List] Using status groups from store:', {
            active: window.STATUS_GROUPS.active,
            inactive: window.STATUS_GROUPS.inactive
        });
    }

    // Initialize the list view
    initialize();

    // Update initial visibility based on filter state
    updateRowVisibility(filterState);
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

        // Update row visibility based on received filter state
        updateRowVisibility(event.detail.filterState);
    });

    if (listConfig.debug) console.log('[List] Initialization complete');
}

// Update row visibility based on filter state
function updateRowVisibility(filterState) {
    if (!filterState) {
        console.warn('[List] No filter state provided');
        return;
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('[List] Table body not found');
        return;
    }

    if (listConfig.debug) {
        console.log('[List] Updating visibility with filter state:', filterState);
    }

    // Handle both initial state and filter change events
    const actualFilterState = filterState.filterState || filterState;

    const rows = tableBody.getElementsByTagName('tr');
    let visibleCount = 0;
    const totalRows = rows.length;

    Array.from(rows).forEach(row => {
        // Skip the empty message row
        if (row.id === 'aid-request-empty-row') return;

        const status = row.getAttribute('data-status');
        const aidType = row.getAttribute('data-aid-type');
        const priority = row.getAttribute('data-priority'); // Will be "none" or a priority value

        // Check if row matches current filters
        const matchesStatus = actualFilterState.statuses === 'all' ||
                            (Array.isArray(actualFilterState.statuses) &&
                             actualFilterState.statuses.includes(status));

        const matchesAidType = actualFilterState.aidTypes === 'all' ||
                              (Array.isArray(actualFilterState.aidTypes) &&
                               actualFilterState.aidTypes.includes(aidType));

        const matchesPriority = actualFilterState.priorities === 'all' ||
                               (Array.isArray(actualFilterState.priorities) &&
                                actualFilterState.priorities.includes(priority === 'none' ? null : priority));

        if (listConfig.debug) {
            console.log('[List] Row filter check:', {
                id: row.getAttribute('data-id'),
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

        // Use d-none class for visibility control
        if (matchesStatus && matchesAidType && matchesPriority) {
            row.classList.remove('d-none');
            visibleCount++;
        } else {
            row.classList.add('d-none');
        }
    });

    // Handle empty state
    const emptyRow = document.getElementById('aid-request-empty-row');
    if (emptyRow) {
        emptyRow.classList.toggle('d-none', visibleCount > 0);
    }

    if (listConfig.debug) {
        console.log('[List] Visibility updated:', {
            totalRows,
            visibleRows: visibleCount,
            filters: actualFilterState
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
