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


document.addEventListener('DOMContentLoaded', () => {
    try {
        if(mapRequestsConfig.debug) console.log('[Map] Initializing map requests config. Version: ' + mapRequestsConfig.version);
        const mapContainer = document.getElementById('aid-request-map-container') || document.getElementById('field-op-map-container') || document.getElementById('aid-request-map');

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
        mapRequestsConfig.debug = true;

        if (mapRequestsConfig.debug) console.log(`[Map Script] Version ${mapRequestsConfig.version} loaded.`);

        mapRequestsConfig.fieldOp = {
            latitude: parseFloat(mapContainer.dataset.centerLat),
            longitude: parseFloat(mapContainer.dataset.centerLon),
            radius: mapContainer.dataset.ringSize ? [parseFloat(mapContainer.dataset.ringSize), 'mi'] : null,
            slug: mapContainer.dataset.fieldOpSlug
        };
        mapRequestsConfig.aidRequestLocations = JSON.parse(mapContainer.dataset.aidRequestLocations || '[]');

        const initialBounds = JSON.parse(mapContainer.dataset.initialBounds || 'null');
        if (mapRequestsConfig.debug) console.log('[Map] Initial bounds from backend:', initialBounds);

        if (!initialBounds) {
            console.error('[Map] CRITICAL: No initial bounds provided from backend. Map cannot be centered.');
            // As a last resort, center on the field op with a default view
            const center = [mapRequestsConfig.fieldOp.longitude, mapRequestsConfig.fieldOp.latitude];
            const defaultRadiusMeters = 5000; // 5km
            const circlePath = atlas.math.getRegularPolygonPath(center, defaultRadiusMeters, 64);
            initialBounds = atlas.math.getBounds(circlePath);
            if (mapRequestsConfig.debug) console.warn('[Map] Falling back to default 5km bounds around FieldOp center.');
        }

        map = new atlas.Map(mapContainer.id, {
            authOptions: { authType: 'subscriptionKey', subscriptionKey: config.key },
            style: 'terra',
            showFeedbackLink: false,
            showLogo: false
        });

        // Add event listeners immediately after map creation
        map.events.add('ready', async () => {
            if (mapRequestsConfig.debug) console.log('[Map] Map is ready.');

            // Set the camera to the initial bounds calculated by the backend
            if (initialBounds) {
                if (mapRequestsConfig.debug) console.log('[Map] Setting camera to initial bounds:', initialBounds);
                map.setCamera({
                    bounds: initialBounds,
                    padding: 50
                });
            } else {
                 if (mapRequestsConfig.debug) console.warn('[Map] No initial bounds to set camera.');
            }

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
            const aidTypesConfigObject = JSON.parse(document.getElementById('aid-types-json').textContent);
            const aidTypesConfig = Object.values(aidTypesConfigObject);
            try {
                if (mapRequestsConfig.debug) {
                    console.log('[Map] aidTypesConfig for icon creation:', JSON.stringify(aidTypesConfig, null, 2));
                }
                await createCustomIcons(aidTypesConfig);
                if (mapRequestsConfig.debug) console.log('[Map] Custom icons created.');
            } catch (error) {
                console.error('[Map] Error creating custom icons:', error);
                return; // Stop if icons fail
            }

            initializeFieldOpLayer(config);
            initializeAidRequestLayer(config, aidTypesConfig);

            // Signal that the map is fully ready with all layers
            document.body.dispatchEvent(new CustomEvent('componentReady', { detail: { name: 'map' } }));
        });

        map.events.add('error', (e) => {
            console.error('[Map] CRITICAL MAP ERROR:', e.error);
        });


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
                ...successfullyCreatedIcons.map(slug => [slug, slug]).flat(),
                'marker-blue' // Default icon
            ];

            const scaleExpression = [
                'match',
                ['get', 'aid_type'],
                ...aidTypesConfig.map(aidType => [aidType.slug, aidType.icon_scale || 1.0]).flat(),
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
                    requester_name: request.requester_full_name,
                    full_address: request.full_address // Add full_address to properties
                });

                features.push(feature);
                if (mapRequestsConfig.debug) {
                    console.log(`[Map] Added point with requestId ${request.id} to source with properties:`, feature.properties);
                }
            }
            aidRequestSource.add(features);

            const iconOptions = {
                allowOverlap: true,
                ignorePlacement: true,
                anchor: 'bottom',
                offset: [0, 0]
            };

            if (successfullyCreatedIcons.length > 0) {
                iconOptions.image = iconExpression;
                iconOptions.size = scaleExpression;
            } else {
                iconOptions.image = 'marker-blue';
                iconOptions.size = 1.0;
            }

            //Create a symbol layer to render the aid request points.
            aidRequestLayer = new atlas.layer.SymbolLayer(aidRequestSource, 'aid-request-layer', {
                iconOptions: iconOptions,
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
        }

        function setupPopupLogic(aidTypesConfig) {
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

            // Create a single popup instance to reuse.
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
                    if (mapRequestsConfig.debug) console.log('[Map] Click was on a feature in aid-request-layer.');

                    const clickedShape = features[0];
                    const prop = clickedShape.getProperties();
                    if (mapRequestsConfig.debug) console.log('[Map] Clicked feature properties:', prop);

                    const markerPosition = clickedShape.getCoordinates();
                    if (mapRequestsConfig.debug) console.log('[Map] Clicked marker position:', markerPosition);

                    // Create the content for the popup dynamically.
                    const contentDiv = document.createElement('div');
                    contentDiv.style.padding = '10px';
                    contentDiv.style.maxWidth = '280px';

                    const aidTypeName = aidTypesMap[prop.aid_type]?.name || prop.aid_type;
                    const address = getAddressForProps(prop);
                    if (mapRequestsConfig.debug) console.log(`[Map] Popup details: aidTypeName='${aidTypeName}', address='${address}'`);

                    const copyContent =
                        `Requester: ${prop.requester_name}\n` +
                        `Status: ${prop.status}\n` +
                        `Priority: ${prop.priority}\n` +
                        `Type: ${aidTypeName}\n` +
                        `Address: ${address}`;

                    // Build the inner HTML
                    contentDiv.innerHTML = `
                        <h6 class="mb-2 text-center fw-bold">Aid Request #${prop.requestId}</h6>
                        <strong>Requester:</strong> ${prop.requester_name}<br>
                        <strong>Status:</strong> ${prop.status}<br>
                        <strong>Priority:</strong> ${prop.priority}<br>
                        <strong>Type:</strong> ${aidTypeName}<br>
                        <strong>Address:</strong><br><span style="word-break: break-all;">${address}</span>
                        <hr class="my-1">
                    `;

                    // Create the copy button and add its event listener
                    const copyButton = document.createElement('button');
                    copyButton.textContent = 'Copy Details';

                    // Add event listener for the copy button
                    copyButton.addEventListener('click', () => {
                        navigator.clipboard.writeText(copyContent).then(() => {
                            if (mapRequestsConfig.debug) console.log('Aid request details copied to clipboard.');
                            // Optionally, show a success message to the user
                        }).catch(err => {
                            if (mapRequestsConfig.debug) console.error('Failed to copy aid request details:', err);
                        });
                    });

                    // Append the copy button to the contentDiv
                    contentDiv.appendChild(copyButton);
                    if (mapRequestsConfig.debug) console.log('[Map] Popup content created:', contentDiv.innerHTML);

                    // Set the popup's content and open it.
                    popup.setOptions({
                        content: contentDiv,
                        position: markerPosition
                    });

                    if (mapRequestsConfig.debug) console.log('[Map] Opening popup...');
                    popup.open(map);
                    if (mapRequestsConfig.debug) console.log('[Map] Popup open command sent.');
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
    } catch (error) {
        console.error('[Map] Error initializing map:', error);
    }
});
