/**
 * list-aid-requests.js
 *
 * Implements List.js for the aid requests table
 * Provides dynamic filtering, sorting, and searching functionality
 */

// Define status groups
const STATUS_GROUPS = {
    active: ['new', 'assigned', 'resolved'],
    inactive: ['closed', 'rejected', 'other']
};

// Helper function to determine if a status is active
function isActiveStatus(status) {
    return STATUS_GROUPS.active.includes(status);
}

document.addEventListener('DOMContentLoaded', function() {
    // Helper function to log debug messages
    function debug(message, data) {
        console.log(message, data !== undefined ? data : '');
    }

    // Get data from the JSON elements
    const aidRequestsJson = document.getElementById('aid-requests-data');
    if (!aidRequestsJson) {
        console.error('FATAL: Element with id "aid-requests-data" not found. Table cannot be initialized.');
        return;
    }

    const aidRequestsText = aidRequestsJson.textContent.trim();
    if (!aidRequestsText) {
        console.error('FATAL: Aid requests data is empty. Table cannot be initialized.');
        return;
    }

    debug('Raw aid requests data:', aidRequestsText.substring(0, 100) + '...');

    // Parse JSON with no fallbacks - handle possible double-encoded JSON
    let aidRequestsData = [];
    try {
        let parsedData = JSON.parse(aidRequestsText);

        // Handle case where the data might be double-encoded as a string
        if (typeof parsedData === 'string') {
            console.log('Detected double-encoded JSON, attempting second parse');
            parsedData = JSON.parse(parsedData);
        }

        if (Array.isArray(parsedData)) {
            aidRequestsData = parsedData;
            debug('Successfully parsed aid requests as array with', aidRequestsData.length, 'items');
        } else if (typeof parsedData === 'object' && parsedData !== null) {
            aidRequestsData = Object.values(parsedData);
            debug('Successfully parsed aid requests as object, converted to array with', aidRequestsData.length, 'items');
        } else {
            console.error('FATAL: Aid requests data is not an array or object:', typeof parsedData);
            return;
        }
    } catch (error) {
        console.error('FATAL: Failed to parse aid requests JSON:', error.message);
        return;
    }

    // Get aid types data
    let aidTypesData = {};
    const aidTypesJson = document.getElementById('aid-types-json');
    if (!aidTypesJson) {
        console.error('FATAL: Element with id "aid-types-json" not found.');
        return;
    }

    try {
        aidTypesData = JSON.parse(aidTypesJson.textContent.trim());
        debug('Successfully parsed aid types data');
    } catch (error) {
        console.error('FATAL: Failed to parse aid types JSON:', error.message);
        return;
    }

    // Get field op slug
    const fieldOpSlugElement = document.getElementById('field-op-slug');
    if (!fieldOpSlugElement) {
        console.error('FATAL: Element with id "field-op-slug" not found.');
        return;
    }
    const fieldOpSlug = fieldOpSlugElement.textContent.trim();
    if (!fieldOpSlug) {
        console.error('FATAL: Field op slug is empty.');
        return;
    }

    // Setup filtering options
    let activeFilters = {
        aidTypes: [], // Start with all aid types
        priority: [], // Start with all priorities
        statusGroup: ['active'], // Start with active status group
        searchText: ''
    };

    // Process the aid requests data for List.js
    const preparedData = prepareAidRequestsForListJs(aidRequestsData, fieldOpSlug);
    debug(`Prepared ${preparedData.length} aid requests for List.js`);

    // Initialize List.js
    const options = {
        valueNames: [
            'aid-request-id',
            'aid-type-name',
            { name: 'aid-type', attr: 'data-aid-type' },
            'address',
            'city',
            'zip-code',
            { name: 'status', attr: 'data-status' },
            'status-display',
            { name: 'priority', attr: 'data-priority' },
            'priority-display',
            'created-at',
            'updated-at',
            { name: 'search-content', attr: 'data-search-content' }
        ],
        item: `<tr>
            <td class="aid-request-id"></td>
            <td><span class="badge bg-primary aid-type-name"></span></td>
            <td class="address"></td>
            <td class="city"></td>
            <td class="zip-code"></td>
            <td><span class="badge bg-info status-display"></span></td>
            <td><span class="badge bg-warning text-dark priority-display"></span></td>
            <td class="created-at"></td>
            <td class="updated-at"></td>
            <td>
                <div class="btn-group">
                    <a href="#" class="btn btn-sm btn-info p-1 view-link">
                        <i class="bi bi-eye-fill"></i>
                    </a>
                    <a href="#" class="btn btn-sm btn-warning p-1 edit-link">
                        <i class="bi bi-pencil-fill"></i>
                    </a>
                </div>
            </td>
        </tr>`,
        listClass: 'list',
        searchClass: 'search'
    };

    const aidRequestListContainer = document.getElementById('aidrequest-list-container');
    if (!aidRequestListContainer) {
        console.error('FATAL: Element with id "aidrequest-list-container" not found.');
        return;
    }

    const aidRequestList = new List('aidrequest-list-container', options, preparedData);
    if (!aidRequestList) {
        console.error('FATAL: Failed to initialize List.js instance.');
        return;
    }

    // Setup search
    const searchInput = document.getElementById('aid-request-search');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            activeFilters.searchText = e.target.value;
            applyFilters();
        });
    } else {
        console.error('Warning: Search input element not found.');
    }

    // Setup aid type filter
    const aidTypeFilter = document.getElementById('aid-type-filter');
    if (aidTypeFilter) {
        aidTypeFilter.addEventListener('change', function(e) {
            const selectedValue = e.target.value;
            activeFilters.aidTypes = selectedValue ? [selectedValue] : [];
            applyFilters();
        });
    } else {
        console.error('Warning: Aid type filter element not found.');
    }

    // Setup status filter
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', function(e) {
            const selectedValue = e.target.value;
            if (selectedValue === 'active') {
                activeFilters.statusGroup = ['active'];
            } else if (selectedValue === 'inactive') {
                activeFilters.statusGroup = ['inactive'];
            } else if (selectedValue === '') {
                activeFilters.statusGroup = [];
            } else {
                activeFilters.statusGroup = [selectedValue];
            }
            applyFilters();
        });
    } else {
        console.error('Warning: Status filter element not found.');
    }

    // Setup priority filter
    const priorityFilter = document.getElementById('priority-filter');
    if (priorityFilter) {
        priorityFilter.addEventListener('change', function(e) {
            const selectedValue = e.target.value;
            activeFilters.priority = selectedValue ? [selectedValue] : [];
            applyFilters();
        });
    } else {
        console.error('Warning: Priority filter element not found.');
    }

    // Set up summary item clicks
    document.querySelectorAll('.summary-item').forEach(item => {
        item.addEventListener('click', function() {
            const filterType = this.dataset.filterType;
            const filterValue = this.dataset.filterValue;

            document.querySelectorAll('.summary-item').forEach(el => {
                el.classList.remove('active');
            });
            this.classList.add('active');

            // Reset filters
            if (aidTypeFilter) aidTypeFilter.value = '';
            if (statusFilter) statusFilter.value = '';
            if (priorityFilter) priorityFilter.value = '';

            // Apply specific filter
            if (filterType === 'aid_type') {
                if (aidTypeFilter) aidTypeFilter.value = filterValue;
                activeFilters.aidTypes = filterValue ? [filterValue] : [];
                activeFilters.statusGroup = ['active'];
                activeFilters.priority = [];
            } else if (filterType === 'status') {
                if (statusFilter) statusFilter.value = filterValue;
                if (isActiveStatus(filterValue)) {
                    activeFilters.statusGroup = ['active'];
                } else {
                    activeFilters.statusGroup = [filterValue];
                }
                activeFilters.aidTypes = [];
                activeFilters.priority = [];
            } else if (filterType === 'priority') {
                if (priorityFilter) priorityFilter.value = filterValue;
                activeFilters.priority = filterValue ? [filterValue] : [];
                activeFilters.aidTypes = [];
                activeFilters.statusGroup = ['active'];
            }

            applyFilters();
        });
    });

    // Set up sorting functionality
    document.querySelectorAll('[data-sort]').forEach(el => {
        el.addEventListener('click', function() {
            const sortField = this.getAttribute('data-sort');
            aidRequestList.sort(sortField);
        });
    });

    // Apply filters function
    function applyFilters() {
        // Initialize visible requests
        window.visibleAidRequests = [];

        if (!aidRequestList.matchingItems) {
            console.error('FATAL: aidRequestList.matchingItems is not available.');
            return;
        }

        aidRequestList.filter(function(item) {
            const values = item.values();

            // Apply filters
            const aidTypeMatch = activeFilters.aidTypes.length === 0 ||
                activeFilters.aidTypes.includes(values['aid-type']);

            let statusMatch = true;
            if (activeFilters.statusGroup.length > 0) {
                if (activeFilters.statusGroup.includes('active')) {
                    statusMatch = STATUS_GROUPS.active.includes(values.status);
                } else if (activeFilters.statusGroup.includes('inactive')) {
                    statusMatch = STATUS_GROUPS.inactive.includes(values.status);
                } else {
                    statusMatch = activeFilters.statusGroup.includes(values.status);
                }
            }

            const priorityMatch = activeFilters.priority.length === 0 ||
                activeFilters.priority.includes(values.priority);

            const matches = aidTypeMatch && statusMatch && priorityMatch;

            // Store matched ID for map filtering
            if (matches) {
                const aidRequestId = parseInt(values['aid-request-id']);
                if (!isNaN(aidRequestId)) {
                    window.visibleAidRequests.push(aidRequestId);
                }
            }

            return matches;
        });

        // Update results counter
        const resultsCounter = document.getElementById('results-counter');
        if (resultsCounter) {
            resultsCounter.textContent = aidRequestList.matchingItems.length + ' results';
        }

        // Dispatch filtering event for map
        document.dispatchEvent(new CustomEvent('aidRequestsFiltered', {
            detail: {
                visibleAidRequests: window.visibleAidRequests
            }
        }));
        debug('Dispatched aidRequestsFiltered event with', window.visibleAidRequests.length, 'visible requests');
    }

    // Apply initial filters
    applyFilters();

    // Make visible IDs available globally for map
    window.filteredAidRequestIds = window.visibleAidRequests;
});

// Helper function to format data for List.js
function prepareAidRequestsForListJs(aidRequests, fieldOpSlug) {
    // Fail fast
    if (!Array.isArray(aidRequests)) {
        console.error('FATAL: aidRequests is not an array:', typeof aidRequests);
        return [];
    }

    if (!fieldOpSlug) {
        console.error('FATAL: fieldOpSlug is required for URL construction');
        return [];
    }

    console.log(`Preparing ${aidRequests.length} aid requests for List.js`);

    return aidRequests.map(request => {
        if (!request || typeof request !== 'object') {
            console.error('Warning: Invalid request item:', request);
            return null;
        }

        if (!request.pk) {
            console.error('Warning: Request missing primary key (pk):', request);
            return null;
        }

        // Format dates
        const createdDate = new Date(request.created_at || new Date());
        const updatedDate = new Date(request.updated_at || new Date());

        // Construct URLs
        const viewUrl = `/${fieldOpSlug}/aidrequest/${request.pk}/`;
        const editUrl = `/${fieldOpSlug}/aidrequest/${request.pk}/update/`;

        return {
            'aid-request-id': request.pk,
            'aid-type-name': request.aid_type_name || 'Unknown',
            'aid-type': request.aid_type || request.aid_type_slug || '',
            'address': request.address || request.street_address || '',
            'city': request.city || '',
            'zip-code': request.zip_code || '',
            'status': request.status || '',
            'status-display': request.status_display || 'Unknown',
            'priority': request.priority || '',
            'priority-display': request.priority_display || 'None',
            'created-at': createdDate.toLocaleString(),
            'updated-at': updatedDate.toLocaleString(),
            'search-content': `${request.pk} ${request.aid_type_name || ''} ${request.address || ''} ${request.city || ''} ${request.requester_name || ''}`,
            'view-link': viewUrl,
            'edit-link': editUrl
        };
    }).filter(Boolean); // Remove any null entries
}
