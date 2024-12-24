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
 
    console.log('fieldop_lat,fieldop_lon:', fieldop_lat, ',', fieldop_lon)
    console.log('map_zoom:', map_zoom)

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
        console.log('Map is READY. Add controls, markers..')

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

        // console.log('Now Mark Field Op');
        map.markers.add(new atlas.HtmlMarker({
            htmlContent: "<div id='fieldop'><div class='pin bounce'></div><div class='pulse'></div></div>",
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
    })
}