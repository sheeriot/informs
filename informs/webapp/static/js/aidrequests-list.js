/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */

// Configuration
const listConfig = {
    debug: false,  // Set to false in production
    initialized: false,
    performance: {
        loadStart: null,
        configLoaded: null,
        fullyReady: null
    }
};

// Main initialization
function initialize() {
    if (listConfig.debug) {
        console.time('[AidRequestList] Initialization');
    }

    try {
        // Get filter state from store first
        if (window.aidRequestsStore?.currentState?.filterState) {
            validateFilterState(window.aidRequestsStore.currentState.filterState);
            validateTableElements();
            validateInitialRowStates(window.aidRequestsStore.currentState.filterState);

            // Listen for filter change events
            document.addEventListener('aidRequestsFiltered', handleFilterChange);
            return;
        }

        // Fallback to initial state from template
        const filterStateInitialElement = document.getElementById('filter-state-initial');
        if (!filterStateInitialElement) {
            throw new Error('Filter state element missing from template');
        }

        const initialState = JSON.parse(filterStateInitialElement.textContent);
        const filterState = {
            statuses: initialState.statusGroup === 'inactive' ?
                     window.aidRequestsStore.statusGroups.inactive :
                     window.aidRequestsStore.statusGroups.active,
            aid_types: 'all',
            priorities: 'all'
        };

        validateFilterState(filterState);
        validateTableElements();
        validateInitialRowStates(filterState);

        // Listen for filter change events
        document.addEventListener('aidRequestsFiltered', handleFilterChange);

    } catch (error) {
        console.error('[AidRequestList] Initialization failed:', error);
        throw error;
    } finally {
        if (listConfig.debug) {
            console.timeEnd('[AidRequestList] Initialization');
        }
    }
}

// Main initialization check
if (window.aidRequestsStore?.initialized) {
    if (listConfig.debug) {
        console.table({
            'Filter State': window.aidRequestsStore.currentState,
            'Status Groups': window.aidRequestsStore.statusGroups
        });
    }
    try {
        initialize();
    } catch (error) {
        console.error('[AidRequestList] Failed to initialize:', error);
    }
} else if (window.aidRequestsStore?.initError) {
    console.error('[AidRequestList] Filter initialization failed:', window.aidRequestsStore.initError);
} else {
    if (listConfig.debug) console.log('[AidRequestList] Waiting for filter initialization...');

    document.addEventListener('aidRequestsFilterReady', function(event) {
        if (listConfig.debug) {
            console.table({
                'Event Type': 'Filter Ready',
                'Filter State': event.detail.filterState,
                'Initial Counts': event.detail.counts
            });
        }
        try {
            initialize();
        } catch (error) {
            console.error('[AidRequestList] Failed to initialize with filter event:', error);
        }
    });
}

// Validation Functions
function validateFilterState(initialFilterState) {
    const expectedKeys = ['statuses', 'aid_types', 'priorities'];
    const missingKeys = expectedKeys.filter(key => !(key in initialFilterState));
    if (missingKeys.length > 0) {
        if (listConfig.debug) {
            console.table({
                'Validation': 'Missing Keys',
                'Expected': expectedKeys.join(', '),
                'Found': Object.keys(initialFilterState).join(', '),
                'Missing': missingKeys.join(', ')
            });
        }
    }
}

function validateTableElements() {
    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        throw new Error('Table body element missing from template');
    }
    return tableBody;
}

function validateInitialRowStates(initialFilterState) {
    const tableBody = validateTableElements();
    const initialRows = Array.from(tableBody.getElementsByTagName('tr'));
    const rowAnalysis = initialRows
        .filter(row => row.id !== 'aid-request-empty-row')
        .map(row => ({
            id: row.getAttribute('data-id'),
            status: row.getAttribute('data-status'),
            aidType: row.getAttribute('data-aid-type'),
            priority: row.getAttribute('data-priority'),
            isHidden: row.classList.contains('d-none'),
            shouldBeHidden: !matchesFilterState(row, initialFilterState)
        }));

    validateVisibilityMismatches(rowAnalysis);
    validateEmptyRowState(rowAnalysis);
    logInitialState(rowAnalysis);
}

function validateVisibilityMismatches(rowAnalysis) {
    const visibilityMismatches = rowAnalysis.filter(row => row.isHidden !== row.shouldBeHidden);
    if (visibilityMismatches.length > 0) {
        if (listConfig.debug) {
            console.log('[AidRequestList] Row visibility mismatches found:');
            console.table(visibilityMismatches.map(row => ({
                'Row ID': row.id,
                'Status': row.status,
                'Currently Hidden': row.isHidden,
                'Should Be Hidden': row.shouldBeHidden,
                'Mismatch Type': row.isHidden ? 'Hidden but should show' : 'Shown but should hide'
            })));
        }
    }
}

function validateEmptyRowState(rowAnalysis) {
    const emptyRow = document.getElementById('aid-request-empty-row');
    const visibleRows = rowAnalysis.filter(row => !row.shouldBeHidden);
    if (emptyRow) {
        const emptyRowVisible = !emptyRow.classList.contains('d-none');
        const shouldShowEmpty = visibleRows.length === 0;
        if (emptyRowVisible !== shouldShowEmpty) {
            if (listConfig.debug) {
                console.table({
                    'Empty Row': {
                        'Currently Visible': emptyRowVisible,
                        'Should Be Visible': shouldShowEmpty,
                        'Visible Row Count': visibleRows.length
                    }
                });
            }
        }
    }
}

function logInitialState(rowAnalysis) {
    if (listConfig.debug) {
        console.table({
            'Initial State': {
                'Total Rows': rowAnalysis.length,
                'Visible Rows': rowAnalysis.filter(row => !row.shouldBeHidden).length,
                'Hidden Rows': rowAnalysis.filter(row => row.shouldBeHidden).length,
                'Empty Row Present': !!document.getElementById('aid-request-empty-row')
            }
        });
    }
}

// Event Handlers
function handleFilterChange(event) {
    if (!event.detail?.filterState) {
        console.error('[AidRequestList] Invalid filter event - missing filterState:', event);
        return;
    }

    if (listConfig.debug) {
        console.log('[AidRequestList] Filter change event:', event.detail);
    }

    // Update visibility and summary based on new filter state
    updateRowVisibility(event.detail.filterState);
    updateListSummary(event.detail.filterState, event.detail.counts);
}

// Helper Functions
function matchesFilterState(row, filterState) {
    const status = row.getAttribute('data-status');
    const aidType = row.getAttribute('data-aid-type');
    const priority = row.getAttribute('data-priority');

    const matchesStatus = filterState.statuses === 'all' ||
                         (Array.isArray(filterState.statuses) && filterState.statuses.includes(status));
    const matchesAidType = filterState.aid_types === 'all' ||
                          (Array.isArray(filterState.aid_types) && filterState.aid_types.includes(aidType));

    // Handle priority matching with null/none values
    const matchesPriority = filterState.priorities === 'all' ||
                           (Array.isArray(filterState.priorities) && filterState.priorities.some(p => {
                               // Convert both to null for comparison if they represent "no priority"
                               const rowPriority = (priority === 'none' || priority === 'null' || !priority) ? null : priority;
                               const filterPriority = (p === 'none' || p === 'null' || !p) ? null : p;

                               if (listConfig.debug) {
                                   console.log('[List] Priority comparison:', {
                                       rowId: row.getAttribute('data-id'),
                                       rawRowPriority: priority,
                                       normalizedRowPriority: rowPriority,
                                       rawFilterPriority: p,
                                       normalizedFilterPriority: filterPriority,
                                       matches: rowPriority === filterPriority
                                   });
                               }

                               return rowPriority === filterPriority;
                           }));

    if (listConfig.debug) {
        console.log('[List] Row match check:', {
            rowId: row.getAttribute('data-id'),
            status: { value: status, matches: matchesStatus },
            aidType: { value: aidType, matches: matchesAidType },
            priority: {
                value: priority,
                matches: matchesPriority,
                filterValues: filterState.priorities
            }
        });
    }

    return matchesStatus && matchesAidType && matchesPriority;
}

// Update Functions
function updateRowVisibility(filterState) {
    if (!filterState) {
        console.error('[List] Cannot update visibility - no filter state provided');
        return;
    }

    if (listConfig.debug) {
        console.log('[List] Updating row visibility with filter state:', {
            statuses: filterState.statuses,
            aid_types: filterState.aid_types,
            priorities: filterState.priorities
        });
    }

    const tableBody = document.querySelector('#aid-request-list-body');
    if (!tableBody) {
        console.error('[List] Cannot update visibility - table body not found');
        return;
    }

    const rows = Array.from(tableBody.getElementsByTagName('tr'));
    let visibleCount = 0;
    let hiddenCount = 0;

    rows.forEach(row => {
        if (row.id === 'aid-request-empty-row') return;

        const shouldBeVisible = matchesFilterState(row, filterState);
        const wasVisible = !row.classList.contains('d-none');
        row.classList.toggle('d-none', !shouldBeVisible);

        if (shouldBeVisible) {
            visibleCount++;
        } else {
            hiddenCount++;
        }

        if (listConfig.debug && wasVisible !== shouldBeVisible) {
            console.log(`[List] Row visibility changed:`, {
                rowId: row.getAttribute('data-id'),
                status: row.getAttribute('data-status'),
                aidType: row.getAttribute('data-aid-type'),
                priority: row.getAttribute('data-priority'),
                wasVisible,
                shouldBeVisible
            });
        }
    });

    // Update empty row visibility
    const emptyRow = document.getElementById('aid-request-empty-row');
    if (emptyRow) {
        const showEmpty = visibleCount === 0;
        emptyRow.classList.toggle('d-none', !showEmpty);
        if (listConfig.debug) {
            console.log('[List] Empty row visibility:', {
                visible: showEmpty,
                visibleCount,
                hiddenCount
            });
        }
    }

    if (listConfig.debug) {
        logVisibilityUpdate(rows, visibleCount, filterState);
    }
}

function updateListSummary(filterState, counts) {
    const summaryElement = document.getElementById('list-filter-summary');
    if (!summaryElement) return;

    const parts = buildSummaryParts(filterState, counts);
    summaryElement.innerHTML = buildSummaryHTML(parts, counts);

    if (listConfig.debug) {
        console.table({
            visibleCount: counts?.matched || 0,
            totalCount: counts?.total || 0,
            filters: parts
        });
    }
}

function buildSummaryParts(filterState, counts) {
    const parts = [];
    if (filterState.aid_types === null) {
        parts.push('Type: None selected');
    } else if (filterState.statuses === null) {
        parts.push('Status: None selected');
    } else if (filterState.priorities === null) {
        parts.push('Priority: None selected');
    } else {
        addAidTypePart(parts, filterState);
        addStatusPart(parts, filterState);
        addPriorityPart(parts, filterState);
    }
    return parts;
}

function buildSummaryHTML(parts, counts) {
    const countText = `${counts?.matched || 0} of ${counts?.total || 0} requests`;
    return `
        <div class="small text-muted lh-1">
            <div class="mb-1">${countText}</div>
            ${parts.map(part => `<div class="mb-1">${part}</div>`).join('')}
        </div>
    `;
}

function logVisibilityUpdate(rows, visibleCount, filterState) {
    const finalVisibleRows = rows.filter(row => !row.classList.contains('d-none') && row.id !== 'aid-request-empty-row');
    console.log('[List] Visibility update complete:', {
        totalRows: rows.length,
        expectedVisible: visibleCount,
        actuallyVisible: finalVisibleRows.length,
        visibleRowIds: finalVisibleRows.map(row => row.getAttribute('data-id')),
        filterState
    });
}

// Summary Part Helper Functions
function addAidTypePart(parts, filterState) {
    if (filterState.aid_types !== 'all' && Array.isArray(filterState.aid_types) && filterState.aid_types.length > 0) {
        const typeLabels = filterState.aid_types.map(type => {
            if (type === null) return 'None';
            const config = window.aidRequestsStore.data.aidTypes[type];
            return config ? config.name : type;
        });
        parts.push(`Type: ${typeLabels.join(', ')}`);
    }
}

function addStatusPart(parts, filterState) {
    if (filterState.statuses !== 'all' && Array.isArray(filterState.statuses) && filterState.statuses.length > 0) {
        const statusLabels = filterState.statuses.map(status =>
            status.charAt(0).toUpperCase() + status.slice(1)
        );
        parts.push(`Status: ${statusLabels.join(', ')}`);
    }
}

function addPriorityPart(parts, filterState) {
    if (filterState.priorities !== 'all' && Array.isArray(filterState.priorities) && filterState.priorities.length > 0) {
        const priorityLabels = filterState.priorities.map(p => {
            if (p === null) return 'None';
            return p.charAt(0).toUpperCase() + p.slice(1);
        });
        parts.push(`Priority: ${priorityLabels.join(', ')}`);
    }
}
