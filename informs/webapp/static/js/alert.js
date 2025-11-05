/**
 * Displays a dismissible alert at the top of the page.
 * @param {string} message - The message to display in the alert.
 * @param {string} type - The Bootstrap alert type (e.g., 'success', 'danger', 'warning').
 */
function showActionAlert(message, type = 'success') {
    const container = document.getElementById('action-alert-container');
    if (!container) {
        console.error('Alert container not found.');
        return;
    }

    const alertId = `alert-${Date.now()}`;
    const alertHTML = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    container.innerHTML = alertHTML;

    // Optional: Automatically dismiss the alert after a few seconds
    setTimeout(() => {
        const alertElement = document.getElementById(alertId);
        if (alertElement) {
            const bsAlert = new bootstrap.Alert(alertElement);
            bsAlert.close();
        }
    }, 5000); // 5 seconds
}
