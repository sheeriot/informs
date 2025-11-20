/**
 * list-aid-requests.js
 *
 * Implements filtering for the aid requests table with Bootstrap 5 integration
 * Provides dynamic filtering and searching functionality
 */
let allAidRequests = []; // This will be our single source of truth
const listScriptConfig = {
    debug: true,
    version: '0.0.14',
    fieldOpSlug: null // Will be populated on DOMContentLoaded
};

document.addEventListener('DOMContentLoaded', function() {
    if (listScriptConfig.debug) console.log(`[List Script] Initializing v${listScriptConfig.version}`);
    // Populate dynamic configs
    listScriptConfig.fieldOpSlug = document.body.dataset.fieldOpSlug;
    if (document.getElementById('script-config')?.dataset.debug === 'true') {
        listScriptConfig.debug = true;
    }
    if (!listScriptConfig.fieldOpSlug) {
        console.error("[List Script] Field Op slug not found in body dataset. Aborting.");
        return;
    }

    if (listScriptConfig.debug) {
        console.log(`[List Script] Version ${listScriptConfig.version} initialized for FieldOp: ${listScriptConfig.fieldOpSlug}`);
    }

    // --- Data Initialization ---
    try {
        const dataEl = document.getElementById('all-aid-requests-json');
        if (dataEl) {
            allAidRequests = JSON.parse(dataEl.textContent);
            if (listScriptConfig.debug) {
                console.log(`[List Script] Loaded ${allAidRequests.length} aid requests into the local store.`);
                console.table(allAidRequests);
            }
        } else {
            console.error('[List Script] Aid request data element not found. Cannot initialize.');
            return;
        }
    } catch (e) {
        console.error('[List Script] Failed to parse aid request data:', e);
        return;
    }

    // --- Initialize All Components Sequentially ---
    // We use a setTimeout to push this execution to the next tick of the event loop.
    // This is a standard and robust way to ensure that all other browser and third-party
    // SDKs (like Azure Maps) have completed their own synchronous and asynchronous
    // initialization routines before we try to use them.
    setTimeout(() => {
        if (listScriptConfig.debug) console.log('[List Script] Kicking off component initialization...');
        if (window.initializeAidRequestMap) {
            window.initializeAidRequestMap(allAidRequests);
        } else if (listScriptConfig.debug) {
            console.error('[List Script] Map initializer function not found.');
        }
    }, 0);

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

                        // --- UPDATE THE IN-MEMORY DATA STORE ---
                        // Find the request in our local array and update its property
                        // before HTMX triggers a swap and re-filter.
                        const requestToUpdate = allAidRequests.find(req => req.id == aidRequestId);
                        if (requestToUpdate) {
                            if (payload.status) {
                                if (listScriptConfig.debug) console.log(`[List Script] Updating in-memory store for request #${aidRequestId}. Changing 'status' to '${payload.status}'.`);
                                requestToUpdate.status = payload.status;
                            }
                            if (payload.priority) {
                                const newPriority = payload.priority === 'none' ? null : payload.priority;
                                if (listScriptConfig.debug) console.log(`[List Script] Updating in-memory store for request #${aidRequestId}. Changing 'priority' to '${newPriority}'.`);
                                requestToUpdate.priority = newPriority;
                            }
                        } else if (listScriptConfig.debug) {
                            console.warn(`[List Script] Could not find request #${aidRequestId} in local store to update.`);
                        }

                        // Trigger the row swap via HTMX. The `htmx:afterSwap` listener will handle re-filtering.
                        htmx.trigger('body', `update-row-${aidRequestId}`, {});

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
            if (listScriptConfig.debug) {
                console.log('[List Script] Row updated via HTMX. Triggering map point update and filter counts.');
            }

            // Trigger the map to update the specific point's data properties
            document.body.dispatchEvent(new CustomEvent('mapPointShouldUpdate', {
                detail: { rowElement: event.target }
            }));

            // After a row changes, refilter the list and then tell the map to refilter too.
            runFilterAndUpdates();
            const filterState = getFilterStateFromDOM();
            document.body.dispatchEvent(new CustomEvent('mapShouldUpdateFilter', { detail: filterState }));
        }
    });

    // Listen for the custom event from the filter script
    document.body.addEventListener('filterStateChange', function() {
        if (listScriptConfig.debug) {
            console.log('[List Script] Received filterStateChange event.');
        }
        runFilterAndUpdates();
    });

    initializeTooltips();

    // Signal that this script is ready and check if all others are too.
    // componentsReady.list = true; // This line is removed
    // checkAllComponentsReady(); // This line is removed

    // This is the function that is called when the list needs to be re-filtered
    // either from a direct filter change or after a row has been updated.
    function runFilterAndUpdates() {
        const filterState = getFilterStateFromDOM();

        if (listScriptConfig.debug) {
            console.log('[List Script] Running filter and updates with state:', filterState);
        }

        const visibleRequests = applyListFilter(filterState);
        updateFilterCounts(visibleRequests); // Update counts based on visible items
    }

    function applyListFilter(filterState) {
        const rows = document.querySelectorAll('#aid-request-list-body tr.aid-request-row');
        let visibleCount = 0;
        const visibleRequests = [];

        allAidRequests.forEach(request => {
            const row = document.getElementById(`aid-request-row-${request.id}`);
            if (!row) return;

            const statusMatch = filterState.statuses.length === 0 || filterState.statuses.includes(request.status);

            let priorityMatch = true;
            if (filterState.priorities !== 'all') {
                priorityMatch = filterState.priorities.includes(request.priority || 'none');
            }

            let aidTypeMatch = true;
            if (filterState.aid_types !== 'all') {
                aidTypeMatch = filterState.aid_types.includes(request.aid_type_slug);
            }

            if (statusMatch && priorityMatch && aidTypeMatch) {
                row.classList.remove('d-none');
                visibleCount++;
                visibleRequests.push(request);
            } else {
                row.classList.add('d-none');
            }
        });

        if (listScriptConfig.debug) {
            console.log(`[List Script] Applied filter. Visible rows: ${visibleCount}`);
        }

        // Update the main results counter
        const resultsCounter = document.getElementById('results-counter');
        if (resultsCounter) {
            resultsCounter.textContent = `${visibleCount} of ${allAidRequests.length} requests`;
        }

        return visibleRequests;
    }

    function updateFilterCounts(visibleRequests) {
        if (listScriptConfig.debug) console.log(`[List Script] Updating filter counts based on ${visibleRequests.length} visible requests.`);

        const counts = {
            byStatus: {},
            byPriority: {},
            byAidType: {}
        };

        // Initialize all possible filter options with a count of 0
        document.querySelectorAll('[data-filter-type="status"]').forEach(el => counts.byStatus[el.dataset.filterValue] = 0);
        document.querySelectorAll('[data-filter-type="priority"]').forEach(el => counts.byPriority[el.dataset.filterValue] = 0);
        document.querySelectorAll('[data-filter-type="aid_type"]').forEach(el => counts.byAidType[el.dataset.filterValue] = 0);

        // Calculate counts from the visible requests
        visibleRequests.forEach(request => {
            if (counts.byStatus.hasOwnProperty(request.status)) {
                counts.byStatus[request.status]++;
            }
            const priority = request.priority || 'none';
            if (counts.byPriority.hasOwnProperty(priority)) {
                counts.byPriority[priority]++;
            }
            if (counts.byAidType.hasOwnProperty(request.aid_type_slug)) {
                counts.byAidType[request.aid_type_slug]++;
            }
        });

        if (listScriptConfig.debug) console.log('[List Script] Calculated new counts:', counts);

        // --- Update UI ---
        updateCountUI('status', counts.byStatus);
        updateCountUI('priority', counts.byPriority);
        updateCountUI('aid_type', counts.byAidType);
    }

    function updateCountUI(filterType, counts) {
        for (const [value, count] of Object.entries(counts)) {
            const el = document.getElementById(`${filterType.replace('_', '-')}-${value}-count`);
            if (el) {
                el.textContent = `(${count})`;
            }

            // Disable/enable the checkbox based on the count
            const checkbox = document.getElementById(`${filterType.replace('_', '-')}-filter-${value}`);
            if (checkbox) {
                const label = checkbox.closest('.form-check').querySelector('label');
                checkbox.disabled = count === 0;
                if (label) {
                    label.classList.toggle('text-muted', count === 0);
                }
                // Do not uncheck here, as the user's selection should be preserved
                // until they change it. The filter logic will handle what's visible.
            }
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
