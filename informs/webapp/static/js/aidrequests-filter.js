/**
 * aidrequests-filter.js
 *
 * Manages the filter checkboxes on the aid request list page.
 * - Handles the UI logic for "All" checkboxes and their corresponding individual options.
 * - Reads the state of all checkboxes to build a `filterState` object.
 * - Applies this filter state directly to the aid request list by toggling the `d-none` class on table rows.
 * - Dispatches `updateMapLayer` and `updateFilterCounts` events to notify other components of the change.
 */
document.addEventListener('DOMContentLoaded', function() {
    const scriptConfig = {
        debug: true,
        version: '0.0.14'
    };

    if (scriptConfig.debug) {
        console.log(`[Filter Script] Version ${scriptConfig.version} loaded.`);
    }

    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) return;

    // --- Main Event Listener for all filter changes ---
    filterCard.addEventListener('change', function(event) {
        if (event.target.matches('.filter-checkbox, [id^="status-group-filter-"]')) {
            handleFilterChange(event.target);
        }
    });

    // Signal that the filter component is ready.
    document.body.dispatchEvent(new CustomEvent('componentReady', { detail: { name: 'filter' } }));

    // We no longer need to apply filter on load from this script.
    // aidrequests-list.js will handle the initial data fetching and filtering.
});


function handleFilterChange(checkbox) {
    // Handle the visual logic for checkbox groups (e.g., 'All' <-> individuals)
    if (checkbox.id.endsWith('-all')) {
        handleAllCheckbox(checkbox);
    } else {
        handleIndividualCheckbox(checkbox);
    }

    // After handling the checkbox UI, get the definitive state and trigger updates.
    // We use a small timeout to ensure the DOM has been updated by the functions above.
    setTimeout(() => {
        // The only thing this script should do is fire an event that the filters have changed.
        // Other scripts will listen for this and decide what to do.
        document.body.dispatchEvent(new CustomEvent('filterStateChange'));
    }, 50);
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
