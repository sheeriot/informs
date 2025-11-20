/**
 * aidrequests-filter.js
 *
 * Manages the filter checkboxes on the aid request list page.
 * - Handles the UI logic for "All" checkboxes and their corresponding individual options.
 * - Reads the state of all checkboxes to build a `filterState` object.
 * - Applies this filter state directly to the aid request list by toggling the `d-none` class on table rows.
 * - Dispatches `updateMapLayer` and `updateFilterCounts` events to notify other components of the change.
 */
const requestsFilterConfig = {
    debug: true,
    version: '0.0.14'
};

document.addEventListener('DOMContentLoaded', function() {
    const requestsFilterConfig = {
        debug: true,
        version: '0.0.14'
    };

    if (requestsFilterConfig.debug) {
        console.log(`[Filter Script] Version ${requestsFilterConfig.version} loaded.`);
    }

    // Attach event listeners to filter checkboxes
    const filterCheckboxes = document.querySelectorAll('.filter-checkbox');
    filterCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => handleFilterChange(cb));
    });
});


// Expose the initialize function globally so the main list script can call it
window.initializeAidRequestFilter = function() {
    if (requestsFilterConfig.debug) console.log('[Filter Script] Initializing...');

    // Dispatch the initial state
    const initialState = getFilterState();
    if (requestsFilterConfig.debug) console.log('[Filter Script] Dispatching initial filter state:', initialState);
    document.body.dispatchEvent(new CustomEvent('filterStateChange', { detail: initialState }));

    document.body.dispatchEvent(new CustomEvent('componentReady', { detail: { name: 'filter' } }));
}

function handleFilterChange(targetCheckbox) {
    if (!targetCheckbox) {
        if (requestsFilterConfig.debug) console.error('[Filter Script] handleFilterChange called with invalid target.');
        return;
    }
    const filterType = targetCheckbox.dataset.filterType;
    const allCheckbox = document.getElementById(`${filterType}-filter-all`);

    // Handle 'All' checkbox logic
    if (allCheckbox.id === targetCheckbox.id) { // The 'All' checkbox was changed
        const isChecked = targetCheckbox.checked;
        const checkboxes = document.querySelectorAll(`.filter-checkbox[data-filter-type="${filterType}"]`);
        checkboxes.forEach(cb => {
            cb.checked = isChecked;
        });
    } else { // An individual checkbox was changed
        // Handle the visual logic for checkbox groups (e.g., 'All' <-> individuals)
        if (targetCheckbox.id.endsWith('-all')) {
            handleAllCheckbox(targetCheckbox);
        } else {
            handleIndividualCheckbox(targetCheckbox);
        }
    }

    // After handling the checkbox UI, get the definitive state and trigger updates.
    // We use a small timeout to ensure the DOM has been updated by the functions above.
    setTimeout(() => {
        const filterState = getFilterState();
        if (requestsFilterConfig.debug) console.log('[Filter Script] Firing filterStateChange with state:', filterState);
        document.body.dispatchEvent(new CustomEvent('filterStateChange', { detail: filterState }));
    }, 50);
}

function getFilterState() {
    const filterState = {
        status: [],
        priority: [],
        aid_type: []
    };

    const filterCheckboxes = document.querySelectorAll('.filter-checkbox:checked');

    filterCheckboxes.forEach(cb => {
        const filterType = cb.dataset.filterType;
        const filterValue = cb.dataset.filterValue;

        if (filterType && filterValue && filterState[filterType] && filterValue !== 'all') {
            filterState[filterType].push(filterValue);
        }
    });

    return filterState;
}

// This function is being moved to aidrequests-list.js
// function applyListFilter(filterState) {
//     const rows = document.querySelectorAll('#aid-request-list-body tr.aid-request-row');
//
//     rows.forEach(row => {
//         const status = row.dataset.status;
//         const priority = row.dataset.priority;
//         const aidType = row.dataset.aidType;
//
//         const statusMatch = filterState.statuses === 'all' || filterState.statuses.includes(status);
//         const priorityMatch = filterState.priorities === 'all' || filterState.priorities.includes(priority);
//         const aidTypeMatch = filterState.aid_types === 'all' || filterState.aid_types.includes(aidType);
//
//         if (statusMatch && priorityMatch && aidTypeMatch) {
//             row.classList.remove('d-none');
//         } else {
//             row.classList.add('d-none');
//         }
//     });
// }


// --- Checkbox Group UI Logic ---

function handleAllCheckbox(allCheckbox) {
    const filterType = allCheckbox.dataset.filterType;
    const isChecked = allCheckbox.checked;
    document.querySelectorAll(`[data-filter-type="${filterType}"]:not([id$="-all"])`)
        .forEach(cb => cb.checked = isChecked);
}

function handleIndividualCheckbox(checkbox) {
    const filterType = checkbox.dataset.filterType;
    if (!filterType || filterType === 'status_group') return;

    const allCheckbox = document.getElementById(`${filterType.replace('_', '-')}-filter-all`);
    if (!allCheckbox) return;

    const allRelated = document.querySelectorAll(`[data-filter-type="${filterType}"]:not([id$="-all"])`);
    const allChecked = Array.from(allRelated).every(cb => cb.checked);
    const someChecked = Array.from(allRelated).some(cb => cb.checked);

    allCheckbox.checked = allChecked;
    allCheckbox.indeterminate = !allChecked && someChecked;
        }

// Handle Status group logic separately as it's a bit different
document.addEventListener('change', function(event) {
    const target = event.target;
    if (target.matches('[data-filter-type="status_group"]')) {
        const group = target.dataset.filterValue;
        const isChecked = target.checked;
        document.querySelectorAll(`[data-filter-type="status"][data-group="${group}"]`)
            .forEach(cb => cb.checked = isChecked);
    } else if (target.matches('[data-filter-type="status"]')) {
        const group = target.dataset.group;
        const groupCheckbox = document.getElementById(`status-group-filter-${group}`);
        if(groupCheckbox) {
            const allInGroup = document.querySelectorAll(`[data-filter-type="status"][data-group="${group}"]`);
            const allChecked = Array.from(allInGroup).every(cb => cb.checked);
            const someChecked = Array.from(allInGroup).some(cb => cb.checked);
            groupCheckbox.checked = allChecked;
            groupCheckbox.indeterminate = !allChecked && someChecked;
        }
    }
    });
