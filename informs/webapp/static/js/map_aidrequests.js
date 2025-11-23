/**
 * map_aidrequests.js
 * A robust, simplified version for initializing the map and its layers.
 */

    // A global 'map' variable
    let map;

    // Handle Map Modal events to resize map and maintain state
    // document.addEventListener('DOMContentLoaded', function() {
    //    // Moved logic inside initializeAidRequestMap to access map scope
    // });

    // Expose the initialize function globally so the main list script can call it
    window.initializeAidRequestMap = function(requests, initialFilterState) {
        // SCRIPT_DEBUG is controlled here or via config
        let SCRIPT_DEBUG = false;
        // Make sure it's available globally for the modal handlers
        window.SCRIPT_DEBUG = SCRIPT_DEBUG;

        let mapRequestsConfig = {};
        let successfullyCreatedIcons = [];
        let aidRequestLayer;
        let aidRequestSource;
        let currentLayerFilterState = null; // Store the current filter state

        // Handle Map Modal Logic
        const mapModal = document.getElementById('mapModal');
        const mapContainer = document.getElementById('aid-request-map-container');
        const mapModalContainer = document.getElementById('aid-request-map-modal-container');

        if (mapModal && mapContainer && mapModalContainer) {
            const originalParent = mapContainer.parentElement;

            mapModal.addEventListener('shown.bs.modal', () => {
                if (SCRIPT_DEBUG) console.log('[Map] Moving map to modal...');

                // Initialize jQuery UI Draggable on the modal DIALOG (the wrapper)
                // and Resizable on the modal CONTENT
                if (typeof $ !== 'undefined' && $.ui) {
                    const $dialog = $(mapModal).find('.modal-dialog');
                    const $content = $(mapModal).find('.modal-content');

                    if (!$dialog.data('ui-draggable')) {
                        $dialog.draggable({
                            handle: ".modal-header",
                            // Remove strict window containment to allow moving partly off-screen if needed
                            // containment: "window",
                            scroll: false
                        });
                    }

                    if (!$content.data('ui-resizable')) {
                        $content.resizable({
                            minHeight: 300,
                            minWidth: 300,
                            handles: "n, e, s, w, ne, se, sw, nw", // All directions
                            resize: function(event, ui) {
                                // During resize, resize map to follow
                                if (map) map.resize();
                            },
                            stop: function(event, ui) {
                                // Final resize and center
                                if (map) {
                                    map.resize();
                                    // recenterMap(); // Optional: keep center vs fit bounds
                                }
                            }
                        });
                    }
                }

                mapModalContainer.appendChild(mapContainer);

                // Ensure map container fills the modal container
                mapContainer.style.height = '100%';
                mapContainer.style.width = '100%';

                // Small timeout to allow flex layout to settle
                setTimeout(() => {
                    if (map) {
                        map.resize();
                        recenterMap();
                    }
                }, 100);
            });

            mapModal.addEventListener('hidden.bs.modal', () => {
                if (SCRIPT_DEBUG) console.log('[Map] Moving map back to card...');
                originalParent.appendChild(mapContainer);

                // Reset map container styles for the card
                mapContainer.style.height = '';
                mapContainer.style.width = '';

                // Reset modal content dimensions to default for next open
                if (typeof $ !== 'undefined') {
                    $(mapModal).find('.modal-content').css({ width: '', height: '90vh' });
                }

                if (map) {
                    map.resize();
                    // Optional: recenter for small view, or keep user's view?
                    // Keeping user's view is usually less jarring, but we can ensure bounds if needed.
                    // recenterMap();
                }
            });
        }

        function recenterMap() {
            if (!map || !aidRequestSource) return;

            const shapes = aidRequestSource.getShapes();
            let bounds = null;

            // 1. Get bounds of all visible aid requests
            // Note: getShapes() returns all shapes. We should probably respect the filter?
            // However, usually "Zoom to fit" includes all potential points or just filtered ones.
            // Let's stick to ALL shapes for context, or we can filter manually.
            // The request said "ensure all Shapes are visible".
            if (shapes.length > 0) {
                bounds = atlas.data.BoundingBox.fromData(shapes);
            }

            // 2. Ensure at least 1.5x ring diameter is visible
            if (mapRequestsConfig.field_op && mapRequestsConfig.field_op.ring_size) {
                const ringSizeMiles = mapRequestsConfig.field_op.ring_size;
                const lat = mapRequestsConfig.field_op.latitude;
                const lon = mapRequestsConfig.field_op.longitude;

                // 1.5x Ring Diameter = 3x Radius
                const targetRadiusMiles = ringSizeMiles * 1.5;

                // Approximate bounding box for this radius (simple spherical approx)
                // 1 deg lat ~= 69 miles
                // 1 deg lon ~= 69 * cos(lat) miles
                const latDelta = targetRadiusMiles / 69.0;
                const lonDelta = targetRadiusMiles / (69.0 * Math.cos(lat * Math.PI / 180));

                const ringBounds = [
                    lon - lonDelta,
                    lat - latDelta,
                    lon + lonDelta,
                    lat + latDelta
                ];

                if (bounds) {
                    bounds = atlas.data.BoundingBox.merge(bounds, ringBounds);
                } else {
                    bounds = ringBounds;
                }
            }

            if (bounds) {
                // 3. Apply 10% margins
                // map.setCamera padding is in pixels. We need map dimensions.
                const canvas = map.getCanvas();
                const h = canvas.height;
                const w = canvas.width;

                const padding = {
                    top: h * 0.1,
                    bottom: h * 0.1,
                    left: w * 0.1,
                    right: w * 0.1
                };

                if (SCRIPT_DEBUG) console.log('[Map] Resetting camera with bounds:', bounds, 'and padding:', padding);
                map.setCamera({
                    bounds: bounds,
                    padding: padding
                });
            }
        }


    const configEl = document.getElementById('aid-requests-config-json');
    if (configEl) {
        try {
            // Load config from backend
            const backendConfig = JSON.parse(configEl.textContent);
            Object.assign(mapRequestsConfig, backendConfig);
            if (typeof backendConfig.debug !== 'undefined') {
                SCRIPT_DEBUG = backendConfig.debug;
            }
        } catch (e) {
            console.error('[Map] Failed to parse config JSON.', e);
        }
    }

    const mapContainerEl = document.getElementById('aid-request-map-container');
    if (!mapContainerEl) {
        console.error('[Map] Map container not found during initialization.');
        return;
    }

    const subscriptionKey = mapContainerEl.dataset.mapsSubscriptionKey;
    const initialBoundsString = mapContainerEl.dataset.initialBounds;
    let initialBounds = null;
    if (initialBoundsString) {
        try {
            initialBounds = JSON.parse(initialBoundsString);
        } catch (e) {
            console.error('[Map] Error parsing initial bounds:', e);
        }
    }

    if (SCRIPT_DEBUG) console.log('[Map] Initializing...');

    // Initialize the map
    map = new atlas.Map(mapContainerEl, {
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: subscriptionKey
        },
        style: 'road',
        zoom: 3,
        center: [-98.5795, 39.8283] // Default center of US
    });

    // Wait until the map resources are ready.
    map.events.add('ready', async () => {
        if (SCRIPT_DEBUG) console.log('[Map] Map is ready.');

        if (initialBounds) {
            map.setCamera({ bounds: initialBounds, padding: 50 });
        }

        // Add all controls in one consolidated block.
        map.controls.add([
            new atlas.control.ZoomControl(),
            new atlas.control.PitchControl(),
            new atlas.control.CompassControl(),
            new atlas.control.StyleControl({
                mapStyles: ['road', 'satellite_road_labels', 'grayscale_dark']
            })
        ], { position: 'top-left' });
        map.controls.add(new atlas.control.ScaleControl(), { position: 'bottom-left' });

        // Create a custom icon for the field op using a VALID built-in template name
        await map.imageSprite.createFromTemplate('field-op-star', 'marker', 'royalblue', '#fff');

        const aidTypesConfig = JSON.parse(document.getElementById('aid-types-json').textContent);
        await createCustomIcons(aidTypesConfig);

        initializeFieldOpLayer(mapRequestsConfig.field_op);
        initializeAidRequestLayer(requests, aidTypesConfig);

        // Apply initial filter - ensure it's not null/empty if passed
        if (initialFilterState) {
             if (SCRIPT_DEBUG) console.log('[Map] Applying initial filter:', initialFilterState);
             updateMapLayer(initialFilterState);
        }
        setupPopupLogic(requests, aidTypesConfig);

        if (SCRIPT_DEBUG) console.log('[Map] All layers initialized.');

        document.body.addEventListener('filterStateChange', (e) => {
            if (SCRIPT_DEBUG) console.log('[Map] Filter change received.', e.detail);
            updateMapLayer(e.detail);
        });

        document.body.addEventListener('mapShouldUpdateFilter', (e) => {
            if (SCRIPT_DEBUG) console.log('[Map] Should update filter.', e.detail);
            updateMapLayer(e.detail);
        });

        // Listen for updates from the list view (e.g., status/priority changes)
        document.body.addEventListener('aidRequestUpdated', function (e) {
            try {
                const updatedRequest = e.detail.request;
                if (SCRIPT_DEBUG) console.log('[Map] aidRequestUpdated event received:', updatedRequest);

                if (!updatedRequest || !updatedRequest.id) return;

                if (!aidRequestSource) return;

                const shapeToUpdate = aidRequestSource.getShapeById(updatedRequest.id);

                // For the list map, we assume a single location per request as 'location'.
                const location = updatedRequest.location;

                if (shapeToUpdate) {
                    if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
                        // Location exists, update it.
                        shapeToUpdate.setCoordinates([location.longitude, location.latitude]);
                        const props = shapeToUpdate.getProperties();

                        if (SCRIPT_DEBUG) console.log('[Map] Updating shape properties. Old:', props);

                        props.status = updatedRequest.status;
                        props.priority = updatedRequest.priority || 'none';

                        // Ensure aid_type is preserved if not present in update, or updated if it is
                        if (updatedRequest.aid_type && updatedRequest.aid_type.slug) {
                             props.aid_type = updatedRequest.aid_type.slug;
                        }

                        shapeToUpdate.setProperties(props);
                        if (SCRIPT_DEBUG) console.log(`[Map] Updated shape for request #${updatedRequest.id}. New props:`, props);
                    } else {
                        // No valid location left, remove the point from the map.
                        aidRequestSource.remove(shapeToUpdate);
                        if (SCRIPT_DEBUG) console.log(`[Map] Removed shape for request #${updatedRequest.id} (no valid location)`);
                    }

                    // RE-APPLY FILTER TO UPDATE VISIBILITY
                    if (currentLayerFilterState) {
                        if (SCRIPT_DEBUG) console.log('[Map] Re-applying filter after update:', currentLayerFilterState);
                        updateMapLayer(currentLayerFilterState);
                    } else {
                        if (SCRIPT_DEBUG) console.warn('[Map] No current filter state to re-apply!');
                    }
                } else {
                     if (SCRIPT_DEBUG) console.warn(`[Map] Shape not found for request #${updatedRequest.id}`);
                }

                // If the updated request matches the currently open popup, refresh or close it.
                if (window.aidRequestPopup && window.aidRequestPopup.isOpen() && window.currentPopupRequestId === updatedRequest.id) {
                    if (location) {
                        // We need to find the full request object in our main `requests` array to pass to createPopupContent
                        const fullRequestData = requests.find(r => r.id === updatedRequest.id);
                        if(fullRequestData) {
                            // First, update the local data store
                            const index = requests.findIndex(r => r.id === updatedRequest.id);
                            if (index !== -1) {
                                requests[index] = updatedRequest;
                            }
                             const newHtmlContent = createPopupContent(updatedRequest);
                             window.aidRequestPopup.setOptions({
                                 content: newHtmlContent,
                                 position: [location.longitude, location.latitude]
                             });
                        }
                    } else {
                         window.aidRequestPopup.close();
                    }
                }

            } catch (error) {
                console.error('[Map] Error processing aidRequestUpdated:', error);
            }
        });
    });

    // Add a global error listener for the map
    map.events.add('error', (e) => {
        console.error('[Map] CRITICAL MAP ERROR:', e.error);
    });


    // Listen for events from the list view to control the popup
    document.body.addEventListener('showPopupForRequest', (e) => {
        openPopupForRequestId(e.detail.requestId);
    });

    document.body.addEventListener('closePopupOnMap', (e) => {
        if (window.aidRequestPopup && window.aidRequestPopup.isOpen()) {
            window.aidRequestPopup.close();
        }
    });


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
            const currentProps = pointToUpdate.getProperties();
            currentProps.status = newStatus;
            currentProps.priority = newPriority;
            pointToUpdate.setProperties(currentProps);

            // Re-apply filter
            if (currentLayerFilterState) {
                updateMapLayer(currentLayerFilterState);
            }
        }
    });

    function updateLocationCounts(count) {
        const text = `${count} Locations`;
        const el1 = document.getElementById('map-location-count');
        if (el1) el1.textContent = text;
        const el2 = document.getElementById('map-modal-location-count');
        if (el2) el2.textContent = text;
    }

    function updateMapLayer(filterState) {
        if (!map || !aidRequestLayer) return;

        if (!filterState) {
            aidRequestLayer.setOptions({ filter: null });
            currentLayerFilterState = null;
            return;
        }

        // Store the valid filter state for later re-use (e.g. after point updates)
        currentLayerFilterState = filterState;

        const filters = [];

        if (filterState.status && filterState.status.length > 0) {
            filters.push(['in', ['get', 'status'], ['literal', filterState.status]]);
        }

        if (filterState.priority && filterState.priority !== 'all' && filterState.priority.length > 0) {
            const priorities = filterState.priority.map(p => p === 'none' ? null : p);
            filters.push(['in', ['get', 'priority'], ['literal', priorities]]);
        }

        if (filterState.aid_type && filterState.aid_type !== 'all' && filterState.aid_type.length > 0) {
            filters.push(['in', ['get', 'aid_type'], ['literal', filterState.aid_type]]);
        }

        const combinedFilter = filters.length > 1 ? ['all', ...filters] : filters[0] || null;

        if (SCRIPT_DEBUG) console.log('[Map] Applying filter:', JSON.stringify(combinedFilter));

        try {
            aidRequestLayer.setOptions({ filter: combinedFilter });

            // Re-calculate visible points count based on the new filter
            if (aidRequestSource) {
                const allShapes = aidRequestSource.getShapes();
                let visibleCount = 0;
                let popupShouldClose = false;

                allShapes.forEach(shape => {
                    const props = shape.getProperties();
                    // Check Status
                    let statusMatch = true;
                    if (filterState.status && filterState.status.length > 0) {
                        statusMatch = filterState.status.includes(props.status);
                    }
                    // Check Priority
                    let priorityMatch = true;
                    if (filterState.priority && filterState.priority !== 'all') {
                        const p = props.priority || 'none';
                        priorityMatch = filterState.priority.includes(p);
                    }
                    // Check Aid Type
                    let aidTypeMatch = true;
                    if (filterState.aid_type && filterState.aid_type !== 'all') {
                        aidTypeMatch = filterState.aid_type.includes(props.aid_type);
                    }

                    if (statusMatch && priorityMatch && aidTypeMatch) {
                        visibleCount++;
                    } else {
                        // If this shape is now hidden, and it matches the current popup, mark for closing
                        if (window.currentPopupRequestId && props.requestId === window.currentPopupRequestId) {
                            popupShouldClose = true;
                        }
                    }
                });

                updateLocationCounts(visibleCount);

                // Close popup if its associated shape is now filtered out
                if (popupShouldClose && window.aidRequestPopup && window.aidRequestPopup.isOpen()) {
                    if (SCRIPT_DEBUG) console.log(`[Map] Closing popup for ID ${window.currentPopupRequestId} as it is filtered out.`);
                    window.aidRequestPopup.close();
                }
            }

        } catch (e) {
            console.error('[Map] Error applying layer filter:', e);
        }
    }


    function initializeFieldOpLayer(fieldOp) {
        if (!fieldOp || typeof fieldOp.latitude !== 'number' || typeof fieldOp.longitude !== 'number') {
            if (SCRIPT_DEBUG) console.warn('[Map] FieldOp config or location is missing or invalid.');
                return;
            }

        const fieldOpDataSource = new atlas.source.DataSource();
        map.sources.add(fieldOpDataSource);

        const centerPoint = new atlas.data.Point([fieldOp.longitude, fieldOp.latitude]);
        fieldOpDataSource.add(new atlas.data.Feature(centerPoint, {
            name: 'Field Operation Center',
            slug: fieldOp.slug
        }));

        if (fieldOp.ring_size && typeof fieldOp.ring_size === 'number' && fieldOp.ring_size > 0) {
            const radiusInMeters = fieldOp.ring_size * 1609.34; // Convert miles to meters
            const circlePolygon = new atlas.data.Polygon([atlas.math.getRegularPolygonPath(centerPoint.coordinates, radiusInMeters, 64)]);
            fieldOpDataSource.add(new atlas.data.Feature(circlePolygon, {
                name: 'Field Operation Radius'
            }));
        }

        map.layers.add(new atlas.layer.LineLayer(fieldOpDataSource, 'field-op-radius-layer-line', {
            strokeColor: 'rgba(220, 53, 69, 0.8)',
            strokeWidth: 2,
            filter: ['==', ['geometry-type'], 'Polygon']
        }));

        map.layers.add(new atlas.layer.SymbolLayer(fieldOpDataSource, 'field-op-center-layer', {
                iconOptions: {
                image: 'field-op-star',
                allowOverlap: true,
                ignorePlacement: true,
                anchor: 'center'
                },
                textOptions: {
                textField: [
                    'format',
                    ['get', 'slug'],
                    { 'font-scale': 1.1 }
                ],
                anchor: 'top',
                offset: [0, 0.8],
                    color: '#000000',
                    haloColor: '#FFFFFF',
                    haloWidth: 1,
                font: ['SegoeUi-Bold']
            },
            filter: ['==', ['geometry-type'], 'Point']
        }));
    }

    function initializeAidRequestLayer(requests, aidTypesConfig) {
        const points = [];
        aidRequestSource = new atlas.source.DataSource();
        map.sources.add(aidRequestSource);

        let iconExpression = 'marker-default';
        let scaleExpression = 1.0;

        if (successfullyCreatedIcons.length > 0) {
            iconExpression = ['match', ['get', 'aid_type']];
            const uniqueIconSlugs = [...new Set(successfullyCreatedIcons)];
            uniqueIconSlugs.forEach(slug => {
                iconExpression.push(slug, slug);
            });
            iconExpression.push('marker-default');

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

        requests.forEach(request => {
            try {
                if (request.location && typeof request.location.latitude === 'number' && typeof request.location.longitude === 'number') {
                    const coordinates = [request.location.longitude, request.location.latitude];
                    const feature = new atlas.data.Feature(new atlas.data.Point(coordinates), {
                        requestId: request.id,
                        status: request.status,
                        priority: request.priority,
                        aid_type: request.aid_type.slug,
                        provided_address: request.provided_address,
                        requester_name: request.requester_name
                    });
                    // Set top-level ID for getShapeById()
                    feature.id = request.id;
                    points.push(feature);
                }
            } catch (error) {
                if (SCRIPT_DEBUG) console.error(`[Map] Error processing request #${request.id}:`, error);
            }
        });

        aidRequestSource.add(points);

        // Update the location count badge
        updateLocationCounts(points.length);

        aidRequestLayer = new atlas.layer.SymbolLayer(aidRequestSource, 'aid-request-layer', {
            iconOptions: {
                image: iconExpression,
                size: scaleExpression,
                allowOverlap: true,
                ignorePlacement: true,
                anchor: 'bottom'
            },
            textOptions: {
                textField: ['to-string', ['get', 'requestId']],
                anchor: 'top',
                offset: [0, -0.5],
                color: 'black',
                haloColor: 'white',
                haloWidth: 1,
                size: 12,
                allowOverlap: true,
                ignorePlacement: true,
                font: ['SegoeUi-Bold'],
            }
        });

        map.layers.add(aidRequestLayer);
    }

    function openPopupForRequestId(requestId) {
        const shape = aidRequestSource.getShapeById(requestId);
        if (!shape) return;

        if (window.aidRequestPopup) {
            window.aidRequestPopup.close();
        }
        window.isHoveringPopup = false;

        const properties = shape.getProperties();
        const requestData = requests.find(r => r.id === properties.requestId);

        if (requestData) {
            const htmlContent = createPopupContent(requestData);

            window.currentPopupRequestId = requestData.id;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            const contentElement = tempDiv.firstElementChild;

            window.aidRequestPopup.setOptions({
                content: contentElement,
                position: shape.getCoordinates(),
                pixelOffset: [0, -25]
            });

            map.events.add('open', window.aidRequestPopup, () => {
                const popupWrapper = contentElement.parentElement?.parentElement;
                if (popupWrapper && popupWrapper.classList.contains('atlas-popup-anchor-top')) {
                    window.aidRequestPopup.setOptions({ pixelOffset: [0, 35] });
                }
            }, { once: true });

            window.aidRequestPopup.open(map);

            // Dispatch event to notify the list view that a popup was opened.
            document.body.dispatchEvent(new CustomEvent('popupOpenedOnMap', {
                detail: { requestId: requestData.id }
            }));
        }
        }

        async function createCustomIcons(aidTypesConfig) {
            const iconPromises = aidTypesConfig.map(async (aidType) => {
                const iconName = aidType.slug;
            const templateName = aidType.icon_name || 'marker-circle';
            const color = aidType.icon_color || '#1A82A9';

            try {
                if (!map.imageSprite.hasImage(iconName)) {
                    const safeColor = color || '#1A82A9';
                    await map.imageSprite.createFromTemplate(iconName, templateName, safeColor, '#FFFFFF');
                }
                successfullyCreatedIcons.push(iconName);
            } catch (error) {
                if (SCRIPT_DEBUG) console.warn(`[Map] Failed to create icon '${iconName}'.`, error);
            }
        });

        await Promise.all(iconPromises);
    }

    function setupPopupLogic(requests, aidTypesConfig) {
        // Hoist popup-related variables to the window scope to ensure they are accessible
        // across different function calls and event listeners, especially after updates.
        window.aidRequestPopup = null;
        window.isHoveringPopup = false;
        window.currentPopupRequestId = null;

        // Initialize the popup with a closer offset and a white background.
        window.aidRequestPopup = new atlas.Popup({
            pixelOffset: [0, -25],
            closeButton: true,
            fillColor: 'rgba(255, 255, 255, 0.95)', // Reverted to white, kept high opacity
            className: 'popup-with-enhanced-pointer'
        });

        // Listen for the popup's own close event to reset the tracking ID.
        map.events.add('close', window.aidRequestPopup, () => {
            const closedId = window.currentPopupRequestId;
            if (closedId) {
                if (SCRIPT_DEBUG) console.log(`[Map] Popup close event fired for ID ${closedId}. Resetting current ID.`);
                window.currentPopupRequestId = null;
                document.body.dispatchEvent(new CustomEvent('popupClosedOnMap', { detail: { requestId: closedId } }));
            } else {
                 // This happens if the popup was closed programmatically when no request ID was active
                 // or if it was closed before an ID was assigned.
                 if (SCRIPT_DEBUG) console.log('[Map] Popup closed (no active Request ID).');
            }
        });

            const aidTypesMap = aidTypesConfig.reduce((acc, aidType) => {
                acc[aidType.slug] = aidType;
                return acc;
            }, {});

        function getAddressForPopup(prop) {
            const address = prop.provided_address || 'Address not available';
            if (address.includes(', ')) {
                const parts = address.split(', ');
                if (parts.length > 1) {
                    return parts.slice(0, -1).join(', ');
                }
            }
            return address;
        }

        // Add a click event to the layer to show a popup.
        map.events.add('click', aidRequestLayer, function (e) {
            if (SCRIPT_DEBUG) console.log('[Map] Map click event registered.');

            if (e.shapes && e.shapes.length > 0) {
                const shapeId = e.shapes[0].id;
                openPopupForRequestId(shapeId);

                // Highlight the row in the list, similar to the view-on-map button
                document.body.dispatchEvent(new CustomEvent('popupOpenedOnMap', {
                    detail: { requestId: shapeId }
                }));
            }
        });

        // Keep this simple: only change the cursor on hover to indicate clickability.
        map.events.add('mouseenter', aidRequestLayer, function () {
            map.getCanvasContainer().style.cursor = 'pointer';
        });

        map.events.add('mouseleave', aidRequestLayer, function () {
            map.getCanvasContainer().style.cursor = 'grab';
            // Popup is no longer closed from here to prevent aggressive closing.
            // It is now closed by its own mouseleave event or a click on the map.
        });

        // Add a click event to the map itself to close the popup when clicking anywhere other than an aid request marker.
        map.events.add('click', function(e) {
            let clickedOnAidRequestMarker = false;
            if (e.shapes && e.shapes.length > 0) {
                // Defensively check for properties on the clicked shapes, which can be of different types.
                for (const shape of e.shapes) {
                    let props;
                    if (typeof shape.getProperties === 'function') {
                        props = shape.getProperties(); // It's an atlas.Shape
                    } else if (shape.properties) {
                        props = shape.properties; // It's a raw GeoJSON feature
                    }

                    if (props && props.requestId) {
                        clickedOnAidRequestMarker = true;
                        break;
                    }
                }
            }

            // If the click was not on an aid request marker, and the popup is open, close it.
            if (!clickedOnAidRequestMarker && window.aidRequestPopup && window.aidRequestPopup.isOpen()) {
                if (SCRIPT_DEBUG) console.log('[Map] Click outside a marker detected, closing popup.');
                window.aidRequestPopup.close();
            }
        });

        document.body.addEventListener('click', function(event) {
            // Use .closest() to ensure the listener works even if the icon inside the button is clicked
            const copyBtn = event.target.closest('.copy-btn');
            if (copyBtn) {
                const textToCopy = copyBtn.dataset.copyText;
                if (textToCopy) {
                    if (SCRIPT_DEBUG) console.log('[Map] Copy button clicked. Text to copy:', textToCopy);
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        const originalContent = copyBtn.innerHTML;
                        copyBtn.innerHTML = 'Copied!';
                        copyBtn.disabled = true;
                                setTimeout(() => {
                            copyBtn.innerHTML = originalContent;
                            copyBtn.disabled = false;
                                }, 2000);
                            }).catch(err => {
                        console.error('Failed to copy text: ', err);
                            });
                        }
            }
        });
    }

    function createPopupContent(request) {
        if (!request) return '';

        const priorityDisplay = request.priority_display || 'None';
        const statusDisplay = request.status_display || 'Unknown';
        const providedAddress = request.provided_address || 'Not provided';
        const geocodedAddress = request.location?.free_form_address || 'Not geocoded';
        const coordinates = `${request.location.latitude},${request.location.longitude}`;
        const groupSize = request.group_size || 'Unknown';
        const textToCopy = getPopupTextForCopy(request);

        return `
            <div style="min-width: 260px; font-size: 0.85rem;" class="map-popup-content p-1">
                <div class="d-flex justify-content-start align-items-center border-bottom pb-2 mb-2">
                    <div>
                        <h6 class="mb-0 text-primary">Aid Request #${request.id}</h6>
                        <small class="text-muted">${request.aid_type.name}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-secondary copy-btn ms-2" data-copy-text="${textToCopy}" title="Copy All Details">
                        <i class="bi bi-clipboard-plus"></i>
                    </button>
                </div>

                <div class="container-fluid">
                    <div class="row">
                        <div class="col-6">
                            <div class="mb-1">
                                <small class="text-muted">Requester</small>
                                <div class="fw-bold">${request.requester_name || 'N/A'}</div>
                            </div>
                            <div class="mt-2">
                                <small class="text-muted">Status</small>
                                <div class="fw-bold">${statusDisplay}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="mb-1">
                                <small class="text-muted">Group Size</small>
                                <div class="fw-bold">${groupSize}</div>
                            </div>
                            <div class="mt-2">
                                <small class="text-muted">Priority</small>
                                <div class="fw-bold">${priorityDisplay}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <hr class="my-1">

                <div class="mb-1">
                    <strong>Provided:</strong>
                    <div class="ps-2 text-muted">${providedAddress}</div>
                </div>
                <div class="mb-2">
                    <strong>Geocoded:</strong>
                    <div class="ps-2 text-muted">${geocodedAddress}</div>
                </div>
                <div class="d-flex align-items-center">
                    <strong class="me-2">Coords:</strong>
                    <div class="d-inline-flex align-items-center border rounded bg-light px-1">
                        <span class="font-monospace text-nowrap">${coordinates}</span>
                        <button class="btn btn-link text-secondary btn-sm py-0 ps-1 border-0 copy-btn"
                                type="button"
                                data-copy-text="${coordinates}"
                                title="Copy Coordinates">
                            <i class="bi bi-clipboard"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function getPopupTextForCopy(request) {
        if (!request) return '';

        const priorityDisplay = request.priority_display || 'None';
        const statusDisplay = request.status_display || 'Unknown';
        const providedAddress = request.provided_address || 'Not provided';
        const geocodedAddress = request.location?.free_form_address || 'Not geocoded';
        const coordinates = `${request.location.latitude},${request.location.longitude}`;
        const groupSize = request.group_size || 'Unknown';

        return `Aid Request #${request.id}
Aid Type: ${request.aid_type.name}
Requester: ${request.requester_name || 'N/A'}
Status: ${statusDisplay}
Priority: ${priorityDisplay}
Group Size: ${groupSize}
Provided Address: ${providedAddress}
Geocoded Address: ${geocodedAddress}
Coordinates: ${coordinates}`;
    }
}
