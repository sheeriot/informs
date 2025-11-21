/**
 * map_aidrequests.js
 * A robust, simplified version for initializing the map and its layers.
 */

// A global 'map' variable
let map;

// Expose the initialize function globally so the main list script can call it
window.initializeAidRequestMap = function(requests) {
    let mapRequestsConfig = { debug: false };
    let successfullyCreatedIcons = [];
    let aidRequestLayer;
    let aidRequestSource;

    const configEl = document.getElementById('aid-requests-config-json');
    if (configEl) {
        try {
            // Merge the parsed config into our default config object
            Object.assign(mapRequestsConfig, JSON.parse(configEl.textContent));
        } catch (e) {
            console.error('[Map] Failed to parse config JSON.', e);
        }
    } else {
        console.error('[Map] Config JSON element not found.');
    }
     if (mapRequestsConfig.debug) console.log('[Map] Initializing...');

    const mapContainer = document.getElementById('aid-request-map-container');
    if (!mapContainer) {
        console.error('[Map] Map container not found during initialization.');
        return;
    }

    const subscriptionKey = mapContainer.dataset.mapsSubscriptionKey;
    if (mapRequestsConfig.debug) {
        console.log('[Map] Subscription Key:', subscriptionKey ? 'Found' : 'NOT FOUND');
    }

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
    map = new atlas.Map(mapContainer, {
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
        if (mapRequestsConfig.debug) console.log('[Map] Map is ready. Proceeding with layer setup.');

        if (initialBounds) {
            if (mapRequestsConfig.debug) console.log('[Map] Setting camera to initial bounds:', initialBounds);
            map.setCamera({ bounds: initialBounds, padding: 50 });
        } else if (mapRequestsConfig.debug) {
            console.warn('[Map] No initial bounds to set camera.');
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
        if (mapRequestsConfig.debug) console.log('[Map] Custom FieldOp icon created.');

        const aidTypesConfig = JSON.parse(document.getElementById('aid-types-json').textContent);
        if (mapRequestsConfig.debug) console.log('[Map] aidTypesConfig for icon creation:', aidTypesConfig);
        await createCustomIcons(aidTypesConfig);

        initializeFieldOpLayer(mapRequestsConfig.field_op);

        if (mapRequestsConfig.debug) {
            console.log('[Map] Checking integrity of aid request data before initializing layer...');
            console.table(requests);
        }
        initializeAidRequestLayer(requests, aidTypesConfig);

        setupPopupLogic(requests, aidTypesConfig);

        if (mapRequestsConfig.debug) console.log('[Map] All layers initialized.');

        document.body.addEventListener('filterStateChange', (e) => {
            if (mapRequestsConfig.debug) console.log('[Map] Received filterStateChange event. Updating map layer.', e.detail);
            updateMapLayer(e.detail);
        });

        document.body.addEventListener('mapShouldUpdateFilter', (e) => {
            if (mapRequestsConfig.debug) console.log('[Map] Received mapShouldUpdateFilter event. Updating map layer.', e.detail);
            updateMapLayer(e.detail);
        });

        // Listen for updates from the list view (e.g., status/priority changes)
        document.body.addEventListener('aidRequestUpdated', function (e) {
            try {
                // if (mapRequestsConfig.debug) console.log('[Map] Received aidRequestUpdated event. Updating data store and point on map.', e.detail);

                const updatedRequest = e.detail.request;

                if (!updatedRequest || !updatedRequest.id) {
                    console.error('[Map] Invalid data received in aidRequestUpdated event.', e.detail);
                    return;
                }

                const index = requests.findIndex(r => r.id === updatedRequest.id);
                if (index !== -1) {
                    requests[index] = updatedRequest;
                    // if (mapRequestsConfig.debug) {
                    //     console.log(`[Map] Updated request #${updatedRequest.id} in local map data store.`);
                    // }
                }

                if (aidRequestSource) {
                    const shape = aidRequestSource.getShapeById(updatedRequest.id);
                    if (shape) {
                        // if (mapRequestsConfig.debug) {
                        //     // Use a simple shallow copy for logging to avoid JSON errors with complex objects
                        //     console.log(`[Map] Found shape for request #${updatedRequest.id}. Old properties:`, { ...shape.getProperties() });
                        // }

                        // Use the official get/set methods to safely update properties
                        const props = shape.getProperties();
                        props.status = updatedRequest.status;
                        props.priority = updatedRequest.priority || 'none';
                        shape.setProperties(props);

                        // if (mapRequestsConfig.debug) {
                        //     console.log(`[Map] New properties for shape #${updatedRequest.id}:`, { ...shape.getProperties() });
                        // }

                        // If the updated request matches the currently open popup, refresh the popup content.
                        if (window.aidRequestPopup && window.aidRequestPopup.isOpen() && window.currentPopupRequestId === updatedRequest.id) {
                            if (mapRequestsConfig.debug) console.log('[Map] Refreshing open popup with updated data.');

                            const newHtmlContent = createPopupContent(updatedRequest);
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = newHtmlContent;
                            const newContentElement = tempDiv.firstElementChild;

                            newContentElement.addEventListener('mouseenter', () => {
                                window.isHoveringPopup = true;
                            });
                            newContentElement.addEventListener('mouseleave', () => {
                                window.isHoveringPopup = false;
                                if (window.aidRequestPopup) window.aidRequestPopup.close();
                            });

                            window.aidRequestPopup.setOptions({
                                content: newContentElement,
                                pixelOffset: [0, -30] // Set default for 'above'
                            });

                            // Adjust offset after open, based on placement.
                            // The 'open' event fires after the popup is placed, allowing us to inspect its final position.
                            map.events.add('open', window.aidRequestPopup, () => {
                                // We get the popup's wrapper element by traversing from the content element we created.
                                const popupWrapper = newContentElement.parentElement?.parentElement;
                                if (popupWrapper && popupWrapper.classList.contains('atlas-popup-anchor-top')) {
                                    // If the popup is anchored from the top (i.e., it's below the marker), use a positive offset.
                                    window.aidRequestPopup.setOptions({ pixelOffset: [0, 25] });
                                }
                            }, { once: true });
                        }
                    } else if (mapRequestsConfig.debug) {
                        console.warn(`[Map] Could not find a shape with ID ${updatedRequest.id} in the data source to update.`);
                    }
                }
            } catch (error) {
                console.error('[Map] Error processing aidRequestUpdated event:', error, e.detail);
            }
        });
    });

    // Add a global error listener for the map
    map.events.add('error', (e) => {
        console.error('[Map] CRITICAL MAP ERROR:', e.error);
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
            // if (mapRequestsConfig.debug) console.log(`[Map] Updating point #${requestId} with status: ${newStatus}, priority: ${newPriority}`);
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

        if (!filterState) {
            // if (mapRequestsConfig.debug) console.log('[Map] No filter state provided. Clearing layer filter.');
            aidRequestLayer.setOptions({ filter: null });
            return;
        }

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

        // if (mapRequestsConfig.debug) console.log('[Map] Constructed layer filter:', JSON.stringify(combinedFilter));

        try {
            aidRequestLayer.setOptions({ filter: combinedFilter });
            // if (mapRequestsConfig.debug) console.log('[Map] Layer filter applied successfully.');
        } catch (e) {
            console.error('[Map] Error applying layer filter:', e);
        }
    }


    function initializeFieldOpLayer(fieldOp) {
        if (mapRequestsConfig.debug) {
            console.log('[Map] Initializing FieldOp Layer.');
            // console.log('[Map] FieldOp Config:', fieldOp);
        }

        if (!fieldOp || typeof fieldOp.latitude !== 'number' || typeof fieldOp.longitude !== 'number') {
            if (mapRequestsConfig.debug) console.warn('[Map] FieldOp config or location is missing or invalid.');
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
        } else if (mapRequestsConfig.debug) {
            console.warn('[Map] FieldOp radius is missing or invalid. Skipping circle.', fieldOp.ring_size);
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

        // if (mapRequestsConfig.debug) console.log('[Map] FieldOp layer initialized.');
    }

    function initializeAidRequestLayer(requests, aidTypesConfig) {
        // console.log('%c[Map] Initializing Aid Request Layer', 'color: green; font-weight: bold;');

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

        // if (mapRequestsConfig.debug) {
        //     console.log("Icon expression:", JSON.stringify(iconExpression));
        //     console.log("Scale expression:", JSON.stringify(scaleExpression));
        // }

        requests.forEach(request => {
            try {
                if (request.location && typeof request.location.latitude === 'number' && typeof request.location.longitude === 'number') {
                    const coordinates = [request.location.longitude, request.location.latitude];
                    const feature = new atlas.data.Feature(new atlas.data.Point(coordinates), {
                        requestId: request.id,
                        status: request.status,
                        priority: request.priority,
                        aid_type: request.aid_type.slug,
                        full_address: request.full_address,
                        requester_name: request.requester_name
                    });
                    // This is the critical fix: Set the top-level ID on the feature itself
                    // so that getShapeById() can find it.
                    feature.id = request.id;
                    points.push(feature);
                } else if (mapRequestsConfig.debug) {
                    console.warn(`[Map] Skipping request #${request.id} due to missing or invalid location data.`, { location: request.location });
                }
            } catch (error) {
                if (mapRequestsConfig.debug) {
                    console.error(`[Map] Failed to process aid request #${request.id} for map point.`, { error: error, request: request });
                }
            }
        });

        // if (mapRequestsConfig.debug) {
        //     console.log(`Preparing to add ${points.length} points to the data source.`);
        //     console.table(points.map(p => p.properties));
        // }

        aidRequestSource.add(points);

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
                font: ['SegoeUi-Bold'],
            }
        });

        map.layers.add(aidRequestLayer);

        // if (mapRequestsConfig.debug) console.log(`[Map] Aid Request layer added.`);
    }

    async function createCustomIcons(aidTypesConfig) {
        // if (mapRequestsConfig.debug) {
        //     console.log('%c[Map] Starting createCustomIcons function...', 'color: blue; font-weight: bold;');
        //     console.log('[Map] Received aidTypesConfig to create icons:');
        //     console.table(aidTypesConfig);
        // }

        const iconPromises = aidTypesConfig.map(async (aidType) => {
            const iconName = aidType.slug;
            const templateName = aidType.icon_name || 'marker-circle';
            const color = aidType.icon_color || '#1A82A9';

            try {
                // Check if the image already exists before trying to create it
                if (!map.imageSprite.hasImage(iconName)) {
                    // if (mapRequestsConfig.debug) {
                    //     console.log(`[Map] Creating icon: name='${iconName}', template='${templateName}', color='${color}'`);
                    // }
                    await map.imageSprite.createFromTemplate(iconName, templateName, color, '#FFFFFF');
                    // if (mapRequestsConfig.debug) console.log(`[Map] Custom icon '${iconName}' created from template '${templateName}'.`);
                } else if (mapRequestsConfig.debug) {
                    console.log(`[Map] Icon '${iconName}' already exists. Skipping creation.`);
                }
                successfullyCreatedIcons.push(iconName);
            } catch (error) {
                if (mapRequestsConfig.debug) {
                    console.warn(`[Map] Failed to create icon '${iconName}' from template '${templateName}'. A default icon will be used. Error:`, error);
                }
            }
        });

        await Promise.all(iconPromises);

        // if (mapRequestsConfig.debug) {
        //     console.log(`%c[Map] Finished createCustomIcons. ${successfullyCreatedIcons.length} of ${aidTypesConfig.length} icons created.`, 'color: blue; font-weight: bold;');
        //     console.log('[Map] Successfully created icons:', successfullyCreatedIcons);
        // }
    }

    function setupPopupLogic(requests, aidTypesConfig) {
        // Hoist popup-related variables to the window scope to ensure they are accessible
        // across different function calls and event listeners, especially after updates.
        window.aidRequestPopup = null;
        window.isHoveringPopup = false;
        window.currentPopupRequestId = null;

        // Initialize the popup within this scope, now that the variable is hoisted.
        window.aidRequestPopup = new atlas.Popup({
            pixelOffset: [0, -30],
            closeButton: false,
            fillColor: 'rgba(255,255,255,0.95)'
        });

        // Listen for the popup's own close event to reset the tracking ID.
        map.events.add('close', window.aidRequestPopup, () => {
            // if (mapRequestsConfig.debug) console.log('[Map] Popup close event fired. Resetting current ID.');
            window.currentPopupRequestId = null;
        });

        const aidTypesMap = aidTypesConfig.reduce((acc, aidType) => {
            acc[aidType.slug] = aidType;
            return acc;
        }, {});

        function getAddressForPopup(prop) {
            const address = prop.full_address || 'Address not available';
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
            // if (mapRequestsConfig.debug) console.log('[Map] Map click event registered.');

            if (e.shapes && e.shapes.length > 0) {
                // This is the correct way to get the full shape object.
                // The event gives us a raw feature, so we use its ID to get the rich shape from the source.
                const shapeId = e.shapes[0].id;
                const clickedShape = aidRequestSource.getShapeById(shapeId);

                if (clickedShape) {
                    // if (mapRequestsConfig.debug) console.log('[Map] Clicked shape found, closing existing popup if any.');
                    if (window.aidRequestPopup) {
                        window.aidRequestPopup.close();
                    }
                    window.isHoveringPopup = false; // Reset hover state on new click

                    const properties = clickedShape.getProperties();
                    const requestData = requests.find(r => r.id === properties.requestId);

                    if (requestData) {
                        // if (mapRequestsConfig.debug) console.log('[Map] Creating popup, attaching hover listeners.');
                        const htmlContent = createPopupContent(requestData);

                        // Track the ID of the request being shown in the popup.
                        window.currentPopupRequestId = requestData.id;

                        // Create a DOM element from the HTML string to attach listeners
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = htmlContent;
                        const contentElement = tempDiv.firstElementChild;

                        // Add listeners to the content element to manage hover state
                        contentElement.addEventListener('mouseenter', () => {
                            // if (mapRequestsConfig.debug) console.log('[Map] Mouse entered popup content.');
                            window.isHoveringPopup = true;
                        });
                        contentElement.addEventListener('mouseleave', () => {
                            // if (mapRequestsConfig.debug) console.log('[Map] Mouse left popup content.');
                            window.isHoveringPopup = false;
                            if (window.aidRequestPopup) window.aidRequestPopup.close();
                        });

                        window.aidRequestPopup.setOptions({
                            content: contentElement, // Pass the element with listeners
                            position: clickedShape.getCoordinates(),
                            pixelOffset: [0, -30] // Default to an offset suitable for being above the marker
                        });

                        // Add a one-time listener to adjust the offset after the map has placed the popup.
                        map.events.add('open', window.aidRequestPopup, () => {
                            // We get the popup's wrapper element by traversing from the content element we created.
                            const popupWrapper = contentElement.parentElement?.parentElement;
                            // When the popup is placed below the marker, the SDK adds a class to anchor it from the top.
                            if (popupWrapper && popupWrapper.classList.contains('atlas-popup-anchor-top')) {
                                // It's below the marker, so use a larger positive offset to push it down.
                                window.aidRequestPopup.setOptions({ pixelOffset: [0, 25] });
                            }
                        }, { once: true });


                        window.aidRequestPopup.open(map);
                    }
                }
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
                // if (mapRequestsConfig.debug) console.log('[Map] Click outside a marker detected, closing popup.');
                window.aidRequestPopup.close();
            }
        });

        document.body.addEventListener('click', function(event) {
            // Use .closest() to ensure the listener works even if the icon inside the button is clicked
            const copyBtn = event.target.closest('.copy-btn');
            if (copyBtn) {
                const textToCopy = copyBtn.dataset.copyText;
                if (textToCopy) {
                    // if (mapRequestsConfig.debug) console.log('[Map] Copy button clicked. Text to copy:', textToCopy);
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
        const providedAddress = request.location?.address_display || 'Not provided';
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
        const providedAddress = request.location?.address_display || 'Not provided';
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
