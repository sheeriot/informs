/**
 * Aid Request Table - Client-side filtering and sorting
 *
 * This script handles the dynamic filtering and sorting of aid request data
 * without requiring page reloads. It replaces the Django server-side filtering
 * with more responsive client-side processing.
 */

// Global configuration with debug option
const aidRequestTableConfig = {
    debug: false  // Set to false to disable debug logging in production
};

class AidRequestTable {
    constructor(options) {
        if (aidRequestTableConfig.debug) console.log('[DEBUG] Initializing table with',
            options.requestsData.length, 'requests,',
            options.aidTypesData.length, 'aid types');

        this.tableId = options.tableId || 'aidrequest-table';
        this.tableBodyId = options.tableBodyId || 'aidrequest-table-body';
        this.requestsData = options.requestsData || [];
        this.aidTypesData = options.aidTypesData || [];
        this.statusChoices = options.statusChoices || [];
        this.priorityChoices = options.priorityChoices || [];
        this.fieldOp = options.fieldOp || {};

        // Filter states
        this.filters = {
            aidType: '',
            status: '',
            priority: '',
            searchText: '',
        };

        // Sorting state
        this.sort = {
            column: 'updated_at',
            direction: 'desc'
        };

        // Selected requests for TAK alerts
        this.selectedRequests = [];

        this.initialize();
    }

    /**
     * Initialize the table and event listeners
     */
    initialize() {
        try {
            // Create filter controls
            this.createFilterControls();

            // Create the table headers with sorting functionality
            this.createTableHeaders();

            // Render the table
            this.renderTable();

            // Add event listeners for search input
            const searchInput = document.getElementById('aid-request-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.filters.searchText = e.target.value.toLowerCase();
                    this.renderTable();
                });
            } else if (aidRequestTableConfig.debug) {
                console.log('[DEBUG] Search input element not found');
            }

            // Initialize TAK alert functionality
            this.initializeTakControls();

            if (aidRequestTableConfig.debug) console.log('[DEBUG] Aid request table initialized successfully');
        } catch (error) {
            console.error("Error initializing aid request table:", error);
            // Display error message in the table
            const tableBody = document.getElementById(this.tableBodyId);
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="13" class="text-center text-danger">
                            <div class="alert alert-danger">
                                There was an error initializing the table. Please check the console for details.
                            </div>
                        </td>
                    </tr>
                `;
            }
        }
    }

    /**
     * Create filter controls for the table
     */
    createFilterControls() {
        const filterContainer = document.getElementById('filter-controls');
        if (!filterContainer) {
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Filter container element not found');
            return;
        }

        if (aidRequestTableConfig.debug) console.log('[DEBUG] Clearing existing filter controls');
        // Clear existing controls
        filterContainer.innerHTML = '';

        // Create search input
        const searchDiv = document.createElement('div');
        searchDiv.className = 'mb-2 me-2';
        searchDiv.innerHTML = `
            <label for="aid-request-search" class="form-label">Search</label>
            <input type="text" class="form-control form-control-sm" id="aid-request-search" placeholder="Search...">
        `;
        filterContainer.appendChild(searchDiv);

        // Create aid type filter
        const aidTypeDiv = document.createElement('div');
        aidTypeDiv.className = 'mb-2 me-2';

        let aidTypeOptions = '<option value="">All Aid Types</option>';

        if (aidRequestTableConfig.debug) console.log('[DEBUG] Processing aid types data', this.aidTypesData);
        // Handle different data formats for aid types
        if (Array.isArray(this.aidTypesData)) {
            // If it's an array, iterate through it
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Aid types data is an array with length', this.aidTypesData.length);
            this.aidTypesData.forEach(type => {
                aidTypeOptions += `<option value="${type.id}">${type.name}</option>`;
            });
        } else if (typeof this.aidTypesData === 'object' && this.aidTypesData !== null) {
            // If it's an object (e.g., from server), convert to array and iterate
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Aid types data is an object, converting to array');
            const aidTypesArray = Object.values(this.aidTypesData);
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Converted aid types array length', aidTypesArray.length);
            aidTypesArray.forEach(type => {
                // Handle possible different structures
                const id = type.id || Object.keys(type)[0] || '';
                const name = type.name || type.slug || Object.values(type)[0] || '';
                aidTypeOptions += `<option value="${id}">${name}</option>`;
            });
        } else {
            console.error("Invalid aid types data format:", this.aidTypesData);
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Invalid aid types data format', typeof this.aidTypesData);
        }

        aidTypeDiv.innerHTML = `
            <label for="aid-type-filter" class="form-label">Aid Type</label>
            <select class="form-select form-select-sm" id="aid-type-filter">
                ${aidTypeOptions}
            </select>
        `;
        filterContainer.appendChild(aidTypeDiv);

        // Create status filter
        const statusDiv = document.createElement('div');
        statusDiv.className = 'mb-2 me-2';

        let statusOptions = '<option value="">All Statuses</option>';

        if (aidRequestTableConfig.debug) console.log('[DEBUG] Processing status choices data', this.statusChoices);
        // Handle different formats for status choices
        if (Array.isArray(this.statusChoices)) {
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Status choices is an array with length', this.statusChoices.length);
            this.statusChoices.forEach(status => {
                statusOptions += `<option value="${status[0]}">${status[1]}</option>`;
            });
        } else if (typeof this.statusChoices === 'object' && this.statusChoices !== null) {
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Status choices is an object, converting to array');
            Object.entries(this.statusChoices).forEach(([key, value]) => {
                statusOptions += `<option value="${key}">${value}</option>`;
            });
        } else {
            console.error("Invalid status choices format:", this.statusChoices);
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Invalid status choices format', typeof this.statusChoices);
        }

        statusDiv.innerHTML = `
            <label for="status-filter" class="form-label">Status</label>
            <select class="form-select form-select-sm" id="status-filter">
                ${statusOptions}
            </select>
        `;
        filterContainer.appendChild(statusDiv);

        // Create priority filter
        const priorityDiv = document.createElement('div');
        priorityDiv.className = 'mb-2 me-2';

        let priorityOptions = '<option value="">All Priorities</option>';

        if (aidRequestTableConfig.debug) console.log('[DEBUG] Processing priority choices data', this.priorityChoices);
        // Handle different formats for priority choices
        if (Array.isArray(this.priorityChoices)) {
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Priority choices is an array with length', this.priorityChoices.length);
            this.priorityChoices.forEach(priority => {
                priorityOptions += `<option value="${priority[0]}">${priority[1]}</option>`;
            });
        } else if (typeof this.priorityChoices === 'object' && this.priorityChoices !== null) {
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Priority choices is an object, converting to array');
            Object.entries(this.priorityChoices).forEach(([key, value]) => {
                priorityOptions += `<option value="${key}">${value}</option>`;
            });
        } else {
            console.error("Invalid priority choices format:", this.priorityChoices);
            if (aidRequestTableConfig.debug) console.log('[DEBUG] Invalid priority choices format', typeof this.priorityChoices);
        }

        priorityDiv.innerHTML = `
            <label for="priority-filter" class="form-label">Priority</label>
            <select class="form-select form-select-sm" id="priority-filter">
                ${priorityOptions}
            </select>
        `;
        filterContainer.appendChild(priorityDiv);

        if (aidRequestTableConfig.debug) console.log('[DEBUG] Setting up filter event listeners');
        // Add event listeners
        document.getElementById('aid-type-filter').addEventListener('change', (e) => {
            this.filters.aidType = e.target.value;
            this.renderTable();
        });

        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.renderTable();
        });

        document.getElementById('priority-filter').addEventListener('change', (e) => {
            this.filters.priority = e.target.value;
            this.renderTable();
        });
    }

    /**
     * Create table headers with sorting functionality
     */
    createTableHeaders() {
        const tableHead = document.querySelector(`#${this.tableId} thead tr`);
        if (!tableHead) return;

        // Clear existing headers
        tableHead.innerHTML = '';

        // Define columns with sorting configuration
        const columns = [
            { id: 'id', label: 'ID', sortable: true },
            { id: 'select', label: '<input type="checkbox" id="select-all">', sortable: false },
            { id: 'aid_type_name', label: 'Type', sortable: true },
            { id: 'priority', label: 'Priority', sortable: true },
            { id: 'status', label: 'Status', sortable: true },
            { id: 'requester_name', label: 'Requester', sortable: true },
            { id: 'address', label: 'Address', sortable: true },
            { id: 'location_status', label: 'Location', sortable: false },
            { id: 'coordinates', label: 'Coords', sortable: false },
            { id: 'distance', label: 'Distance', sortable: true },
            { id: 'updated_at', label: 'Updated', sortable: true },
            { id: 'created_at', label: 'Created', sortable: true },
            { id: 'actions', label: 'Actions', sortable: false }
        ];

        // Create header cells
        columns.forEach(column => {
            const th = document.createElement('th');

            if (column.sortable) {
                const isActive = this.sort.column === column.id;
                const direction = isActive ? this.sort.direction : '';
                const directionIcon = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '';

                th.innerHTML = `
                    <div class="d-flex align-items-center">
                        <span>${column.label}</span>
                        <button class="btn btn-sm ms-1 ${isActive ? 'text-primary' : 'text-secondary'}"
                                data-sort="${column.id}">
                            ${directionIcon}
                        </button>
                    </div>
                `;
            } else {
                th.innerHTML = column.label;
            }

            tableHead.appendChild(th);
        });

        // Add event listeners for sorting
        document.querySelectorAll(`#${this.tableId} thead button[data-sort]`).forEach(button => {
            button.addEventListener('click', (e) => {
                const column = e.target.getAttribute('data-sort');

                // Toggle sorting direction
                if (this.sort.column === column) {
                    this.sort.direction = this.sort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sort.column = column;
                    this.sort.direction = 'asc';
                }

                this.renderTable();
            });
        });

        // Add event listener for select all checkbox
        document.getElementById('select-all').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            this.selectedRequests = isChecked ?
                this.getFilteredData().map(request => request.id.toString()) : [];

            // Update all checkboxes
            document.querySelectorAll(`#${this.tableBodyId} input[type="checkbox"]`).forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        });
    }

    /**
     * Filter the data based on current filter settings
     */
    getFilteredData() {
        return this.requestsData.filter(request => {
            // Aid type filter
            if (this.filters.aidType && request.aid_type_id &&
                request.aid_type_id.toString() !== this.filters.aidType.toString()) {
                return false;
            }

            // Status filter
            if (this.filters.status && request.status &&
                request.status.toString() !== this.filters.status.toString()) {
                return false;
            }

            // Priority filter
            if (this.filters.priority && request.priority !== null && request.priority !== undefined) {
                // Only compare if both values exist
                if (request.priority.toString() !== this.filters.priority.toString()) {
                    return false;
                }
            } else if (this.filters.priority) {
                // If filter is set but request has no priority, exclude it
                return false;
            }

            // Search text
            if (this.filters.searchText) {
                const searchText = this.filters.searchText.toLowerCase();
                return (
                    (request.requester_name && request.requester_name.toLowerCase().includes(searchText)) ||
                    (request.address && request.address.toLowerCase().includes(searchText)) ||
                    (request.status_display && request.status_display.toLowerCase().includes(searchText)) ||
                    (request.priority_display && request.priority_display.toLowerCase().includes(searchText)) ||
                    (request.aid_type_name && request.aid_type_name.toLowerCase().includes(searchText))
                );
            }

            return true;
        });
    }

    /**
     * Sort the filtered data based on current sort settings
     */
    getSortedData() {
        const filteredData = this.getFilteredData();

        return filteredData.sort((a, b) => {
            let aValue = a[this.sort.column];
            let bValue = b[this.sort.column];

            // Handle null values
            if (aValue === null) return 1;
            if (bValue === null) return -1;

            // Convert to comparable values
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            // Compare
            if (aValue < bValue) {
                return this.sort.direction === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return this.sort.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }

    /**
     * Render the table with filtered and sorted data
     */
    renderTable() {
        const tableBody = document.getElementById(this.tableBodyId);
        if (!tableBody) return;

        // Get sorted and filtered data
        const data = this.getSortedData();

        // Clear table body
        tableBody.innerHTML = '';

        // Show message if no data
        if (data.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="13" class="text-center">No aid requests found matching the criteria</td>`;
            tableBody.appendChild(tr);
            return;
        }

        // Format date for display
        const formatDate = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            return date.toLocaleString();
        };

        // Calculate time ago for display
        const getTimeAgo = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHour / 24);

            if (diffDay > 0) return `${diffDay}d ago`;
            if (diffHour > 0) return `${diffHour}h ago`;
            if (diffMin > 0) return `${diffMin}m ago`;
            return `${diffSec}s ago`;
        };

        // Get age-based color
        const getAgeColor = (dateString) => {
            if (!dateString) return 'secondary';
            const date = new Date(dateString);
            const now = new Date();
            const diffHours = (now - date) / (1000 * 60 * 60);

            if (diffHours < 6) return 'success';
            if (diffHours < 24) return 'info';
            if (diffHours < 72) return 'warning';
            return 'danger';
        };

        // Add rows
        data.forEach(request => {
            const tr = document.createElement('tr');

            // Format coordinates
            const coords = request.latitude && request.longitude ?
                `${request.latitude.toFixed(5)}, ${request.longitude.toFixed(5)}` : '';

            // Format distance
            const distance = request.distance ?
                `${request.distance.toFixed(2)} km` : '';

            // Check if request is selected
            const isSelected = this.selectedRequests.includes(request.id.toString());

            tr.innerHTML = `
                <td>
                    <a href="aid_request_detail/${request.id}/" class="btn btn-outline-info btn-sm text-dark me-2">
                        ${request.id}
                        <i class="bi bi-life-preserver text-danger"></i>
                    </a>
                </td>
                <td>
                    <input type="checkbox" class="request-checkbox" value="${request.id}" ${isSelected ? 'checked' : ''}>
                </td>
                <td>${request.aid_type_name}</td>
                <td><span class="badge bg-${getPriorityColor(request.priority)}">${request.priority_display}</span></td>
                <td><span class="badge bg-${getStatusColor(request.status)}">${request.status_display}</span></td>
                <td>${request.requester_name}</td>
                <td>
                    ${request.address}
                    <hr class="m-0">
                    ${request.address_found || ''}
                </td>
                <td>${request.location_status || ''}</td>
                <td><div class="small">${coords}</div></td>
                <td>${distance}</td>
                <td class="small">
                    <span>${formatDate(request.updated_at)}</span>
                    <hr class="m-0">
                    <span class="text-${getAgeColor(request.updated_at)}">
                        ${getTimeAgo(request.updated_at)}
                    </span>
                </td>
                <td class="small">
                    <span>${formatDate(request.created_at)}</span>
                    <hr class="m-0">
                    <span class="text-${getAgeColor(request.created_at)}">
                        ${getTimeAgo(request.created_at)}
                    </span>
                </td>
                <td>
                    <a href="aid_request_update/${request.id}/" class="btn btn-outline-warning btn-sm me-2">
                        <i class="bi bi-pencil"></i>
                    </a>
                </td>
            `;

            tableBody.appendChild(tr);
        });

        // Add event listeners for checkboxes
        document.querySelectorAll(`#${this.tableBodyId} input.request-checkbox`).forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const requestId = e.target.value;

                if (e.target.checked) {
                    // Add to selected requests if not already there
                    if (!this.selectedRequests.includes(requestId)) {
                        this.selectedRequests.push(requestId);
                    }
                } else {
                    // Remove from selected requests
                    const index = this.selectedRequests.indexOf(requestId);
                    if (index > -1) {
                        this.selectedRequests.splice(index, 1);
                    }
                }

                // Update "Select All" checkbox state
                const allChecked = document.querySelectorAll(`#${this.tableBodyId} input.request-checkbox`).length ===
                    document.querySelectorAll(`#${this.tableBodyId} input.request-checkbox:checked`).length;
                document.getElementById('select-all').checked = allChecked;
            });
        });

        // Update counter
        const counter = document.getElementById('results-counter');
        if (counter) {
            counter.textContent = `${data.length} results`;
        }
    }

    /**
     * Initialize TAK alert functionality
     */
    initializeTakControls() {
        try {
            // Alert button
            const alertButton = document.getElementById('tak-alert-button');
            if (alertButton) {
                alertButton.addEventListener('click', () => {
                    this.sendTakAlert('add');
                });
            }

            // Clear button
            const clearButton = document.getElementById('tak-clear-button');
            if (clearButton) {
                clearButton.addEventListener('click', () => {
                    this.sendTakAlert('remove');
                });
            }

            // Test button
            const testButton = document.getElementById('tak-test-button');
            if (testButton) {
                testButton.addEventListener('click', () => {
                    this.sendTakAlert('test');
                });
            }
        } catch (error) {
            console.error("Error initializing TAK controls:", error);
        }
    }

    /**
     * Send TAK alert for selected requests
     */
    sendTakAlert(messageType) {
        const statusEl = document.getElementById('send-cot-status');
        statusEl.textContent = 'Sending COT...';

        // Get CSRF token
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

        fetch('/aidrequests/sendcot-aidrequest/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({
                message_type: messageType,
                aidrequests: this.selectedRequests
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'error') {
                statusEl.textContent = `Error: ${data.message}`;
                return;
            }

            this.pollSendCotStatus(data.sendcot_id);
        })
        .catch(error => {
            console.error('Error sending TAK alert:', error);
            statusEl.textContent = 'Error sending TAK alert';
        });
    }

    /**
     * Poll for TAK alert status
     */
    pollSendCotStatus(sendcotId) {
        const statusEl = document.getElementById('send-cot-status');

        const interval = setInterval(() => {
            fetch(`/aidrequests/sendcot-checkstatus/?sendcot_id=${sendcotId}`)
                .then(response => response.json())
                .then(response => {
                    if (response.status === 'done') {
                        statusEl.textContent = response.result;
                        clearInterval(interval);
                    } else {
                        statusEl.textContent = 'Sending COT...';
                    }
                })
                .catch(error => {
                    console.error('Error checking TAK status:', error);
                    statusEl.textContent = 'Error checking TAK status';
                    clearInterval(interval);
                });
        }, 2000);
    }
}

/**
 * Helper function to get priority color
 */
function getPriorityColor(priority) {
    switch (priority) {
        case 'URGENT': return 'danger';
        case 'HIGH': return 'warning';
        case 'MEDIUM': return 'primary';
        case 'LOW': return 'success';
        default: return 'secondary';
    }
}

/**
 * Helper function to get status color
 */
function getStatusColor(status) {
    switch (status) {
        case 'NEW': return 'info';
        case 'ASSIGNED': return 'primary';
        case 'INPROGRESS': return 'warning';
        case 'COMPLETED': return 'success';
        case 'CANCELLED': return 'danger';
        default: return 'secondary';
    }
}

/**
 * Initialize the aid request table when the DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    if (aidRequestTableConfig.debug) console.log('[DEBUG] Initializing aid request table');

    // Check if required elements exist
    const aidRequestsDataEl = document.getElementById('aid-requests-data');
    const aidTypesDataEl = document.getElementById('aid-types-json');
    const statusChoicesDataEl = document.getElementById('status-choices-data');
    const priorityChoicesDataEl = document.getElementById('priority-choices-data');
    const fieldOpNameEl = document.getElementById('field-op-name');
    const fieldOpSlugEl = document.getElementById('field-op-slug');

    // Check for missing elements
    const missingElements = [];
    if (!aidRequestsDataEl) missingElements.push('aid-requests-data');
    if (!aidTypesDataEl) missingElements.push('aid-types-json');
    if (!statusChoicesDataEl) missingElements.push('status-choices-data');
    if (!priorityChoicesDataEl) missingElements.push('priority-choices-data');
    if (!fieldOpNameEl || !fieldOpSlugEl) missingElements.push('field-op elements');

    if (missingElements.length > 0) {
        console.error("Missing required elements:", missingElements.join(', '));
        return;
    }

    try {
        // Parse aid requests data
        let requestsData;
        try {
            // Handle double-stringified JSON
            const rawContent = aidRequestsDataEl.textContent;
            requestsData = JSON.parse(rawContent);

            // If the result is a string, parse it again
            if (typeof requestsData === 'string') {
                requestsData = JSON.parse(requestsData);
            }

            // Ensure requestsData is an array
            if (!Array.isArray(requestsData)) {
                console.error("Aid requests data is not an array");
                requestsData = [];
            } else if (aidRequestTableConfig.debug) {
                console.log(`[DEBUG] Parsed ${requestsData.length} aid requests`);
            }
        } catch (error) {
            console.error("Error parsing aid requests data:", error);
            requestsData = [];
        }

        // Parse aid types data
        let aidTypesData;
        try {
            const rawContent = aidTypesDataEl.textContent;
            let parsed = JSON.parse(rawContent);

            // If the result is a string, parse it again
            if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
            }

            if (Array.isArray(parsed)) {
                aidTypesData = parsed;
                if (aidRequestTableConfig.debug) console.log(`[DEBUG] Parsed ${aidTypesData.length} aid types`);
            } else if (typeof parsed === 'object' && parsed !== null) {
                aidTypesData = parsed;
            } else {
                aidTypesData = [];
            }
        } catch (error) {
            console.error("Error parsing aid types data:", error);
            aidTypesData = [];
        }

        // Parse status choices
        let statusChoices;
        try {
            const rawContent = statusChoicesDataEl.textContent;
            let parsed = JSON.parse(rawContent);

            // If the result is a string, parse it again
            if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
            }

            statusChoices = parsed;
            if (aidRequestTableConfig.debug && Array.isArray(statusChoices)) {
                console.log(`[DEBUG] Parsed ${statusChoices.length} status choices`);
            }
        } catch (error) {
            console.error("Error parsing status choices:", error);
            statusChoices = [];
        }

        // Parse priority choices
        let priorityChoices;
        try {
            const rawContent = priorityChoicesDataEl.textContent;
            let parsed = JSON.parse(rawContent);

            // If the result is a string, parse it again
            if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
            }

            priorityChoices = parsed;
            if (aidRequestTableConfig.debug && Array.isArray(priorityChoices)) {
                console.log(`[DEBUG] Parsed ${priorityChoices.length} priority choices`);
            }
        } catch (error) {
            console.error("Error parsing priority choices:", error);
            priorityChoices = [];
        }

        const fieldOp = {
            name: fieldOpNameEl.textContent,
            slug: fieldOpSlugEl.textContent
        };

        // Initialize the table
        const aidRequestTable = new AidRequestTable({
            tableId: 'aidrequest-table',
            tableBodyId: 'aidrequest-table-body',
            requestsData: requestsData,
            aidTypesData: aidTypesData,
            statusChoices: statusChoices,
            priorityChoices: priorityChoices,
            fieldOp: fieldOp
        });
    } catch (e) {
        console.error("Error initializing aid request table:", e);
    }
});
