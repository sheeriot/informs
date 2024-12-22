function initMap(context) {
    //Initialize a map instance
    if (!context || typeof context !== 'object') {
        console.error('Invalid map context provided.')
        return;
    }
    const { longitude, latitude, apiKey } = context
    console.log('Context:', context);
    console.log('Parsed Coordinates:', parseFloat(longitude), parseFloat(latitude));

    console.log('latitude,longitude:', latitude, ',', longitude)
    const map = new atlas.Map('mapContainer', {
        center: [parseFloat(longitude), parseFloat(latitude)],
        zoom: 12,
        style: 'satellite',
        // view: 'Auto',
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: apiKey
        }
    });

    //Wait until the map resources are ready.
    map.events.add('ready', function () {
        console.log('Map is READY')
        //Create a HTML marker and add it to the map.
        map.markers.add(new atlas.HtmlMarker({
            htmlContent: "<div><div class='pin bounce'></div><div class='pulse'></div></div>",
            position: [parseFloat(longitude), parseFloat(latitude)],
            pixelOffset: [5, -18]
        }))
    })
}