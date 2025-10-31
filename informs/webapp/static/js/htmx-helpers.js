// htmx-helpers.js

function getLatestTimestamp(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) {
        console.error(`Table body with ID #${tableBodyId} not found.`);
        return null;
    }

    const firstRow = tableBody.querySelector('tr:first-child');
    if (!firstRow) {
        // No rows yet, so no timestamp. The backend should fetch all.
        return null;
    }

    const timestamp = firstRow.dataset.timestamp;
    console.log(`Found latest timestamp for #${tableBodyId}: ${timestamp}`);
    return timestamp;
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function getLatestLogId() {
    const logTableBody = document.querySelector('#action-logs-tbody');
    if (logTableBody) {
        const firstRow = logTableBody.querySelector('tr[data-log-id]');
        if (firstRow) {
            return firstRow.dataset.logId;
        }
    }
    return '0';
}
