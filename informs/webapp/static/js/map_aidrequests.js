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

    console.log('fieldop_lat,fieldop_lon:', fieldop_lat, ',', fieldop_lon)
    const map = new atlas.Map('mapContainer', {
        center: [parseFloat(fieldop_lon), parseFloat(fieldop_lat)],
        zoom: 11,
        style: 'road_shaded_relief',
        view: 'Auto',
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: apiKey
        }
    });

    //Wait until the map resources are ready.
    map.events.add('ready', function () {
        console.log('Map is READY. Add controls, markers..')

        const zoomControl = new atlas.control.ZoomControl();
        map.controls.add(zoomControl, {
            position: 'top-right'
        })

        //Add a style control to the map.
        map.controls.add(new atlas.control.StyleControl({

            mapStyles: ['terra', 'road', 'satellite', 'hybrid',
                        'road_shaded_relief', 'satellite_road_labels',
                    ],
            layout: 'list'
            }),
            {
                position: 'top-left'
            }
        )

        //Create a HTML marker and add it to the map.
        map.markers.add(new atlas.HtmlMarker({
            htmlContent: "<div><div class='pin-red bounce'></div><div class='pulse-red'></div></div>",
            position: [parseFloat(fieldop_lon), parseFloat(fieldop_lat)],
            pixelOffset: [5, -18]
        }))
        console.log(context.aid_locations)
        console.log('Type of aid_locations:', typeof context.aid_locations);
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