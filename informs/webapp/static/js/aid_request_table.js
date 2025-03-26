/**
 * Aid Request Table - Client-side filtering and sorting
 *
 * This script handles the dynamic filtering and sorting of aid request data
 * without requiring page reloads. It can either read from server-rendered HTML
 * or replace with client-side processing for enhanced interactivity.
 */

// Simple event bus to handle app-wide events
class EventBus {
    constructor() {
        this.events = {};
    }

    // Subscribe to an event
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        return () => this.off(event, callback);
    }

    // Unsubscribe from an event
    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
    }

    // Emit an event with data
    emit(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
    }
}

// Create global event bus
window.aidRequestEventBus = new EventBus();

// Global configuration with debug option
const aidRequestTableConfig = {
    debug: true,  // Enable debug logging temporarily to diagnose issues
    preferHtmlData: true  // When true, will use HTML data if available
};

class AidRequestTable {
    constructor(options) {
        if (aidRequestTableConfig.debug) console.log('[DEBUG] Initializing table with options:', options);

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

        // If true, data was loaded from HTML
        this.dataFromHtml = false;

        this.initialize();
    }

    /**
     * Initialize the table and event listeners
     */
    initialize() {
        try {
            // First, try to read data from the HTML table if configured to do so
            if (aidRequestTableConfig.preferHtmlData) {
                this.dataFromHtml = this.tryLoadDataFromHtml();
            }

            if (aidRequestTableConfig.debug) {
                console.log('[DEBUG] Data loaded from HTML:', this.dataFromHtml);
                console.log('[DEBUG] Initial filter state:', this.filters);
            }

            // Set up filter event listeners - these work regardless of data source
            this.setupFilterListeners();

            // Subscribe to events from our event bus
            this.setupEventBusListeners();

            // Set up sorting on table headers
            this.setupSortingListeners();

            // If we're not using HTML data, create headers and render table from JSON
            if (!this.dataFromHtml) {
                if (aidRequestTableConfig.debug) console.log('[DEBUG] Using JSON data to render table');
                this.renderTable();
            } else {
                // Even with HTML data, we need to apply initial filters
                this.applyFiltersToExistingRows();
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
     * Try to load data from the existing HTML table
     * @returns {boolean} True if data was successfully loaded from HTML
     */
    tryLoadDataFromHtml() {
        const tableBody = document.getElementById(this.tableBodyId);
        if (!tableBody) return false;

        const rows = tableBody.querySelectorAll('tr');
        if (!rows || rows.length === 0) return false;

        if (aidRequestTableConfig.debug) {
            console.log('[DEBUG] Found', rows.length, 'rows in HTML table');
        }

        // We have rows, extract data from them
        this.requestsData = [];

        rows.forEach(row => {
            // Skip rows without data attributes or error messages
            if (!row.dataset.aidType) return;

            // Extract data from row
            const cells = row.querySelectorAll('td');
            if (cells.length < 9) return;

            const request = {
                pk: cells[0].textContent.trim(),
                aid_type: row.dataset.aidType,
                address: cells[2].textContent.trim(),
                city: cells[3].textContent.trim(),
                zip_code: cells[4].textContent.trim(),
                status: row.dataset.status,
                priority: row.dataset.priority,
                // We don't need exact dates for filtering
                created_at: cells[7].textContent.trim(),
                updated_at: cells[8].textContent.trim()
            };

            this.requestsData.push(request);
        });

        return this.requestsData.length > 0;
    }

    /**
     * Set up event listeners for the filter controls
     */
    setupFilterListeners() {
        // Add event listeners for aid type filter
        const aidTypeFilter = document.getElementById('aid-type-filter');
        if (aidTypeFilter) {
            aidTypeFilter.addEventListener('change', (e) => {
                this.filters.aidType = e.target.value;
                this.applyFilters();
            });
        }

        // Add event listeners for status filter
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.applyFilters();
            });
        }

        // Add event listeners for priority filter
        const priorityFilter = document.getElementById('priority-filter');
        if (priorityFilter) {
            priorityFilter.addEventListener('change', (e) => {
                this.filters.priority = e.target.value;
                this.applyFilters();
            });
        }

        // Add event listeners for search input
        const searchInput = document.getElementById('aid-request-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.searchText = e.target.value.toLowerCase();
                this.applyFilters();
            });
        }

        // Set up a listener for our custom filter event
        document.addEventListener('aidrequest:filter', (e) => {
            if (aidRequestTableConfig.debug) {
                console.log('[DEBUG] Received aidrequest:filter event:', e.detail);
            }

            // Reset all filters first
            this.filters.aidType = '';
            this.filters.status = '';
            this.filters.priority = '';

            // Set the appropriate filter based on the event detail
            const { type, value } = e.detail;
            if (type === 'aid_type') {
                this.filters.aidType = value;
            } else if (type === 'status') {
                this.filters.status = value;
            } else if (type === 'priority') {
                this.filters.priority = value;
            }

            // Apply the filters
            this.applyFilters();
        });
    }

    /**
     * Set up event listeners for table header sorting
     */
    setupSortingListeners() {
        const headers = document.querySelectorAll(`#${this.tableId} th[data-sort]`);

        headers.forEach(header => {
            header.style.cursor = 'pointer';
            header.title = 'Click to sort';

            // Add sorting indicators
            const sortIndicator = document.createElement('span');
            sortIndicator.className = 'ms-1';
            sortIndicator.innerHTML = '↕️';
            header.appendChild(sortIndicator);

            header.addEventListener('click', () => {
                const column = header.dataset.sort;

                // Toggle direction if clicking the same column
                if (this.sort.column === column) {
                    this.sort.direction = this.sort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sort.column = column;
                    this.sort.direction = 'asc';
                }

                // Update UI to show sort direction
                headers.forEach(h => {
                    const indicator = h.querySelector('span');
                    if (indicator) {
                        if (h.dataset.sort === this.sort.column) {
                            indicator.innerHTML = this.sort.direction === 'asc' ? '↑' : '↓';
                        } else {
                            indicator.innerHTML = '↕️';
                        }
                    }
                });

                this.applyFilters(); // This will also apply sorting
            });
        });
    }

    /**
     * Apply filters to the table
     */
    applyFilters() {
        if (this.dataFromHtml) {
            this.applyFiltersToExistingRows();
        } else {
            this.renderTable();
        }
    }

    /**
     * Apply filters to existing HTML table rows without rebuilding the table
     */
    applyFiltersToExistingRows() {
        const { aidType, status, priority, searchText } = this.filters;
        const tableBody = document.getElementById(this.tableBodyId);
        const rows = tableBody.querySelectorAll('tr');

        if (aidRequestTableConfig.debug) {
            console.log('[DEBUG] Applying filters to existing rows:', {
                aidType: aidType,
                status: status,
                priority: priority,
                searchText: searchText
            });
        }

        let visibleCount = 0;

        rows.forEach(row => {
            // Check for data attributes existence - accept either kebab-case or camelCase
            const hasDataAttributes =
                row.hasAttribute('data-aid-type') ||
                row.hasAttribute('data-aidType');

            // Skip rows without data attributes (like "no results" row)
            if (!hasDataAttributes) {
                if (aidRequestTableConfig.debug) {
                    console.log('[DEBUG] Row has no data attributes, skipping:', row);
                }
                return;
            }

            // Get data attributes, checking both potential formats
            const rowAidType = row.getAttribute('data-aid-type') || row.getAttribute('data-aidType') || '';
            const rowStatus = row.getAttribute('data-status') || '';
            const rowPriority = row.getAttribute('data-priority') || '';
            const rowText = row.textContent.toLowerCase();

            if (aidRequestTableConfig.debug) {
                console.log('[DEBUG] Row attributes:', {
                    'data-aid-type': rowAidType,
                    'data-status': rowStatus,
                    'data-priority': rowPriority
                });
            }

            // Check if row matches all filters
            const matchesAidType = !aidType || rowAidType === aidType;
            const matchesStatus = !status || rowStatus === status;
            const matchesPriority = !priority || rowPriority === priority;
            const matchesSearch = !searchText || rowText.includes(searchText);

            const isVisible = matchesAidType && matchesStatus && matchesPriority && matchesSearch;

            if (aidRequestTableConfig.debug) {
                console.log(`[DEBUG] Row ${row.querySelector('td')?.textContent || 'unknown'} visibility:`, {
                    matchesAidType,
                    matchesStatus,
                    matchesPriority,
                    matchesSearch,
                    isVisible
                });
            }

            // Apply visibility
            row.style.display = isVisible ? '' : 'none';

            if (isVisible) {
                visibleCount++;

                // Highlight filtered values for better visibility
                if (aidType || status || priority) {
                    // Add highlighting to filtered columns
                    if (aidType && rowAidType === aidType) {
                        const cell = row.querySelector('td:nth-child(2) .badge');
                        if (cell) this.highlightElement(cell);
                    }

                    if (status && rowStatus === status) {
                        const cell = row.querySelector('td:nth-child(6) .badge');
                        if (cell) this.highlightElement(cell);
                    }

                    if (priority && rowPriority === priority) {
                        const cell = row.querySelector('td:nth-child(7) .badge');
                        if (cell) this.highlightElement(cell);
                    }
                } else {
                    // Remove highlighting when filter is cleared
                    row.querySelectorAll('.highlighted').forEach(el => {
                        el.classList.remove('highlighted');
                        el.style.transform = '';
                    });
                }
            }
        });

        // Update results counter
        this.updateResultsCounter(visibleCount);

        // Sort the visible rows
        this.sortExistingRows();
    }

    /**
     * Highlight an element to make it stand out
     */
    highlightElement(element) {
        if (!element.classList.contains('highlighted')) {
            element.classList.add('highlighted');
            element.style.transform = 'scale(1.2)';
            element.style.fontWeight = 'bold';
        }
    }

    /**
     * Sort the existing table rows without rebuilding the table
     */
    sortExistingRows() {
        const tableBody = document.getElementById(this.tableBodyId);
        // Select rows with either data-aid-type or data-aidType attribute
        const rows = Array.from(tableBody.querySelectorAll('tr[data-aid-type], tr[data-aidType]'));

        if (aidRequestTableConfig.debug) {
            console.log('[DEBUG] Sorting rows:', rows.length);
        }

        if (rows.length === 0) {
            console.warn("No rows found to sort");
            return;
        }

        // Map column names to numeric indices
        const columnMap = {
            'pk': 0,
            'aid_type': 1,
            'address': 2,
            'city': 3,
            'zip_code': 4,
            'status': 5,
            'priority': 6,
            'created_at': 7,
            'updated_at': 8
        };

        // Get the column index to sort by
        const columnIndex = columnMap[this.sort.column] || 0;

        if (aidRequestTableConfig.debug) {
            console.log('[DEBUG] Sorting by column:', this.sort.column, 'index:', columnIndex);
        }

        // Sort the rows
        rows.sort((a, b) => {
            const aCell = a.querySelector(`td:nth-child(${columnIndex + 1})`);
            const bCell = b.querySelector(`td:nth-child(${columnIndex + 1})`);

            if (!aCell || !bCell) return 0;

            let aValue = aCell.textContent.trim();
            let bValue = bCell.textContent.trim();

            if (aidRequestTableConfig.debug) {
                console.log('[DEBUG] Comparing values:', aValue, bValue);
            }

            // Special handling for dates
            if (this.sort.column === 'created_at' || this.sort.column === 'updated_at') {
                aValue = new Date(aValue).getTime();
                bValue = new Date(bValue).getTime();
            }

            // Numeric comparison for IDs
            if (this.sort.column === 'pk') {
                aValue = parseInt(aValue, 10);
                bValue = parseInt(bValue, 10);
            }

            // Compare values
            if (aValue < bValue) return this.sort.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Reorder rows in the DOM
        rows.forEach(row => tableBody.appendChild(row));
    }

    /**
     * Create filter controls for the table
     */
    createFilterControls() {
        // Skip this if we're using the server-rendered filter controls
        if (this.dataFromHtml) return;

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
     * Create the table headers with sorting functionality
     */
    createTableHeaders() {
        // Skip this if we're using the server-rendered headers
        if (this.dataFromHtml) return;

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
     * Render the table with filtered and sorted data
     */
    renderTable() {
        const tableBody = document.getElementById(this.tableBodyId);
        if (!tableBody) {
            console.error("Table body element not found");
            return;
        }

        // Apply filters
        const { aidType, status, priority, searchText } = this.filters;
        const filteredData = this.requestsData.filter(request => {
            const matchesAidType = !aidType || request.aid_type === aidType;
            const matchesStatus = !status || request.status === status;
            const matchesPriority = !priority || request.priority === priority;

            // Search across all text fields
            const matchesSearch = !searchText ||
                Object.values(request).some(value =>
                    value && value.toString().toLowerCase().includes(searchText)
                );

            return matchesAidType && matchesStatus && matchesPriority && matchesSearch;
        });

        // Sort the data
        const sortedData = this.sortData(filteredData);

        // Update results counter
        this.updateResultsCounter(sortedData.length);

        // Build the table rows
        let html = '';

        if (sortedData.length === 0) {
            html = `
                <tr>
                    <td colspan="10" class="text-center">No matching aid requests found.</td>
                </tr>
            `;
        } else {
            sortedData.forEach(request => {
                const aidTypeBadge = `<span class="badge bg-primary ${aidType === request.aid_type ? 'highlighted' : ''}">${request.aid_type}</span>`;
                const statusBadge = `<span class="badge bg-info ${status === request.status ? 'highlighted' : ''}">${request.status}</span>`;
                const priorityBadge = `<span class="badge bg-warning text-dark ${priority === request.priority ? 'highlighted' : ''}">${request.priority}</span>`;

                const createdDate = typeof request.created_at === 'string'
                    ? request.created_at
                    : new Date(request.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                const updatedDate = typeof request.updated_at === 'string'
                    ? request.updated_at
                    : new Date(request.updated_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                html += `
                    <tr data-aid-type="${request.aid_type}" data-status="${request.status}" data-priority="${request.priority}">
                        <td>${request.pk}</td>
                        <td>${aidTypeBadge}</td>
                        <td>${request.address || ''}</td>
                        <td>${request.city || ''}</td>
                        <td>${request.zip_code || ''}</td>
                        <td>${statusBadge}</td>
                        <td>${priorityBadge}</td>
                        <td>${createdDate}</td>
                        <td>${updatedDate}</td>
                        <td>
                            <div class="btn-group">
                                <a href="/aidrequests/${this.fieldOp.slug}/${request.pk}/" class="btn btn-sm btn-info p-1">
                                    <i class="bi bi-eye-fill"></i>
                                </a>
                                <a href="/aidrequests/${this.fieldOp.slug}/${request.pk}/update/" class="btn btn-sm btn-warning p-1">
                                    <i class="bi bi-pencil-fill"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }

        tableBody.innerHTML = html;
    }

    /**
     * Sort data based on current sort settings
     * @param {Array} data Data to sort
     * @returns {Array} Sorted data
     */
    sortData(data) {
        const { column, direction } = this.sort;

        return [...data].sort((a, b) => {
            let aValue = a[column];
            let bValue = b[column];

            // Handle dates
            if (column === 'created_at' || column === 'updated_at') {
                aValue = new Date(aValue).getTime();
                bValue = new Date(bValue).getTime();
            }

            // Handle null values
            if (aValue === null || aValue === undefined) aValue = '';
            if (bValue === null || bValue === undefined) bValue = '';

            // Convert to strings for comparison if not dates
            if (typeof aValue !== 'number') aValue = aValue.toString().toLowerCase();
            if (typeof bValue !== 'number') bValue = bValue.toString().toLowerCase();

            // Compare
            if (aValue < bValue) return direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    /**
     * Update the results counter
     * @param {number} count Number of results
     */
    updateResultsCounter(count) {
        const counter = document.getElementById('results-counter');
        if (counter) {
            counter.textContent = `${count} results`;
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

    /**
     * Set up listeners for the event bus
     */
    setupEventBusListeners() {
        if (!window.aidRequestEventBus) {
            console.error("Event bus not available");
            return;
        }

        // Subscribe to filter events
        window.aidRequestEventBus.on('filter', (data) => {
            if (aidRequestTableConfig.debug) {
                console.log('[DEBUG] Received filter event from bus:', data);
            }

            // Reset all filters first
            this.filters.aidType = '';
            this.filters.status = '';
            this.filters.priority = '';

            // Set the appropriate filter based on the event data
            const { type, value } = data;
            if (type === 'aid_type') {
                this.filters.aidType = value;
            } else if (type === 'status') {
                this.filters.status = value;
            } else if (type === 'priority') {
                this.filters.priority = value;
            }

            // Apply the filters
            this.applyFilters();
        });
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
    try {
        // Get field op information
        const fieldOpName = document.getElementById('field-op-name')?.textContent.trim();
        const fieldOpSlug = document.getElementById('field-op-slug')?.textContent.trim();

        // Parse JSON data from script tags
        const requestsData = JSON.parse(document.getElementById('aid-requests-data')?.textContent || '[]');
        const aidTypesData = JSON.parse(document.getElementById('aid-types-json')?.textContent || '[]');
        const statusChoices = JSON.parse(document.getElementById('status-choices-data')?.textContent || '[]');
        const priorityChoices = JSON.parse(document.getElementById('priority-choices-data')?.textContent || '[]');

        // Initialize the table and store the instance globally
        window.aidRequestTable = new AidRequestTable({
            requestsData: requestsData,
            aidTypesData: aidTypesData,
            statusChoices: statusChoices,
            priorityChoices: priorityChoices,
            fieldOp: {
                name: fieldOpName,
                slug: fieldOpSlug
            }
        });

        console.log('Aid request table initialized and stored globally as window.aidRequestTable');
    } catch (error) {
        console.error('Error initializing aid request table:', error);
    }
});

// Add custom CSS for highlighted elements
const style = document.createElement('style');
style.textContent = `
.highlighted {
    transform: scale(1.2) !important;
    font-weight: bold !important;
    transition: all 0.2s ease;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}
`;
document.head.appendChild(style);
