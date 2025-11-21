document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    const SCRIPT_DEBUG = false;

    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) {
        // No filter card on this page, do nothing.
        return;
    }

    /**
     * Reads the current state of all filter checkboxes from the DOM.
     * @returns {object} The current filter state.
     */
    function getFilterStateFromDOM() {
        if (!filterCard) return {};

        const getCheckedValues = (selector) =>
            Array.from(filterCard.querySelectorAll(selector))
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.filterValue);

        // Correctly determines if an "All" checkbox is fully checked.
        const isAllChecked = (selector) => {
            const allCheckbox = filterCard.querySelector(selector);
            // It's only 'all' if the main checkbox is checked and not indeterminate.
            return allCheckbox && allCheckbox.checked && !allCheckbox.indeterminate;
        };

        // Gets the values of all checked child checkboxes for a given type.
        const getCheckedChildValues = (type) =>
            Array.from(filterCard.querySelectorAll(`[data-filter-type="${type}"]:not([id$="-all"])`))
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.filterValue);


        const aidTypes = isAllChecked('#aid-type-filter-all') ? 'all' : getCheckedChildValues('aid_type');
        const priorities = isAllChecked('#priority-filter-all') ? 'all' : getCheckedChildValues('priority');
        const statuses = getCheckedValues('[data-filter-type="status"]');

        return { status: statuses, priority: priorities, aid_type: aidTypes };
    }


    /**
     * Updates the state of a parent/group checkbox based on the state of its children.
     * @param {string} groupSelector - A CSS selector to find the child checkboxes for a specific group.
     * @param {HTMLElement} parentCheckbox - The parent checkbox element to update.
     */
    function updateParentCheckboxState(groupSelector, parentCheckbox) {
        if (!parentCheckbox) return;

        const childCheckboxes = filterCard.querySelectorAll(groupSelector);
        if (childCheckboxes.length === 0) return;

        const allChecked = Array.from(childCheckboxes).every(cb => cb.checked);
        const noneChecked = Array.from(childCheckboxes).every(cb => !cb.checked);

        if (allChecked) {
            parentCheckbox.checked = true;
            parentCheckbox.indeterminate = false;
        } else if (noneChecked) {
            parentCheckbox.checked = false;
            parentCheckbox.indeterminate = false;
        } else {
            parentCheckbox.checked = false; // A parent with some children is not "fully" checked.
            parentCheckbox.indeterminate = true;
        }
    }


    /**
     * Handles any change on any filter checkbox and orchestrates UI updates.
     * @param {Event} e - The change event.
     */
    function handleFilterChange(e) {
        const target = e.target;
        if (!target.matches('.filter-checkbox')) return;

        const filterType = target.dataset.filterType;
        const filterValue = target.dataset.filterValue;

        // --- Parent to Child Logic ---
        if (filterType === 'status_group') {
            // User clicked "Active" or "Inactive" group checkbox
            const childSelector = `#${filterValue}-status-filter-buttons .filter-checkbox[data-filter-type="status"]`;
            filterCard.querySelectorAll(childSelector).forEach(cb => cb.checked = target.checked);
        } else if (filterValue === 'all') {
            // User clicked an "All" checkbox (for Priority or Aid Type)
            filterCard.querySelectorAll(`.filter-checkbox[data-filter-type="${filterType}"]`).forEach(cb => cb.checked = target.checked);
        }

        // --- Child to Parent Logic ---
        if (filterType === 'status') {
            // A status checkbox changed, so update its parent group ("Active" or "Inactive")
            const parentGroupEl = target.closest('.status-group');
            if (parentGroupEl) {
                const parentGroup = parentGroupEl.id.includes('active') ? 'active' : 'inactive';
                const groupParentCheckbox = document.getElementById(`status-group-filter-${parentGroup}`);
                const groupChildSelector = `#${parentGroup}-status-filter-buttons .filter-checkbox[data-filter-type="status"]`;
                updateParentCheckboxState(groupChildSelector, groupParentCheckbox);
            }

        } else if (filterType === 'priority' || filterType === 'aid_type') {
            // A priority or aid_type checkbox changed, so update its "All" parent
            const allParentCheckbox = document.getElementById(`${filterType.replace('_', '-')}-filter-all`);
            const childSelector = `.filter-checkbox[data-filter-type="${filterType}"]:not([data-filter-value="all"])`;
            updateParentCheckboxState(childSelector, allParentCheckbox);
        }

        // --- Dispatch Event ---
        const newFilterState = getFilterStateFromDOM();
        if (SCRIPT_DEBUG) {
            console.log('[Filter Script] User change detected. Dispatching new filter state:', newFilterState);
        }
        document.body.dispatchEvent(new CustomEvent('filterStateChange', {
            detail: newFilterState,
            bubbles: true
        }));
    }

    // Attach a single delegated event listener to the filter card.
    filterCard.addEventListener('change', handleFilterChange);

    if (SCRIPT_DEBUG) {
        console.log(`[Filter Script] Loaded. Delegated event listener attached to filter card.`);
    }
});
