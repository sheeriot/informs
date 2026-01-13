/**
 * TAK Server Test COT functionality
 * Handles sending test COT messages and polling for status
 */

const takserverTestConfig = {
    debug: false,
    pollInterval: 1000,
    maxPolls: 30
};

document.addEventListener('DOMContentLoaded', function() {
    const sendButton = document.getElementById('send-test-cot');
    if (!sendButton) return;

    sendButton.addEventListener('click', handleSendTestCot);
});

async function handleSendTestCot(event) {
    const button = event.currentTarget;
    const takserverPk = button.dataset.takserverPk;
    const messageInput = document.getElementById('test-message');
    const testMessage = messageInput ? messageInput.value : '';

    if (takserverTestConfig.debug) {
        console.log('Sending test COT for TAK Server:', takserverPk);
    }

    // Disable button and show loading state
    button.disabled = true;
    const originalContent = button.innerHTML;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

    // Hide any previous status
    hideStatus();

    try {
        const response = await fetch(`/takservers/${takserverPk}/test-cot/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ message: testMessage })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showStatus('info', `<i class="bi bi-hourglass-split me-1"></i>${data.message}`);
            // Start polling for status
            pollTaskStatus(takserverPk, data.task_id, button, originalContent);
        } else {
            showStatus('danger', `<i class="bi bi-x-circle me-1"></i>${data.message}`);
            resetButton(button, originalContent);
        }
    } catch (error) {
        console.error('Error sending test COT:', error);
        showStatus('danger', `<i class="bi bi-exclamation-triangle me-1"></i>Network error: ${error.message}`);
        resetButton(button, originalContent);
    }
}

async function pollTaskStatus(takserverPk, taskId, button, originalContent) {
    let pollCount = 0;

    const poll = async () => {
        pollCount++;

        if (pollCount > takserverTestConfig.maxPolls) {
            showStatus('warning', '<i class="bi bi-clock-history me-1"></i>Task is taking longer than expected. Check logs for status.');
            resetButton(button, originalContent);
            return;
        }

        try {
            const response = await fetch(`/takservers/${takserverPk}/test-status/?task_id=${taskId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (takserverTestConfig.debug) {
                console.log('Poll response:', data);
            }

            switch (data.status) {
                case 'SUCCESS':
                    showStatus('success', `<i class="bi bi-check-circle me-1"></i>${data.message}`);
                    resetButton(button, originalContent);
                    break;
                case 'FAILURE':
                case 'ERROR':
                    showStatus('danger', `<i class="bi bi-x-circle me-1"></i>${data.message}`);
                    resetButton(button, originalContent);
                    break;
                case 'PENDING':
                default:
                    // Continue polling
                    showStatus('info', `<i class="bi bi-hourglass-split me-1"></i>${data.message}`);
                    setTimeout(poll, takserverTestConfig.pollInterval);
                    break;
            }
        } catch (error) {
            console.error('Error polling status:', error);
            showStatus('danger', `<i class="bi bi-exclamation-triangle me-1"></i>Error checking status: ${error.message}`);
            resetButton(button, originalContent);
        }
    };

    // Start polling
    setTimeout(poll, takserverTestConfig.pollInterval);
}

function showStatus(type, message) {
    const statusDiv = document.getElementById('test-status');
    const alertDiv = document.getElementById('test-status-alert');
    const messageSpan = document.getElementById('test-status-message');

    if (!statusDiv || !alertDiv || !messageSpan) return;

    // Remove all alert classes and add the new one
    alertDiv.className = `alert mb-0 py-2 alert-${type}`;
    messageSpan.innerHTML = message;
    statusDiv.classList.remove('d-none');
}

function hideStatus() {
    const statusDiv = document.getElementById('test-status');
    if (statusDiv) {
        statusDiv.classList.add('d-none');
    }
}

function resetButton(button, originalContent) {
    button.disabled = false;
    button.innerHTML = originalContent;
}
