/**
 * map_aidrequests.js
 * A robust, simplified version for initializing the map and its layers.
 */

// A global 'map' variable
let map;

// Global config for this script
const mapRequestsConfig = {
    debug: true, // will be updated by config
    version: '0.0.15',
    fieldOp: { latitude: 0, longitude: 0 },
    aidRequestLocations: []
};


document.addEventListener('DOMContentLoaded', () => {
    try {
        if(mapRequestsConfig.debug) console.log('[Map] Initializing map requests config. Version: ' + mapRequestsConfig.version);
        const mapContainer = document.getElementById('aid-request-map-container') || document.getElementById('field-op-map-container') || document.getElementById('aid-request-map');
        let map;

        // let popup;
        let aidRequestLayer;
        let aidRequestSource;

        if (!mapContainer) {
            console.log('[Map] Map container not found on this page.');
            return;
        }

        const config = {
            key: mapContainer.dataset.azureMapsKey,
            fieldOpSlug: mapContainer.dataset.fieldop,
        };
        mapRequestsConfig.debug = mapContainer.dataset.debug === 'true';

        if (mapRequestsConfig.debug) console.log(`[Map Script] Version ${mapRequestsConfig.version} loaded.`);

        mapRequestsConfig.fieldOp = {
            latitude: parseFloat(mapContainer.dataset.centerLat),
            longitude: parseFloat(mapContainer.dataset.centerLon),
            radius: mapContainer.dataset.ringSize ? [parseFloat(mapContainer.dataset.ringSize), 'mi'] : null,
            slug: mapContainer.dataset.fieldOpSlug
        };
        mapRequestsConfig.aidRequestLocations = JSON.parse(mapContainer.dataset.aidRequestLocations || '[]');

        const initialBounds = [
            parseFloat(mapContainer.dataset.boundsWest),
            parseFloat(mapContainer.dataset.boundsSouth),
            parseFloat(mapContainer.dataset.boundsEast),
            parseFloat(mapContainer.dataset.boundsNorth)
        ];

        map = new atlas.Map(mapContainer.id, {
            authOptions: { authType: 'subscriptionKey', subscriptionKey: config.key },
            style: 'terra',
            showFeedbackLink: false,
            showLogo: false,
            camera: {
                bounds: initialBounds,
                padding: 50
            }
        });

        map.events.add('ready', async () => {
            if (mapRequestsConfig.debug) console.log('[Map] Map is ready.');

            // Add controls to the top-left
            map.controls.add([
                new atlas.control.ZoomControl(),
                new atlas.control.PitchControl(),
                new atlas.control.CompassControl(),
                new atlas.control.StyleControl()
            ], {
                position: 'top-left'
            });

            // Add scale control to the bottom-left
            map.controls.add(new atlas.control.ScaleControl(), {
                position: 'bottom-left'
            });

            // 1. Create all custom icons for aid types FIRST.
            const aidTypesConfig = JSON.parse(document.getElementById('aid-types-json').textContent);
            try {
                await createCustomIcons(aidTypesConfig);
                if (mapRequestsConfig.debug) console.log('[Map] Custom icons created.');
            } catch (error) {
                console.error('[Map] Error creating custom icons:', error);
                return; // Stop if icons fail
            }

            // 2. Now that icons are ready, initialize all layers.
            initializeLayers(config, aidTypesConfig);

            // This flag is critical to prevent race conditions
            mapRequestsConfig.isReady = true;

            // All layers are now initialized. Signal that the map component is ready.
            if (mapRequestsConfig.debug) console.log('[Map] All layers initialized. Waiting for filter event to set visibility.');
            document.body.dispatchEvent(new CustomEvent('componentReady', { detail: { name: 'map' } }));
        });

        map.events.add('error', (e) => {
            console.error('[Map] CRITICAL MAP ERROR:', e.error);
        });


        function initializeLayers(config, aidTypesConfig) {
            // 1. Add Field Op layer
            initializeFieldOpLayer(config);

            // 2. Add Aid Requests layer
            initializeAidRequestLayer(config, aidTypesConfig);
        }

        function initializeFieldOpLayer(config) {
            if (mapRequestsConfig.debug) console.log('[Map] Initializing FieldOp Layer.');
            const fieldOpConfig = mapRequestsConfig.fieldOp;
            if (mapRequestsConfig.debug) console.log('[Map] FieldOp Config:', JSON.stringify(fieldOpConfig, null, 2));

            if (!fieldOpConfig || !fieldOpConfig.latitude || !fieldOpConfig.longitude) {
                if (mapRequestsConfig.debug) console.warn('[Map] FieldOp config or location is missing.');
                return;
            }

            const fieldOpPosition = new atlas.data.Position(fieldOpConfig.longitude, fieldOpConfig.latitude);

            const fieldOpSource = new atlas.source.DataSource('field-op-source');
            map.sources.add(fieldOpSource);
            fieldOpSource.add(new atlas.data.Feature(new atlas.data.Point(fieldOpPosition), { slug: fieldOpConfig.slug }));

            const fieldOpLayer = new atlas.layer.SymbolLayer(fieldOpSource, 'field-op-layer', {
                iconOptions: {
                    image: 'pin-blue',
                    size: 1
                },
                textOptions: {
                    textField: ['get', 'slug'],
                    offset: [0, 1.2], // Position label below the pin
                    color: '#000000',
                    haloColor: '#FFFFFF',
                    haloWidth: 1,
                    font: ['StandardFont-Bold']
                }
            });
            map.layers.add(fieldOpLayer);

            // Only create radius circle if radius is defined and is an array
            if (fieldOpConfig.radius && Array.isArray(fieldOpConfig.radius)) {
                if (mapRequestsConfig.debug) console.log('[Map] FieldOp radius is valid. Creating circle.');
                // Create a polygon for the radius
                const radiusInMeters = fieldOpConfig.radius[0] * 1609.34; // Convert miles to meters
                const fieldOpCircle = new atlas.data.Polygon(atlas.math.getRegularPolygonPath(fieldOpPosition, radiusInMeters, 64));

                // Add the circle to the data source
                const fieldOpRadiusSource = new atlas.source.DataSource('field-op-radius-source');
                map.sources.add(fieldOpRadiusSource);
                fieldOpRadiusSource.add(fieldOpCircle);

                // Create a polygon layer to display the radius
                const fieldOpRadiusLayer = new atlas.layer.PolygonLayer(fieldOpRadiusSource, 'field-op-radius-layer', {
                    fillColor: 'rgba(0, 120, 212, 0.2)',
                    strokeColor: 'rgba(0, 120, 212, 0.5)',
                    strokeWidth: 2
                });
                map.layers.add(fieldOpRadiusLayer, 'field-op-layer'); // Add it below the field op marker
            } else {
                if (mapRequestsConfig.debug) console.warn('[Map] FieldOp radius is missing or invalid. Skipping circle.', fieldOpConfig.radius);
            }
        }

        function initializeAidRequestLayer(config, aidTypesConfig) {
            const aidLocationsElement = document.getElementById('aid-locations-data');
            if (!aidLocationsElement?.textContent) {
                if (mapRequestsConfig.debug) console.warn('[Map] No aid locations data found.');
                return;
            }
            const aidLocations = JSON.parse(aidLocationsElement.textContent);
            if (mapRequestsConfig.debug) {
                console.log(`[Map] Found ${aidLocations.length} aid locations to display.`);
                console.table(aidLocations);
            }

            aidRequestSource = new atlas.source.DataSource();
            map.sources.add(aidRequestSource);

            if (mapRequestsConfig.debug) {
                console.log(`[Map] Preparing to add ${aidLocations.length} points to the data source.`);
            }

            // Create a data-driven expression for the icon image.
            const iconExpression = [
                'match',
                ['get', 'aid_type'],
                ...Object.entries(aidTypesConfig).flatMap(([key, { icon_name }]) => [key, icon_name]),
                'marker-blue' // Default icon
            ];

            const scaleExpression = [
                'match',
                ['get', 'aid_type'],
                ...Object.entries(aidTypesConfig).flatMap(([key, { icon_scale }]) => [key, icon_scale]),
                1.0 // Default scale
            ];

            if (mapRequestsConfig.debug) {
                console.log('[Map] Icon expression:', JSON.stringify(iconExpression));
                console.log('[Map] Scale expression:', JSON.stringify(scaleExpression));
            }


            // Add the features to the data source.
            const features = [];
            for (const request of aidLocations) {
                const feature = new atlas.data.Feature(new atlas.data.Point([request.longitude, request.latitude]), {
                    requestId: request.id,
                    status: request.status,
                    priority: request.priority,
                    aid_type: request.aid_type,
                    requester_name: request.requester_full_name
                });

                features.push(feature);
                if (mapRequestsConfig.debug) {
                    console.log(`[Map] Added point with requestId ${request.id} to source with properties:`, feature.properties);
                }
            }
            aidRequestSource.add(features);

            //Create a symbol layer to render the aid request points.
            aidRequestLayer = new atlas.layer.SymbolLayer(aidRequestSource, 'aid-request-layer', {
                iconOptions: {
                    image: iconExpression,
                    allowOverlap: true,
                    ignorePlacement: true,
                    size: scaleExpression,
                    anchor: 'bottom', // Set anchor to the bottom of the icon
                    offset: [0, 0]
                },
                textOptions: {
                    textField: ['get', 'requestId'],
                    offset: [0, 1.2],   // Position label below the pin
                    color: '#000000',
                    size: 12,
                    font: ['StandardFont-Bold'],
                    haloColor: '#FFFFFF',
                    haloWidth: 1
                }
            });
            if (mapRequestsConfig.debug) console.log('[Map] Aid Request layer added.');
            map.layers.add(aidRequestLayer);

            // from ChatGPT to fix flickering popup
            setupPopupLogic(aidTypesConfig);
        }

        async function createCustomIcons(aidTypesConfig) {
            if (mapRequestsConfig.debug) console.log('[Map] Creating custom icons from config:', aidTypesConfig);

            const iconPromises = aidTypesConfig.map(async (aidType) => {
                // Use a default 'marker' if the template name is invalid or missing
                const templateName = aidType.image_sprite || 'marker';
                const iconName = aidType.slug;

                try {
                    const template = document.getElementById(templateName)?.innerHTML;
                    if (!template) {
                        if (mapRequestsConfig.debug) console.warn(`[Map] Icon template '${templateName}' not found for aid type '${iconName}'. Defaulting to a standard marker.`);
                        // No return here, let it fall through to avoid adding a broken icon
                        return;
                    }
                    const icon = template.replace('{color}', aidType.color || '#1A82A9');
                    await map.imageSprite.add(iconName, icon);
                    if (mapRequestsConfig.debug) console.log(`[Map] Custom icon '${iconName}' created.`);
                } catch (error) {
                    if (mapRequestsConfig.debug) console.error(`[Map] Failed to create custom icon for '${iconName}'.`, error);
                }
            });

            await Promise.all(iconPromises);
        }

        function setupPopupLogic(aidTypesConfig) {
            const popup = new atlas.Popup({
                pixelOffset: [0, -20],
                closeButton: true
            });

            // Add a click event listener to the map.
            map.events.add('click', (e) => {
                if (mapRequestsConfig.debug) console.log('[Map] Map click event registered.');

                // Check if the click was on a symbol in the aid-request-layer.
                const features = map.layers.getRenderedShapes(e.position, ['aid-request-layer']);

                if (features.length > 0) {
                    // It's a click on one of our symbols.
                    if (mapRequestsConfig.debug) console.log('[Map] Click was on a feature in aid-request-layer.');

                    const properties = features[0].getProperties();
                    const content = `<div class="p-2"><strong>Aid Request #${properties.requestId}</strong><br/>Status: ${properties.status}<br/>Priority: ${properties.priority}</div>`;

                    popup.setOptions({
                        content: content,
                        position: e.position
                    });

                    popup.open(map);
                } else {
                    if (mapRequestsConfig.debug) console.log('[Map] Click was not on a feature in aid-request-layer.');
                }
            });
        }


        function updateMapPoint(rowElement) {
            if (!aidRequestSource) return;
            const requestId = rowElement.dataset.requestId;
            if (!requestId) return;

            // Find the shape by its custom property, not by its internal ID.
            const shapes = aidRequestSource.getShapes();
            const shapeToUpdate = shapes.find(shape => shape.properties.requestId === requestId);

            if (!shapeToUpdate) {
                if (mapRequestsConfig.debug) console.warn(`[Map] Could not find shape with requestId ${requestId} to update.`);
                return;
            }

            shapeToUpdate.setProperties({
                ...shapeToUpdate.getProperties(),
                status: rowElement.dataset.status,
                priority: rowElement.dataset.priority,
                requester_name: rowElement.cells[1].textContent.trim(), // Update requester name from table
            });

            if (mapRequestsConfig.debug) console.log(`[Map] Updated properties for shape with requestId ${requestId}.`);
        }

        function updateLayerVisibility(filterState) {
            if (!mapRequestsConfig.isReady) {
                if (mapRequestsConfig.debug) console.log('[Map] updateLayerVisibility called, but map is not ready. Aborting.', { hasSource: !!aidRequestSource, isReady: mapRequestsConfig.isReady });
                return;
            }

            const layer = map.layers.getLayerById('aid-request-layer'); // CORRECTED LAYER ID
            if (!layer) {
                if (mapRequestsConfig.debug) console.error('[Map] Could not find the aid-request-layer to apply filters.');
                return;
            }

            // Build a compound filter based on the state
            const filters = ['all'];

            // Handle Statuses
            if (filterState.statuses && Array.isArray(filterState.statuses) && filterState.statuses.length > 0) {
                filters.push(['in', ['get', 'status'], ['literal', filterState.statuses]]);
            } else if (Array.isArray(filterState.statuses) && filterState.statuses.length === 0) {
                // If the array is empty, it means nothing should match.
                filters.push(['==', ['id'], -1]); // A filter that will always be false
            }

            // Handle Priorities
            if (filterState.priorities && filterState.priorities !== 'all' && Array.isArray(filterState.priorities) && filterState.priorities.length > 0) {
                filters.push(['in', ['get', 'priority'], ['literal', filterState.priorities]]);
            }

            // Handle Aid Types
            if (filterState.aid_types && filterState.aid_types !== 'all' && Array.isArray(filterState.aid_types) && filterState.aid_types.length > 0) {
                filters.push(['in', ['get', 'aid_type'], ['literal', filterState.aid_types]]);
            }

            if (mapRequestsConfig.debug) {
                console.log('[Map] Applying compound filter:', JSON.stringify(filters));
            }

            // If filters only contains ['all'], it means no filters are active, so show everything.
            // Otherwise, apply the compound filter.
            const newFilter = filters.length > 1 ? filters : null;
            layer.setOptions({ filter: newFilter });

            if (mapRequestsConfig.debug) {
                console.log('[Map] Layer visibility updated.');
            }

            // Recalculate bounds based on visible shapes
            const visibleShapes = aidRequestSource.getShapes(null, newFilter);
            if (visibleShapes.length > 0) {
                const bounds = atlas.data.BoundingBox.fromData(visibleShapes);
                map.setCamera({ bounds: bounds, padding: 50 });
                if (mapRequestsConfig.debug) {
                     console.log(`[Map] Setting camera bounds to fit ${visibleShapes.length} visible shapes.`);
                }
            } else {
                // If no shapes are visible, zoom back to the default Field Op bounds
                const mapContainer = document.getElementById('aid-request-map-container') || document.getElementById('field-op-map-container') || document.getElementById('aid-request-map');
                const configBounds = [
                    parseFloat(mapContainer.dataset.boundsWest),
                    parseFloat(mapContainer.dataset.boundsSouth),
                    parseFloat(mapContainer.dataset.boundsEast),
                    parseFloat(mapContainer.dataset.boundsNorth)
                ];
                map.setCamera({ bounds: configBounds, padding: 50 });
                if (mapRequestsConfig.debug) {
                     console.log(`[Map] No visible shapes. Resetting camera to default bounds.`);
                }
            }
        }


        document.body.addEventListener('mapPointShouldUpdate', (e) => {
            if (e.detail?.rowElement) updateMapPoint(e.detail.rowElement);
        });

        document.body.addEventListener('updateMapLayer', (e) => {
            if (e.detail && e.detail.filterState) {
                updateLayerVisibility(e.detail.filterState);
            }
        });

    } catch (error) {
        console.error('[Map] Initialization block failed:', error);
    }
});
