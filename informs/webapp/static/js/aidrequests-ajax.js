/**
 * aidrequests-ajax.js
 *
 * Handles AJAX updates for aid request status and priority changes
 */

document.addEventListener('DOMContentLoaded', function() {
    // Get CSRF token
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;

    // Handle status changes
    document.querySelectorAll('.status-option').forEach(option => {
        option.addEventListener('click', function(e) {
            e.preventDefault();
            const requestId = this.dataset.requestId;
            const newStatus = this.dataset.status;
            const button = document.querySelector(`.status-button[data-request-id="${requestId}"]`);

            // Close the dropdown
            const dropdown = this.closest('.dropdown-menu');
            if (dropdown) {
                const dropdownInstance = bootstrap.Dropdown.getInstance(button);
                if (dropdownInstance) {
                    dropdownInstance.hide();
                }
            }

            updateAidRequest(requestId, { status: newStatus }, button);
        });
    });

    // Handle priority changes
    document.querySelectorAll('.priority-option').forEach(option => {
        option.addEventListener('click', function(e) {
            e.preventDefault();
            const requestId = this.dataset.requestId;
            const newPriority = this.dataset.priority;
            const button = document.querySelector(`.priority-button[data-request-id="${requestId}"]`);

            // Close the dropdown
            const dropdown = this.closest('.dropdown-menu');
            if (dropdown) {
                const dropdownInstance = bootstrap.Dropdown.getInstance(button);
                if (dropdownInstance) {
                    dropdownInstance.hide();
                }
            }

            updateAidRequest(requestId, { priority: newPriority }, button);
        });
    });

    // Function to get field operation slug from URL or element
    function getFieldOpSlug() {
        // First try to get from element
        const fieldOpElement = document.getElementById('field-op-slug');
        if (fieldOpElement && fieldOpElement.textContent) {
            return fieldOpElement.textContent;
        }

        // If element not found, try to get from URL path
        const pathParts = window.location.pathname.split('/');
        const fieldOpIndex = pathParts.findIndex(part => part === 'field-ops') + 1;
        if (fieldOpIndex > 0 && fieldOpIndex < pathParts.length) {
            return pathParts[fieldOpIndex];
        }

        console.error('Could not determine field operation slug');
        return null;
    }

    // Function to update aid request via AJAX
    function updateAidRequest(requestId, data, buttonElement) {
        const fieldOpSlug = document.body.dataset.fieldOpSlug;
        if (!fieldOpSlug) {
            throw new Error('Field operation slug not found in body data attribute');
        }

        const url = `/api/${fieldOpSlug}/request/${requestId}/update/`;

        // Store the type of update we're doing
        const isStatusUpdate = 'status' in data;
        const isPriorityUpdate = 'priority' in data;

        // Show loading state
        const originalContent = buttonElement.innerHTML;
        buttonElement.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        buttonElement.disabled = true;

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Only update the button that matches our update type
                if (isStatusUpdate && buttonElement.classList.contains('status-button')) {
                    updateStatusButton(buttonElement, data.status, data.status_display);
                } else if (isPriorityUpdate && buttonElement.classList.contains('priority-button')) {
                    updatePriorityButton(buttonElement, data.priority, data.priority_display);
                } else {
                    console.error('Button type mismatch:', {
                        isStatusUpdate,
                        isPriorityUpdate,
                        buttonClasses: buttonElement.classList
                    });
                    buttonElement.innerHTML = originalContent;
                }

                // Update the store with new data
                if (window.aidRequestsStore?.initialized) {
                    window.aidRequestsStore.updateAidRequest(requestId, data);
                } else {
                    console.warn('Store not initialized, skipping store update');
                }
            } else {
                console.error('Update failed:', data.error);
                // Restore original content
                buttonElement.innerHTML = originalContent;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            // Restore original content
            buttonElement.innerHTML = originalContent;
        })
        .finally(() => {
            buttonElement.disabled = false;
        });
    }

    // Update status button appearance
    function updateStatusButton(button, status, displayText) {
        // Remove existing button classes
        button.classList.remove('btn-outline-warning', 'btn-outline-success', 'btn-outline-primary', 'btn-outline-danger', 'btn-outline-secondary');

        // Add appropriate class based on new status
        switch(status) {
            case 'new':
            case 'assigned':
                button.classList.add('btn-outline-warning');
                break;
            case 'resolved':
                button.classList.add('btn-outline-success');
                break;
            case 'closed':
                button.classList.add('btn-outline-primary');
                break;
            case 'rejected':
                button.classList.add('btn-outline-danger');
                break;
            default:
                button.classList.add('btn-outline-secondary');
        }

        // Update icon and text
        const iconClass = getStatusIcon(status);
        button.innerHTML = `<i class="bi ${iconClass}"></i> <span class="text-dark">${displayText}</span>`;

        // Update data attribute
        button.dataset.currentStatus = status;

        // Update row visibility based on status group
        const row = button.closest('.aid-request-row');
        if (row) {
            const isInactive = window.aidRequestsStore?.statusGroups.inactive.includes(status);
            row.classList.toggle('d-none', isInactive);
            row.dataset.status = status;
        }
    }

    // Update priority button appearance
    function updatePriorityButton(button, priority, displayText) {
        // Remove existing button classes
        button.classList.remove('btn-danger', 'btn-warning', 'btn-primary', 'btn-secondary');

        // Add appropriate class based on new priority
        switch(priority) {
            case 'high':
                button.classList.add('btn-danger');
                break;
            case 'medium':
                button.classList.add('btn-warning');
                break;
            case 'low':
                button.classList.add('btn-primary');
                break;
            default:
                button.classList.add('btn-secondary');
        }

        // Update text and keep button structure consistent
        button.innerHTML = displayText;

        // Update data attribute
        button.dataset.currentPriority = priority;

        // Update row data attribute
        const row = button.closest('.aid-request-row');
        if (row) {
            row.dataset.priority = priority || 'none';
        }
    }

    // Get status icon class
    function getStatusIcon(status) {
        switch(status) {
            case 'new':
                return 'bi-download';
            case 'assigned':
                return 'bi-clock';
            case 'resolved':
                return 'bi-hand-thumbs-up';
            case 'closed':
                return 'bi-door-closed';
            case 'rejected':
                return 'bi-hand-thumbs-down';
            default:
                return 'bi-question-lg';
        }
    }
});
