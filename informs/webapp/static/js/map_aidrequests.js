function initMap(context) {
    //Initialize a map instance
    if (!context || typeof context !== 'object') {
        console.error('Invalid map context provided.')
        return;
    }
    const fieldop_lat = context.fieldop_lat
    const fieldop_lon = context.fieldop_lon
    const apiKey = context.apiKey
    const locations = context.aid_locations
    const map_zoom = context.map_zoom
    const center_lat = context.center_lat
    const center_lon = context.center_lon
 
    // console.log('fieldop_lat,fieldop_lon:', fieldop_lat, ',', fieldop_lon)
    // console.log('map_zoom:', map_zoom)

    const map = new atlas.Map('mapContainer', {
        center: [parseFloat(center_lon), parseFloat(center_lat)],
        zoom: parseInt(map_zoom),
        style: 'road_shaded_relief',
        view: 'Auto',
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: apiKey
        }
    });

    //Wait until the map resources are ready.
    map.events.add('ready', function () {
        // console.log('Map is READY. Add controls, markers..')
        map.setUserInteraction({ scrollZoomInteraction: false })

        const zoomControl = new atlas.control.ZoomControl();
        map.controls.add(zoomControl, {
            position: 'top-right'
        })

        //Add a style control to the map.
        map.controls.add(
            new atlas.control.StyleControl({
            mapStyles: [
                'terra', 
                'road', 
                'satellite', 
                'hybrid',
                'road_shaded_relief', 
                'satellite_road_labels'
            ],
            layout: 'list'
            }),
            { position: 'top-left' }
        );


        // console.log('First Mark Field Op');
        map.markers.add(new atlas.HtmlMarker({
            htmlContent: "<div id='fieldop'><div class='pin bounce'></div><div class='pulse'></div>{text}</div>",
            text: 'FO',
            position: [parseFloat(fieldop_lon), parseFloat(fieldop_lat)],
            pixelOffset: [5, -18]
        }))
        // Change Field Op Marker to Red
        let fieldopColor = 'green';
        // let fieldopBackground = 'LemonChiffon'
        const fieldopElement = document.getElementById('fieldop');
        if (fieldopElement) {
            fieldopElement.style.setProperty('--pin-color', fieldopColor);
            // fieldopElement.style.setProperty('--pin-background', fieldopBackground);
        } else {
            console.error('Element with id "fieldop" not found.');
        }

        if (Array.isArray(context.aid_locations)) {
            locations.forEach(location => {
            if (location.latitude && location.longitude) {
                map.markers.add(new atlas.HtmlMarker({
                htmlContent: "<div><div class='pin bounce'></div><div class='pulse'></div></div>",
                position: [parseFloat(location.longitude), parseFloat(location.latitude)],
                pixelOffset: [5, -18]
                }));
            }
            });
        } else {
            console.error('Invalid aid_locations provided.');
        }

    })
}

function initMap2(context) {
    if (!context || typeof context !== 'object') {
        console.error('Invalid map context provided.')
        return;
    }
    const center_lat = context.center_lat
    const center_lon = context.center_lon
    const fieldop_name = context.fieldop_name
    const fieldop_slug = context.fieldop_slug
    const fieldop_lat = context.fieldop_lat
    const fieldop_lon = context.fieldop_lon
    const azure_maps_key = context.azure_maps_key
    const map_zoom = context.map_zoom

    // console.log('center_lat, center_lon:', center_lat, ',', center_lon)
    // console.log('map_zoom:', map_zoom)
    // console.log(azure_maps_key)

    var map2 = new atlas.Map('map2Container', {
        center: [parseFloat(center_lon), parseFloat(center_lat)],
        zoom: parseInt(map_zoom),
        style: 'road_shaded_relief',
        view: "Auto",

        //Add authentication details for connecting to Azure Maps.
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: azure_maps_key,
        }
    });

    //Wait until the map resources are ready.
    map2.events.add('ready', function () {
        // console.log('Map2 is READY. Add controls, markers..')
        // map2.setUserInteraction({ scrollZoomInteraction: false })

        const zoomControl = new atlas.control.ZoomControl();
        map2.controls.add(zoomControl, {
            position: 'top-right'
        })

        //Add a style control to the map.
        map2.controls.add(
            new atlas.control.StyleControl({
            mapStyles: [
                'terra', 
                'road', 
                'satellite', 
                'hybrid',
                'road_shaded_relief', 
                'satellite_road_labels'
            ],
            layout: 'list'
            }),
            { position: 'top-left' }
        );
        // First, Field Op Marker
        const dataSourceC = new atlas.source.DataSource()
        map2.sources.add(dataSourceC)
        //Create a circle
        dataSourceC.add(new atlas.data.Feature(
            new atlas.data.Point([parseFloat(fieldop_lon), parseFloat(fieldop_lat)]), 
            {
                subType: "Circle",
                radius: 20000
            }
        ));

        const circleLayer = new atlas.layer.PolygonLayer(dataSourceC, null, {
            fillColor: 'rgba(255, 0, 0, 0.1)',
            strokeColor: 'red',
            strokeWidth: 2
        });
        map2.layers.add(circleLayer)

        var fopoint_data = []
        var fopos = new atlas.data.Position(parseFloat(fieldop_lon), parseFloat(fieldop_lat))
        var fopoint = new atlas.data.Feature(new atlas.data.Point(fopos), {
                    "name": fieldop_name,
                    'slug': fieldop_slug,
                    'lat': fieldop_lat,
                    'lon': fieldop_lon
                })
        fopoint_data.push(fopoint);
        
        var fodataSource = new atlas.source.DataSource()
        map2.sources.add(fodataSource)
        fodataSource.add(fopoint_data);

        var foLayer = new atlas.layer.SymbolLayer(fodataSource, null, {
            iconOptions: {
                ignorePlacement: false,
                allowOverlap: true,
                image: "pin-blue",
                anchor: "bottom",
                size: 1.5
            },
            textOptions: {
                textField: ['get', 'slug'],
                offset: [0, 0.5],
                allowOverlap: true,
                ignorePlacement: false,
                font: ['StandardFont-Bold'],
                size: 12,
                color: 'black',
                haloColor: 'white',
                haloWidth: 2
            }
        });
        
        map2.layers.add(foLayer);
        //Create a popup but leave it closed so we can update it and display it later.
        var fopopupTemplate = '<div class="fieldop-popup">{name}<hr class="m-0">{slug}<div><hr class="m-0">{lat},{lon}</div></div>';
        fopopup = new atlas.Popup({
            pixelOffset: [0, -18],
            closeButton: false
        });

        //Add a hover event to the symbol layer.
        map2.events.add('mouseover', foLayer, function (e) {
            //Make sure that the point exists.
            if (e.shapes && e.shapes.length > 0) {
            var content, coordinate
            var properties = e.shapes[0].getProperties()
            content = fopopupTemplate.replace(/{name}/g, properties.name).replace(/{slug}/g, properties.slug).replace(/{lat}/g, properties.lat).replace(/{lon}/g, properties.lon)
            coordinate = e.shapes[0].getCoordinates()
        
            fopopup.setOptions({
                //Update the content of the popup.
                content: content,
        
                //Update the popup's position with the symbol's coordinate.
                position: coordinate
        
            })
            //Open the popup.
            fopopup.open(map2)
            }
        })
        
        map2.events.add('mouseleave', foLayer, function (){
            fopopup.close();
        })

        // get and prep the location points into GeoJSON
        const locations = JSON.parse(document.getElementById('aid-locations-data').textContent)

        var points = []
        locations.forEach(location => {
            if (location.latitude && location.longitude) {
                var position = new atlas.data.Position(parseFloat(location.longitude), parseFloat(location.latitude))
                var point = new atlas.data.Feature(new atlas.data.Point(position), location)
                points.push(point);
            }
        });

        /* Create a data source and add the new points  */
        var dataSource2 = new atlas.source.DataSource()
        map2.sources.add(dataSource2)
        dataSource2.add(points)
        // console.log(points)
        //Create a layer that defines how to render the points on the map.
        var aidLayer = new atlas.layer.SymbolLayer(dataSource2, null, {
            iconOptions: {
                ignorePlacement: false,
                allowOverlap: true,
                image: "pin-red",
                anchor: "bottom",
                size: 1.5
            },
            textOptions: {
                textField: ['get', 'pk'],
                offset: [0, 0.5],
                allowOverlap: true,
                ignorePlacement: false,
                font: ['StandardFont-Bold'],
                size: 12,
                color: 'black',
                haloColor: 'white',
                haloWidth: 2
            }
        });

        map2.layers.add(aidLayer);
    });
}