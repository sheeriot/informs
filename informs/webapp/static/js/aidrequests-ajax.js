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

            updateAidRequest(requestId, { priority: newPriority }, button);
        });
    });

    // Function to update aid request via AJAX
    function updateAidRequest(requestId, data, buttonElement) {
        const fieldOpSlug = document.getElementById('field-op-slug').textContent;
        const url = `/api/${fieldOpSlug}/request/${requestId}/update/`;

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
                // Update button appearance based on new state
                if (data.status) {
                    updateStatusButton(buttonElement, data.status, data.status_display);
                }
                if (data.priority) {
                    updatePriorityButton(buttonElement, data.priority, data.priority_display);
                }

                // Trigger filter update to refresh counts
                triggerFilterChange();
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

        // Update text
        button.textContent = displayText;

        // Update data attribute
        button.dataset.currentPriority = priority;
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
