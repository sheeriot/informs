// Initialize map with bounds-based camera
function initializeMap(mapElementId) {
    if (!window.atlas) {
        console.error('Azure Maps SDK not loaded');
        return null;
    }

    const mapElement = document.getElementById(mapElementId);
    if (!mapElement) {
        console.error(`Map element with id '${mapElementId}' not found`);
        return null;
    }

    // Extract and validate bounds from data attributes
    const bounds = [
        parseFloat(mapElement.dataset.boundsWest),
        parseFloat(mapElement.dataset.boundsSouth),
        parseFloat(mapElement.dataset.boundsEast),
        parseFloat(mapElement.dataset.boundsNorth)
    ];

    // Validate bounds
    if (bounds.some(isNaN) || bounds[0] > bounds[2] || bounds[1] > bounds[3]) {
        console.error('Invalid bounds:', {
            west: bounds[0],
            south: bounds[1],
            east: bounds[2],
            north: bounds[3]
        });
        return null;
    }

    const padding = parseInt(mapElement.dataset.padding) || 50;
    const azureMapsKey = mapElement.dataset.azureMapsKey;

    if (!azureMapsKey) {
        console.error('Azure Maps key not provided');
        return null;
    }

    try {
        // Initialize map with bounds
        const map = new atlas.Map(mapElementId, {
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: azureMapsKey
            },
            style: 'road',
            showFeedbackLink: false,
            showLogo: false,
            cameraBoundsOptions: {
                bounds: bounds,
                padding: padding,
                maxZoom: 18
            }
        });

        // Set bounds again after map is ready
        map.events.add('ready', () => {
            map.setCamera({
                bounds: bounds,
                padding: padding
            });
        });

        return map;
    } catch (error) {
        console.error('Error initializing map:', error);
        return null;
    }
}

// Function to update map bounds
function updateMapBounds(map, bounds, padding = 50) {
    if (!map) {
        console.error('Map instance not provided');
        return;
    }

    if (!bounds || bounds.length !== 4 || bounds.some(isNaN)) {
        console.error('Invalid bounds:', bounds);
        return;
    }

    console.log('Updating map bounds:', {
        bounds: bounds,
        padding: padding
    });

    try {
        map.setCamera({
            bounds: bounds,
            padding: padding
        });
    } catch (error) {
        console.error('Error updating map bounds:', error);
    }
}
