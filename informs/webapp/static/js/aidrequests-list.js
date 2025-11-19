/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */

// This script needs to be loaded after the data blocks in the HTML.

document.addEventListener('DOMContentLoaded', function() {
    const scriptConfig = {
        debug: false,
        version: '0.0.14',
        fieldOpSlug: document.body.dataset.fieldOpSlug,
        urls: {
            getFilterCounts: `/api/${document.body.dataset.fieldOpSlug}/filter-counts/`
        }
    };

    if (!scriptConfig.fieldOpSlug) {
        console.error("[List Script] Field Op slug not found in body dataset. Aborting.");
        return;
    }

    if (scriptConfig.debug) {
        console.log(`[List Script] Version ${scriptConfig.version} initialized for FieldOp: ${scriptConfig.fieldOpSlug}`);
    }

    const componentsReady = {
        map: false,
        filter: false,
        list: false // This script itself
    };
    let initialFilterApplied = false;

    function checkAllComponentsReady() {
        if (initialFilterApplied) return; // Only run once

        if (componentsReady.map && componentsReady.filter && componentsReady.list) {
            if (scriptConfig.debug) {
                console.log('[List Script] All components ready. Triggering initial filter application.');
            }
            initialFilterApplied = true;
            runFilterAndUpdates();
        } else {
            if (scriptConfig.debug) {
                console.log('[List Script] Waiting for components...', componentsReady);
            }
        }
    }

    document.body.addEventListener('componentReady', (e) => {
        const componentName = e.detail?.name;
        if (componentName && componentsReady.hasOwnProperty(componentName)) {
            componentsReady[componentName] = true;
            if (scriptConfig.debug) {
                console.log(`[List Script] Received ready signal from: ${componentName}`);
            }
            checkAllComponentsReady();
        }
    });

    // Listener for row updates
    document.body.addEventListener('click', function(event) {
        const statusTarget = event.target.closest('.status-option');
        const priorityTarget = event.target.closest('.priority-option');
        const copyTarget = event.target.closest('.copy-address-icon');

        // Handle Status or Priority change from dropdown
        if (statusTarget || priorityTarget) {
            event.preventDefault();
            const target = statusTarget || priorityTarget;
            const dropdown = target.closest('.dropdown-menu');
            const triggerButton = document.getElementById('status-priority-change-trigger');

            if (dropdown) bootstrap.Dropdown.getInstance(dropdown.previousElementSibling)?.hide();

            const row = target.closest('.aid-request-row');
            const updateUrl = row.dataset.urlUpdate;
            const fieldOpName = document.querySelector('[data-field-op-name]')?.dataset.fieldOpName || '';
            const aidRequestId = row.dataset.id;
            const requesterName = row.querySelector('.d-none.d-md-table-cell')?.textContent || '';

            const fieldName = statusTarget ? 'status' : 'priority';
            const newValue = target.dataset[fieldName];
            const oldValue = row.dataset[fieldName];
            const newValueDisplay = target.textContent.trim();
            const oldValueDisplay = row.querySelector(`.${fieldName}-button`).textContent.trim();

            if (newValue === oldValue) {
                return; // Do nothing if the value hasn't changed
            }

            triggerButton.dataset.actionUrl = updateUrl;
            triggerButton.dataset.fieldOpName = fieldOpName;
            triggerButton.dataset.aidRequestId = aidRequestId;
            triggerButton.dataset.requesterFullName = requesterName;

            const capitalizedFieldName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
            triggerButton.dataset.actionName = `Change ${capitalizedFieldName}`;
            triggerButton.dataset.oldValue = oldValueDisplay;
            triggerButton.dataset.newValue = newValueDisplay;

            // Icon and class mapping
            const styleMap = {
                'high': { icon: 'exclamation-diamond-fill', btnClass: 'btn-danger' },
                'medium': { icon: 'exclamation-triangle-fill', btnClass: 'btn-warning' },
                'low': { icon: 'info-circle-fill', btnClass: 'btn-primary' },
                'new': { icon: 'download', btnClass: 'btn-primary' },
                'assigned': { icon: 'person-check-fill', btnClass: 'btn-primary' },
                'resolved': { icon: 'hand-thumbs-up-fill', btnClass: 'btn-success' },
                'closed': { icon: 'door-closed-fill', btnClass: 'btn-dark' },
                'rejected': { icon: 'x-circle-fill', btnClass: 'btn-danger' },
                'other': { icon: 'question-circle-fill', btnClass: 'btn-secondary' },
                'default': { icon: 'question-circle-fill', btnClass: 'btn-primary' }
            };
            const styles = styleMap[newValue] || styleMap['default'];

            triggerButton.dataset.confirmButtonText = `Change to ${newValueDisplay}`;
            triggerButton.dataset.confirmButtonIcon = styles.icon;
            triggerButton.dataset.confirmButtonClass = styles.btnClass;

            delete triggerButton.dataset.status;
            delete triggerButton.dataset.priority;
            triggerButton.dataset[fieldName] = newValue;

            const modalEl = document.querySelector(triggerButton.dataset.bsTarget);
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show(triggerButton);

            // Revert dropdown if modal is cancelled
            modalEl.addEventListener('hide.bs.modal', (e) => {
                const modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (!modalInstance.isConfirmed) {
                    // This part is tricky because we are not using radio buttons.
                    // For now, we will just let it be. Re-selecting the old value is not trivial.
                }
            }, { once: true });
        }
        // Handle copy-to-clipboard
        else if (copyTarget) {
            const address = copyTarget.getAttribute('data-address');
            if (address) {
                navigator.clipboard.writeText(address).then(() => {
                    const originalIcon = copyTarget.className;
                    const tooltip = bootstrap.Tooltip.getInstance(copyTarget);
                    const originalTitle = copyTarget.getAttribute('title');

                    // Provide feedback
                    copyTarget.className = 'bi bi-check-lg text-success';
                    if (tooltip) {
                        tooltip.setContent({ '.tooltip-inner': 'Copied!' });
                        tooltip.show();
                    }

                    // Revert after a delay
                    setTimeout(() => {
                        copyTarget.className = originalIcon;
                        if (tooltip) {
                            tooltip.setContent({ '.tooltip-inner': originalTitle });
                            tooltip.hide();
                        }
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy address: ', err);
                });
            }
        }
    });

    document.body.addEventListener('show.bs.modal', function(event) {
        const modal = event.target;
        if (modal.id !== 'actionConfirmationModal') return;

        const triggerButton = event.relatedTarget;
        if (!triggerButton || !triggerButton.dataset.actionUrl) {
            return;
        }

        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (!modalInstance) return;

        modalInstance.isConfirmed = false;

        const modalTitle = modal.querySelector('.modal-title');
        const modalBody = modal.querySelector('.modal-body-dynamic');
        const confirmBtn = modal.querySelector('.confirm-action-btn');

        // --- Title Logic ---
        const aidRequestId = triggerButton.dataset.aidRequestId || '';
        const requesterName = triggerButton.dataset.requesterFullName || '';

        const newTitle = `
            <div class="d-flex flex-column">
                <small>Aid Request #${aidRequestId}: ${requesterName}</small>
            </div>`;
        if (modalTitle) {
            modalTitle.innerHTML = newTitle;
    }

        // --- Body Logic ---
        const actionName = triggerButton.dataset.actionName || "perform this action";
        const oldValue = triggerButton.dataset.oldValue;
        const newValue = triggerButton.dataset.newValue;

        modalBody.innerHTML = `
            <h5 class="mb-3">${actionName}</h5>
            <div class="ms-3">
                 <p class="mb-1"><strong>From:</strong> <span class="text-muted">${oldValue}</span></p>
                 <p class="mb-0"><strong>To:</strong> <span class="fs-5">${newValue}</span></p>
            </div>`;

        // --- Clear Stale Form Data ---
        const noteTextarea = modal.querySelector('.action-note-textarea');
        const markdownCheckbox = modal.querySelector('.action-markdown-checkbox');
        if (noteTextarea) noteTextarea.value = '';
        if (markdownCheckbox) markdownCheckbox.checked = false;

        // --- Configure Confirm Button ---
        if (confirmBtn) {
            // Apply custom styles from trigger button
            const btnClass = triggerButton.dataset.confirmButtonClass || 'btn-primary';
            const btnIcon = triggerButton.dataset.confirmButtonIcon;
            const btnText = triggerButton.dataset.confirmButtonText || 'Confirm';

            confirmBtn.className = 'btn confirm-action-btn'; // Reset classes
            confirmBtn.classList.add(btnClass);

            let iconHTML = '';
            if (btnIcon) {
                iconHTML = `<i class="bi bi-${btnIcon} me-2"></i>`;
            }
            confirmBtn.innerHTML = `${iconHTML}${btnText}`;

            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener('click', function() {
                modalInstance.isConfirmed = true;
                const note = noteTextarea ? noteTextarea.value : '';
                const isMarkdown = markdownCheckbox ? markdownCheckbox.checked : false;
                const payload = { ...triggerButton.dataset };
                payload.note = note;
                payload.note_markdown = isMarkdown;

                // Clean up unnecessary data from payload
                Object.keys(payload).forEach(key => {
                    if (key.startsWith('bs') || ['actionName', 'oldValue', 'newValue', 'requesterFullName', 'fieldOpName', 'confirmButtonClass', 'confirmButtonIcon', 'confirmButtonText'].includes(key)) {
                        delete payload[key];
                    }
                });

                const url = triggerButton.dataset.actionUrl;
                const method = triggerButton.dataset.httpMethod || 'POST';

                fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify(payload)
                })
                .then(response => {
                    if (response.ok) {
                        modalInstance.hide();

                        const aidRequestId = payload.aidRequestId;
                        htmx.trigger('body', `update-row-${aidRequestId}`, {});

                        // Update the local data store, which will trigger count and map updates
                        // This part is now handled by the backend updateFilterCounts event
                        // if (window.aidRequestsStore && window.aidRequestsStore.updateAidRequest) {
                        //     const updates = {};
                        //     if (payload.status) {
                        //         updates.status = payload.status;
                        //     }
                        //     if (payload.priority) {
                        //         updates.priority = payload.priority;
                        //     }
                        //     window.aidRequestsStore.updateAidRequest(aidRequestId, updates);
                        // }

                    } else {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                })
                .catch(error => {
                    console.error('[Actions] There was a problem with the fetch operation:', error);
                });
            });
        }
    });

    // After a row is updated and swapped by HTMX, we need to re-run the counts.
    document.body.addEventListener('htmx:afterSwap', function(event) {
        // Check if the swap happened on one of our rows
        if (event.target.matches('.aid-request-row')) {
            if (scriptConfig.debug) {
                console.log('[List Script] Row updated via HTMX. Triggering map point update and filter counts.');
            }

            // Trigger the map to update the specific point
            document.body.dispatchEvent(new CustomEvent('mapPointShouldUpdate', {
                detail: { rowElement: event.target }
            }));

            // After a row changes, refetch the counts and update filters
            runFilterAndUpdates();
        }
    });

    // Listen for the custom event from the filter script
    document.body.addEventListener('filterStateChange', function() {
        if (scriptConfig.debug) {
            console.log('[List Script] Received filterStateChange event.');
        }
        runFilterAndUpdates();
    });

    initializeTooltips();

    // Signal that this script is ready and check if all others are too.
    componentsReady.list = true;
    checkAllComponentsReady();

    function runFilterAndUpdates() {
        const filterState = getFilterStateFromDOM();

        if (scriptConfig.debug) {
            console.log('[List Script] Running filter and updates with state:', filterState);
        }

        applyListFilter(filterState);
        document.body.dispatchEvent(new CustomEvent('updateMapLayer', { detail: { filterState: filterState } }));
        fetchFilterCounts(scriptConfig, filterState);
    }

    function applyListFilter(filterState) {
        const rows = document.querySelectorAll('#aid-request-list-body tr.aid-request-row');
        let visibleCount = 0;

        rows.forEach(row => {
            const status = row.dataset.status;
            const priority = row.dataset.priority || 'none';
            const aidType = row.dataset.aidType;

            const statusMatch = filterState.statuses.length === 0 || filterState.statuses.includes(status);

            let priorityMatch = true;
            if (filterState.priorities !== 'all') {
                priorityMatch = filterState.priorities.includes(priority);
            }

            let aidTypeMatch = true;
            if (filterState.aid_types !== 'all') {
                aidTypeMatch = filterState.aid_types.includes(aidType);
            }

            if (statusMatch && priorityMatch && aidTypeMatch) {
                row.classList.remove('d-none');
                visibleCount++;
            } else {
                row.classList.add('d-none');
            }
        });

        if (scriptConfig.debug) {
            console.log(`[List Script] Applied filter. Visible rows: ${visibleCount}`);
        }
    }

    function fetchFilterCounts(config, filterState) {
        fetch(config.urls.getFilterCounts, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify(filterState)
        })
        .then(response => response.json())
        .then(data => {
            if (config.debug) {
                console.log('[List Script] Received new counts from backend.');
            }
            updateFilterUIDisplay(data);
        })
        .catch(error => {
            console.error('[List Script] Error fetching filter counts:', error);
        });
    }

    function updateFilterUIDisplay(counts) {
        // Update main results counter
        const resultsCounter = document.getElementById('results-counter');
        if (resultsCounter) {
            resultsCounter.textContent = `${counts.matched} of ${counts.total} requests`;
        }

        // Update 'All' counters
        const allAidType = document.querySelector('label[for="aid-type-filter-all"]');
        if (allAidType) allAidType.innerHTML = `All <span class="text-muted">(${counts.matched})</span>`;

        const allPriority = document.querySelector('label[for="priority-filter-all"]');
        if (allPriority) allPriority.innerHTML = `All <span class="text-muted">(${counts.matched})</span>`;


        // Update status group totals
        document.getElementById('status-group-filter-active-total').textContent = `(${counts.groups.active.filtered})`;
        document.getElementById('status-group-filter-inactive-total').textContent = `(${counts.groups.inactive.filtered})`;

        // Update individual status counts
        for (const [status, count] of Object.entries(counts.byStatus)) {
            const el = document.getElementById(`status-filter-${status}-count`);
            if (el) el.textContent = `(${count})`;
        }

        // Update individual aid type counts
        for (const [slug, count] of Object.entries(counts.byAidType)) {
            const el = document.getElementById(`aid-type-${slug}-count`);
            if (el) el.textContent = `(${count})`;
        }

        // Update individual priority counts
        for (const [prio, count] of Object.entries(counts.byPriority)) {
            const prioId = prio === 'None' ? 'none' : prio;
            const el = document.getElementById(`priority-${prioId}-count`);
            if (el) el.textContent = `(${count})`;
        }

        // Update list card summary
        const listSummary = document.getElementById('list-filter-summary');
        if(listSummary) listSummary.textContent = counts.summary_html;

        // --- Disable/Enable filter options based on zero counts ---
        const updateOption = (id, count) => {
            const checkbox = document.getElementById(id);
            if (!checkbox) return;

            const label = checkbox.nextElementSibling;
            const isDisabled = count === 0;

            checkbox.disabled = isDisabled;
            if (isDisabled) {
                checkbox.checked = false; // Also uncheck if count is zero
                label.classList.add('text-muted');
            } else {
                label.classList.remove('text-muted');
            }
        };

        // Update statuses
        for (const [status, count] of Object.entries(counts.byStatus)) {
            updateOption(`status-filter-${status}`, count);
        }

        // Update aid types
        for (const [slug, count] of Object.entries(counts.byAidType)) {
            updateOption(`aid-type-filter-${slug}`, count);
        }

        // Update priorities
        for (const [prio, count] of Object.entries(counts.byPriority)) {
            const prioId = prio === 'None' ? 'none' : prio;
            updateOption(`priority-filter-${prioId}`, count);
        }

        // Handle Status Group Checkboxes
        if (counts.status_group_counts) {
            const updateGroupOption = (groupName, count) => {
                const checkbox = document.getElementById(`status-group-${groupName}`);
                const label = document.querySelector(`label[for="status-group-${groupName}"]`);
                if (checkbox && label) {
                    label.textContent = `${groupName.charAt(0).toUpperCase() + groupName.slice(1)} (${count})`;
                    const isDisabled = count === 0;
                    checkbox.disabled = isDisabled;
                    label.classList.toggle('text-muted', isDisabled);
                    if (isDisabled) {
                        checkbox.checked = false;
                    }
                }
            };
            updateGroupOption('active', counts.status_group_counts.active || 0);
            updateGroupOption('inactive', counts.status_group_counts.inactive || 0);
        }
    }

    function getFilterStateFromDOM() {
    const filterCard = document.getElementById('aid-request-filter-card');
    if (!filterCard) return {};

    const getCheckedValues = (selector) =>
        Array.from(filterCard.querySelectorAll(selector))
             .filter(cb => cb.checked)
             .map(cb => cb.dataset.filterValue);

    const isAllChecked = (selector) => {
        const allCheckbox = filterCard.querySelector(selector);
        return allCheckbox && allCheckbox.checked;
    };

    const aidTypes = isAllChecked('#aid-type-filter-all') ? 'all' : getCheckedValues('[data-filter-type="aid_type"]:not([id$="-all"])');
    const priorities = isAllChecked('#priority-filter-all') ? 'all' : getCheckedValues('[data-filter-type="priority"]:not([id$="-all"])');
    const statuses = getCheckedValues('[data-filter-type="status"]');

    return {
        statuses: statuses.length > 0 ? statuses : [], // Use empty array for "match none"
        priorities: priorities, // This can be 'all' or an array
        aid_types: aidTypes, // This can be 'all' or an array
    };
}


function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
});
