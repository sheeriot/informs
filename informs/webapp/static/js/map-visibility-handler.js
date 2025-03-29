/**
 * map-visibility-handler.js
 *
 * Handles the visibility of map markers based on filtered aid requests
 * Acts as a bridge between List.js filtering and the map functionality
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Listen for the filtered aid requests event
    document.addEventListener('aidRequestsFiltered', function(event) {
        try {
            if (!event.detail || !event.detail.visibleAidRequests) {
                console.error('Invalid event data for aidRequestsFiltered event');
                return;
            }

            let visibleIds = [];
            try {
                visibleIds = event.detail.visibleAidRequests.map(id =>
                    typeof id === 'string' ? parseInt(id, 10) : id
                );
            } catch (error) {
                console.error('Error processing visible IDs:', error);
                visibleIds = event.detail.visibleAidRequests || [];
            }

            console.log('Map handler received filtered aid requests:', visibleIds.length);

            // Call the map's filter function if it exists
            if (typeof updateMapMarkerVisibility === 'function') {
                try {
                    updateMapMarkerVisibility(visibleIds);
                } catch (error) {
                    console.error('Error calling updateMapMarkerVisibility:', error);
                }
            } else {
                // If the map API doesn't have this function yet, we'll provide a basic implementation
                // that we can integrate with the existing map code
                window.filteredAidRequestIds = visibleIds;

                try {
                    // Dispatch an event that the map code can listen for
                    const mapUpdateEvent = new CustomEvent('updateMapMarkers', {
                        detail: {
                            visibleIds: visibleIds
                        }
                    });
                    document.dispatchEvent(mapUpdateEvent);
                } catch (error) {
                    console.error('Error dispatching updateMapMarkers event:', error);
                }
            }
        } catch (error) {
            console.error('Error handling aidRequestsFiltered event:', error);
        }
    });
});

// Helper function that can be called from map code
function updateMapMarkerVisibility(visibleIds) {
    // This function will be implemented in the map code
    // For now, we'll just store the IDs and let the map code handle the visibility
    try {
        window.filteredAidRequestIds = visibleIds || [];
    } catch (error) {
        console.error('Error setting filteredAidRequestIds:', error);
    }
}
