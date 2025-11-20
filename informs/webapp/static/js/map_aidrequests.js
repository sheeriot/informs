/**
 * map_aidrequests.js
 * A robust, simplified version for initializing the map and its layers.
 */

// A global 'map' variable
let map;

// Global config for this script
const mapRequestsConfig = {
    debug: true, // will be updated by config
    version: '0.0.16',
    fieldOp: { latitude: 0, longitude: 0 },
    aidRequestLocations: []
};
let successfullyCreatedIcons = [];
let aidRequestLayer; // Declared globally for access in updateMapLayer
let aidRequestSource; // Declared globally for access in updateMapLayer

// Expose the initialize function globally so the main list script can call it
window.initializeAidRequestMap = function(requests) {
    if (mapRequestsConfig.debug) console.log('[Map] Initializing...');

    const mapContainer = document.getElementById('aid-request-map-container');
    if (!mapContainer) {
        console.error('[Map] Map container not found during initialization.');
        return;
    }

    // TEST ASSUMPTION: Log the subscription key to verify it exists.
    const subscriptionKey = mapContainer.dataset.mapsSubscriptionKey;
    if (mapRequestsConfig.debug) {
        console.log('[Map] Subscription Key:', subscriptionKey ? 'Found' : 'NOT FOUND');
    }

    // Populate the fieldOp config from the map container's data attributes
    try {
        mapRequestsConfig.fieldOp = {
            latitude: parseFloat(mapContainer.dataset.centerLat),
            longitude: parseFloat(mapContainer.dataset.centerLon),
            radius: JSON.parse(mapContainer.dataset.ringSize), // Assumes ring_size is a JSON array like [10, "mi"]
            slug: mapContainer.dataset.fieldOpSlug
        };
    } catch (e) {
        console.error('[Map] Failed to parse FieldOp data from map container attributes:', e);
        mapRequestsConfig.fieldOp = { latitude: 0, longitude: 0 };
    }


    mapRequestsConfig.aidRequestLocations = requests || [];

    const initialBoundsString = mapContainer.dataset.initialBounds;
    let initialBounds = null;
    if (initialBoundsString) {
        try {
            initialBounds = JSON.parse(initialBoundsString);
            if (mapRequestsConfig.debug) console.log('[Map] Initial bounds from backend:', initialBounds);
        } catch (e) {
            console.error('[Map] Error parsing initial bounds:', e);
        }
    }

    // Initialize the map
    const map = new atlas.Map(mapContainer, {
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: subscriptionKey
        },
        style: 'road', // Default to "Terra" view
        styleControlOptions: {
            mapStyles: ['road', 'satellite_road_labels', 'grayscale_dark'] // Offer road, satellite, and dark styles
        },
        controls: [
            new atlas.control.ZoomControl(),
            new atlas.control.PitchControl(),
            new atlas.control.CompassControl(),
            new atlas.control.StyleControl({
                mapStyles: ['satellite_road_labels', 'grayscale_dark'],
                style: 'light'
            })
        ],
        zoom: 3,
        center: [-98.5795, 39.8283] // Default center of US
    });

    // Wait until the map resources are ready. THIS IS THE KEY FIX.
    map.events.add('ready', async () => {
        if (mapRequestsConfig.debug) console.log('[Map] Map is ready. Proceeding with layer setup.');

        // Set the camera to the initial bounds calculated by the backend
        if (initialBounds) {
            if (mapRequestsConfig.debug) console.log('[Map] Setting camera to initial bounds:', initialBounds);
            map.setCamera({ bounds: initialBounds, padding: 50 });
        } else {
            if (mapRequestsConfig.debug) console.warn('[Map] No initial bounds to set camera.');
        }

        // Add controls
        map.controls.add([
            new atlas.control.ZoomControl(),
            new atlas.control.PitchControl(),
            new atlas.control.CompassControl(),
            new atlas.control.StyleControl()
        ], { position: 'top-left' });
        map.controls.add(new atlas.control.ScaleControl(), { position: 'bottom-left' });

        // Create a custom icon for the field op using a VALID built-in template name
        await map.imageSprite.createFromTemplate('field-op-star', 'marker', 'royalblue', '#fff');
        if (mapRequestsConfig.debug) console.log('[Map] Custom FieldOp icon created.');

        // 1. Create all custom icons for aid types FIRST.
        const aidTypesConfig = JSON.parse(document.getElementById('aid-types-json').textContent);
        if (mapRequestsConfig.debug) console.log('[Map] aidTypesConfig for icon creation:', aidTypesConfig);
        await createCustomIcons(aidTypesConfig);

        // 2. Initialize the layers
        const fieldOpConfig = getFieldOpConfig();
        initializeFieldOpLayer(fieldOpConfig);

        // --- THIS IS THE FIX ---
        // Use the `requests` variable passed into the main function, don't try to re-fetch it from the window object.
        if (mapRequestsConfig.debug) {
            console.log('[Map] Checking integrity of aid request data before initializing layer...');
            console.table(requests);
        }
        if (!Array.isArray(requests)) {
            console.error('[Map] CRITICAL: The aid request data passed to initializeAidRequestMap is not an array or is missing.', requests);
            return;
        }
        // --- END FIX ---

        initializeAidRequestLayer(requests, aidTypesConfig);

        // 3. Restore popup logic
        setupPopupLogic(aidTypesConfig);

        if (mapRequestsConfig.debug) console.log('[Map] All layers initialized.');

        // Re-enable filter initialization
        // if (window.initializeAidRequestFilter) {
        //     window.initializeAidRequestFilter();
        // } else if (mapRequestsConfig.debug) {
        //     console.error('[Map] Filter initializer function not found.');
        // }
    });

    // Add a global error listener for the map
    map.events.add('error', (e) => {
        console.error('[Map] CRITICAL MAP ERROR:', e.error);
    });

    function getFieldOpConfig() {
        if (mapRequestsConfig.debug) console.log('[Map] Retrieving FieldOp config.');
        return mapRequestsConfig.fieldOp;
    }

    // Listen for events to update a single point on the map
    document.body.addEventListener('mapPointShouldUpdate', (e) => {
        if (!aidRequestSource) return;

        const rowElement = e.detail?.rowElement;
        if (!rowElement) return;

        const requestId = parseInt(rowElement.dataset.id, 10);
        const newStatus = rowElement.dataset.status;
        const newPriority = rowElement.dataset.priority || 'none';

        const pointToUpdate = aidRequestSource.getShapeById(requestId);

        if (pointToUpdate) {
            if (mapRequestsConfig.debug) console.log(`[Map] Updating point #${requestId} with status: ${newStatus}, priority: ${newPriority}`);
            const currentProps = pointToUpdate.getProperties();
            currentProps.status = newStatus;
            currentProps.priority = newPriority;
            pointToUpdate.setProperties(currentProps);
        } else if (mapRequestsConfig.debug) {
            console.warn(`[Map] Could not find point with ID ${requestId} to update.`);
        }
    });

    function updateMapLayer(filterState) {
        if (!map || !aidRequestLayer) {
            if (mapRequestsConfig.debug) console.warn('[Map] updateMapLayer called but map or aidRequestLayer not ready.');
            return;
        }

        // If filterState is null, clear the filter and show all markers
        if (!filterState) {
            if (mapRequestsConfig.debug) console.log('[Map] No filter state provided. Clearing layer filter.');
            aidRequestLayer.setOptions({ filter: null });
            return;
        }

        const filters = [];

        // Handle status filter
        if (filterState.status && filterState.status.length > 0) {
            filters.push(['in', ['get', 'status'], ['literal', filterState.status]]);
        }

        // Handle priority filter
        if (filterState.priority && filterState.priority.length > 0) {
            // Azure maps considers null a distinct value, so we must handle it explicitly if 'none' is a filter option
            const priorities = filterState.priority.map(p => p === 'none' ? null : p);
            filters.push(['in', ['get', 'priority'], ['literal', priorities]]);
        }

        // Handle aid_type filter
        if (filterState.aid_type && filterState.aid_type.length > 0) {
            filters.push(['in', ['get', 'aid_type'], ['literal', filterState.aid_type]]);
        }

        // Combine all filters. If no filters are active, it will be an empty array which shows all.
        const combinedFilter = filters.length > 1 ? ['all', ...filters] : filters[0] || null;

        if (mapRequestsConfig.debug) console.log('[Map] Constructed layer filter:', JSON.stringify(combinedFilter));

        try {
            aidRequestLayer.setOptions({ filter: combinedFilter });
            if (mapRequestsConfig.debug) console.log('[Map] Layer filter applied successfully.');
        } catch (e) {
            console.error('[Map] Error applying layer filter:', e);
        }
    }


    function initializeFieldOpLayer(fieldOp) {
        if (mapRequestsConfig.debug) {
            console.log('[Map] Initializing FieldOp Layer.');
            console.log('[Map] FieldOp Config:', fieldOp);
        }

        if (!fieldOp || !fieldOp.latitude || !fieldOp.longitude) {
            if (mapRequestsConfig.debug) console.warn('[Map] FieldOp config or location is missing.');
            return;
        }

        const fieldOpDataSource = new atlas.source.DataSource();
        map.sources.add(fieldOpDataSource);

        // Add the center point for the FieldOp
        const centerPoint = new atlas.data.Point([fieldOp.longitude, fieldOp.latitude]);
        fieldOpDataSource.add(new atlas.data.Feature(centerPoint, {
            name: 'Field Operation Center',
            slug: fieldOp.slug
        }));

        // Check if radius is valid for drawing a circle.
        if (fieldOp.radius && typeof fieldOp.radius === 'number' && fieldOp.radius > 0) {
            const radiusInMeters = fieldOp.radius * 1609.34; // Convert miles to meters
            const circlePolygon = new atlas.data.Polygon([atlas.math.getRegularPolygonPath(centerPoint.coordinates, radiusInMeters, 64)]);
            fieldOpDataSource.add(new atlas.data.Feature(circlePolygon, {
                name: 'Field Operation Radius'
            }));
        } else {
            if (mapRequestsConfig.debug) console.warn('[Map] FieldOp radius is missing or invalid. Skipping circle.', fieldOp.radius);
        }

        // Add a line layer to render the circle's outline
        map.layers.add(new atlas.layer.LineLayer(fieldOpDataSource, 'field-op-radius-layer-line', {
            strokeColor: 'rgba(220, 53, 69, 0.8)',
            strokeWidth: 2,
            filter: ['==', ['geometry-type'], 'Polygon']
        }));

        // Add a symbol layer for the center point on top of the circle
        map.layers.add(new atlas.layer.SymbolLayer(fieldOpDataSource, 'field-op-center-layer', {
            iconOptions: {
                image: 'field-op-star',
                allowOverlap: true,
                ignorePlacement: true,
                anchor: 'center' // Anchor the icon itself in the center
            },
            textOptions: {
                textField: [
                    'format',
                    ['get', 'slug'], // Line 1: The slug
                    { 'font-scale': 1.1 },
                    '\n(top, 0.8)', // Line 2: The settings
                    { 'font-scale': 0.8 }
                ],
                anchor: 'top', // Anchor the top of the text block...
                offset: [0, 0.8], // ...0.8 'em' units below the icon's anchor (its center)
                color: '#000000',
                haloColor: '#FFFFFF',
                haloWidth: 1,
                font: ['SegoeUi-Bold']
            },
            filter: ['==', ['geometry-type'], 'Point']
        }));

        if (mapRequestsConfig.debug) console.log('[Map] FieldOp layer initialized.');
    }

    function initializeAidRequestLayer(requests, aidTypesConfig) {
        console.log('%c[Map] Initializing Aid Request Layer', 'color: green; font-weight: bold;');

        const points = [];
        const aidRequestSource = new atlas.source.DataSource();
        map.sources.add(aidRequestSource);

        let iconExpression = 'marker-default'; // Fallback icon
        let scaleExpression = 1.0; // Fallback scale

        if (successfullyCreatedIcons.length > 0) {
            // Build the expression for matching icons
            iconExpression = ['match', ['get', 'aid_type']];
            const uniqueIconSlugs = [...new Set(successfullyCreatedIcons)];
            uniqueIconSlugs.forEach(slug => {
                iconExpression.push(slug, slug);
            });
            iconExpression.push('marker-default');

            // Build the expression for icon scaling
            scaleExpression = ['match', ['get', 'aid_type']];
            const uniqueScaleSlugs = [...new Set(aidTypesConfig.map(at => at.slug))];
            uniqueScaleSlugs.forEach(slug => {
                const aidType = aidTypesConfig.find(at => at.slug === slug);
                if (aidType) {
                    scaleExpression.push(slug, aidType.icon_scale || 1.0);
                }
            });
            scaleExpression.push(1.0);
        }

        if (mapRequestsConfig.debug) {
            console.log("Icon expression:", JSON.stringify(iconExpression));
            console.log("Scale expression:", JSON.stringify(scaleExpression));
        }

        requests.forEach(request => {
            try {
                // CORRECTED: Check for latitude/longitude within the location object, not a 'coordinates' property.
                if (request.location && typeof request.location.latitude === 'number' && typeof request.location.longitude === 'number') {
                    // Azure Maps expects coordinates in the format [longitude, latitude].
                    const coordinates = [request.location.longitude, request.location.latitude];
                    points.push(new atlas.data.Feature(new atlas.data.Point(coordinates), {
                        requestId: request.id,
                        status: request.status,
                        priority: request.priority,
                        aid_type: request.aid_type.slug,
                        full_address: request.full_address,
                        requester_name: request.requester_name
                    }));
                } else if (mapRequestsConfig.debug) {
                    console.warn(`[Map] Skipping request #${request.id} due to missing or invalid location data.`, { location: request.location });
                }
            } catch (error) {
                if (mapRequestsConfig.debug) {
                    console.error(`[Map] Failed to process aid request #${request.id} for map point.`, { error: error, request: request });
                }
            }
        });

        if (mapRequestsConfig.debug) {
            console.log(`Preparing to add ${points.length} points to the data source.`);
            console.table(points.map(p => p.properties));
        }

        aidRequestSource.add(points);

        aidRequestLayer = new atlas.layer.SymbolLayer(aidRequestSource, 'aid-request-layer', {
            iconOptions: {
                image: iconExpression,
                size: scaleExpression,
                allowOverlap: true,
                ignorePlacement: true,
                anchor: 'bottom' // Standardized icon anchor
            },
            textOptions: {
                textField: ['get', 'requestId'],
                anchor: 'top', // Standardized text anchor
                offset: [0, -0.5], // Standardized text offset
                color: 'black',
                haloColor: 'white',
                haloWidth: 1,
                size: 12,
                font: ['SegoeUi-Bold'],
            }
        });

        map.layers.add(aidRequestLayer);

        if (mapRequestsConfig.debug) console.log(`[Map] Aid Request layer added.`);
    }

    function initializeTestLayers(fieldOpConfig, successfullyCreatedIcons) {
        if (mapRequestsConfig.debug) console.log('%c[Map Test] Initializing test layers (currently inactive).', 'color: orange; font-weight: bold;');

        const center = new atlas.data.Position(fieldOpConfig.longitude, fieldOpConfig.latitude);
        const radiusInMeters = (fieldOpConfig.radius || 1) * 1609.34;
        const positions = [
            atlas.math.getDestination(center, 45, radiusInMeters * 0.8),
            atlas.math.getDestination(center, 165, radiusInMeters * 1.3),
            atlas.math.getDestination(center, 285, radiusInMeters * 1.8),
            atlas.math.getDestination(center, 90, radiusInMeters * 0.8),
            atlas.math.getDestination(center, 270, radiusInMeters * 0.8),
            atlas.math.getDestination(center, 90, radiusInMeters * 1.3),
            atlas.math.getDestination(center, 270, radiusInMeters * 1.3),
            atlas.math.getDestination(center, 180, radiusInMeters * 1.8)
        ];

        const standardIconOptions = { allowOverlap: true, ignorePlacement: true, size: 1.2, anchor: 'bottom' };
        const standardTextOptions = { anchor: 'top', offset: [0, -0.5], color: 'black', haloColor: 'white', haloWidth: 1, size: 14, font: ['SegoeUi-Bold'] };

        for (let i = 0; i < positions.length; i++) {
            const testNum = i + 1;
            console.groupCollapsed(`[Map Test] Layer ${testNum}`);
            const source = new atlas.source.DataSource(null, { id: `test-source-${testNum}` });
            map.sources.add(source);
            source.add(new atlas.data.Feature(new atlas.data.Point(positions[i]), { label: `TEST ${testNum}` }));
            const layer = new atlas.layer.SymbolLayer(source, `test-layer-${testNum}`, {
                iconOptions: { ...standardIconOptions, image: i === 2 ? 'boat' : 'pin-darkblue' },
                textOptions: { ...standardTextOptions, textField: ['get', 'label'] }
            });
            map.layers.add(layer);
            if (mapRequestsConfig.debug) console.log(`[Map Test] Added Layer ${testNum} at position:`, positions[i]);
            console.groupEnd();
        }
    }


    async function createCustomIcons(aidTypesConfig) {
        if (mapRequestsConfig.debug) {
            console.log('%c[Map] Starting createCustomIcons function...', 'color: blue; font-weight: bold;');
            console.log('[Map] Received aidTypesConfig to create icons:');
            console.table(aidTypesConfig);
        }

        const iconPromises = aidTypesConfig.map(async (aidType) => {
            const iconName = aidType.slug;
            const templateName = aidType.icon_name || 'marker-circle'; // Fallback template
            const color = aidType.icon_color || '#1A82A9'; // Fallback color

            try {
                if (mapRequestsConfig.debug) {
                    console.log(`[Map] Creating icon: name='${iconName}', template='${templateName}', color='${color}'`);
                }
                await map.imageSprite.createFromTemplate(iconName, templateName, color, '#FFFFFF');
                if (mapRequestsConfig.debug) console.log(`[Map] Custom icon '${iconName}' created from template '${templateName}'.`);
                successfullyCreatedIcons.push(iconName);
            } catch (error) {
                if (mapRequestsConfig.debug) {
                    console.warn(`[Map] Failed to create icon '${iconName}' from template '${templateName}'. A default icon will be used. Error:`, error);
                }
            }
        });

        await Promise.all(iconPromises);

        if (mapRequestsConfig.debug) {
            console.log(`%c[Map] Finished createCustomIcons. ${successfullyCreatedIcons.length} of ${aidTypesConfig.length} icons created.`, 'color: blue; font-weight: bold;');
            console.log('[Map] Successfully created icons:', successfullyCreatedIcons);
        }
    }

    function setupPopupLogic(aidTypesConfig) {
        const popup = new atlas.Popup({ pixelOffset: [0, -20], closeButton: true });

        // Create a lookup map from the aidTypesConfig array for efficient access.
        const aidTypesMap = aidTypesConfig.reduce((acc, aidType) => {
            acc[aidType.slug] = aidType;
            return acc;
        }, {});

        // Helper function to safely get the address string.
        function getAddressForProps(prop) {
            const address = prop.full_address || 'Address not available';
            // Remove the country name from the end of the address string.
            if (address.includes(', ')) {
                const parts = address.split(', ');
                if (parts.length > 1) {
                    return parts.slice(0, -1).join(', ');
                }
            }
            return address;
        }

        map.events.add('click', (e) => {
            if (mapRequestsConfig.debug) console.log('[Map] Map click event registered.');

            const features = map.layers.getRenderedShapes(e.position, ['aid-request-layer', 'field-op-center-layer']);

            if (features.length > 0) {
                const clickedShape = features[0];
                const prop = clickedShape.getProperties();
                if (mapRequestsConfig.debug) console.table(prop);

                const markerPosition = clickedShape.getCoordinates();
                const contentDiv = document.createElement('div');
                contentDiv.style.padding = '10px';
                contentDiv.style.maxWidth = '280px';

                let title, copyContent, innerHTML;

                if (prop.requestId) { // It's an Aid Request marker
                    const aidTypeName = aidTypesMap[prop.aid_type]?.name || prop.aid_type;
                    const address = getAddressForProps(prop);
                    title = `Aid Request #${prop.requestId}`;
                    copyContent = `Title: ${title}\nRequester: ${prop.requester_name}\nStatus: ${prop.status}\nPriority: ${prop.priority}\nType: ${aidTypeName}\nAddress: ${address}`;
                    innerHTML = `
                        <h6 class="mb-2 text-center fw-bold">${title}</h6>
                        <strong>Requester:</strong> ${prop.requester_name}<br>
                        <strong>Status:</strong> ${prop.status}<br>
                        <strong>Priority:</strong> ${prop.priority}<br>
                        <strong>Type:</strong> ${aidTypeName}<br>
                        <strong>Address:</strong><br><span style="word-break: break-all;">${address}</span>
                        <hr class="my-1">
                    `;
                } else { // It's the Field Op or a test marker
                    title = prop.slug || 'Marker Details';
                    copyContent = JSON.stringify(prop, null, 2);
                    innerHTML = `<h6 class="mb-2 text-center fw-bold">${title}</h6><pre style="white-space: pre-wrap; word-break: break-all;">${copyContent}</pre>`;
                }

                contentDiv.innerHTML = innerHTML;

                const copyButton = document.createElement('button');
                copyButton.textContent = 'Copy Details';
                copyButton.className = 'btn btn-sm btn-outline-secondary mt-2 w-100';
                copyButton.onclick = () => {
                    navigator.clipboard.writeText(copyContent).then(() => {
                        const originalText = copyButton.textContent;
                        copyButton.textContent = 'Copied!';
                        copyButton.classList.remove('btn-outline-secondary');
                        copyButton.classList.add('btn-success');
                        copyButton.disabled = true;
                        setTimeout(() => {
                            copyButton.textContent = originalText;
                            copyButton.classList.remove('btn-success');
                            copyButton.classList.add('btn-outline-secondary');
                            copyButton.disabled = false;
                        }, 1500);
                    }).catch(err => console.error('[Map] Failed to copy text: ', err));
                };
                contentDiv.appendChild(copyButton);

                popup.setOptions({ content: contentDiv, position: markerPosition });
                popup.open(map);

                const popupContainer = popup.getOptions().content.parentElement;
                if (popupContainer) {
                    const closePopup = () => {
                        if (mapRequestsConfig.debug) console.log('[Map] Mouse left popup, closing.');
                        popup.close();
                    };
                    popupContainer.removeEventListener('mouseleave', closePopup);
                    popupContainer.addEventListener('mouseleave', closePopup, { once: true });
                }
            }
        });
    }

    function getAddressForProps(props) {
        if (props.address) {
            return props.address;
        }
        if (props.latitude && props.longitude) {
            return `Lat: ${props.latitude.toFixed(4)}, Lon: ${props.longitude.toFixed(4)}`;
        }
        return 'No address available';
    }
}
