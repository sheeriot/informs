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
    console.log('fieldop coords')
    console.log(fieldop_lat, fieldop_lon)
 
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
    const ring_size = context.ring_size
    const legend_one = {
            type: 'category',
            subtitle: 'Category',
            layout: 'column',
            itemLayout: 'row',
            footer: 'A category legend that uses a combination of shapes and icons.',
            strokeWidth: 2,
            items: [
                {
                    color: 'DodgerBlue',
                    label: 'label1',
                    //Url to an image.
                    shape: 'https://azuremapscodesamples.azurewebsites.net/Common/images/icons/campfire.png'
                }, {
                    color: 'Yellow',
                    label: 'label2',
                    shape: 'square'
                }, {
                    color: 'Orange',
                    label: 'Ricky',
                    shape: 'line'
                }, {
                    color: 'Red',
                    label: 'is',
                    shape: 'circle'
                }, {
                    color: 'purple',
                    label: 'awesome!',
                    shape: 'triangle'
                }
            ]
        }

    var map2 = new atlas.Map('map2Container', {
        center: [parseFloat(center_lon), parseFloat(center_lat)],
        zoom: parseInt(map_zoom),
        style: 'road_shaded_relief',
        view: "Auto",

        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: azure_maps_key,
        }
    })

    map2StyleControl = new atlas.control.StyleControl({
        mapStyles: [
            'terra', 
            'road', 
            'satellite', 
            'hybrid',
            'road_shaded_relief', 
            'satellite_road_labels'
        ],
        layout: 'list'
    })

    //Wait until the map resources are ready, then add layers
    map2.events.add('ready', function () {

        map2.imageSprite.add('life-preserver', '/static/images/icons/t_life-preserver.svg')
        // console.log(atlas.getAllImageTemplateNames())
        legend = new atlas.control.LegendControl({ title: 'Field Op Legend'}, legends = [legend_one])

        map2.controls.add(legend, { position: 'top-left' })
        var lc = new atlas.control.LayerControl({
            legendControl: legend,
            dynamicLayerGroup: {
                groupTitle: 'Show:',
                layout: 'checkbox'
            }
        })
        map2.controls.add( map2StyleControl, { position: 'top-left' })
        map2.controls.add( lc, { position: 'bottom-left' })
        map2.controls.add([
                new atlas.control.ZoomControl(),
                new atlas.control.PitchControl(),
                new atlas.control.CompassControl(),
                new atlas.control.FullscreenControl(),
            ], { position: 'top-right' })
        map2.controls.add([
            new atlas.control.ScaleControl(),
            ], { position: 'bottom-right' })

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
        var foLayer = new atlas.layer.SymbolLayer(fodataSource, fieldop_name, {
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
        })
        map2.layers.add(foLayer)

        // Mark an Aid Ring
        const dataSourceC = new atlas.source.DataSource()
        map2.sources.add(dataSourceC)
        //Create a circle
        dataSourceC.add(new atlas.data.Feature(
            new atlas.data.Point([parseFloat(fieldop_lon), parseFloat(fieldop_lat)]), 
            {
                subType: "Circle",
                radius: ring_size * 1000
            }
        ))
        // console.log("Ring in KM", ring_size)
        const ringLayer = new atlas.layer.PolygonLayer(dataSourceC, ring_size + 'km Aid Ring', {
            fillColor: 'rgba(255, 0, 0, 0.1)',
            strokeColor: 'red',
            strokeWidth: 2
        })
        map2.layers.add(ringLayer)

        //Create a popup but leave it closed so we can update it and display it later.
        var fopopupTemplate = '<div class="fieldop-popup">{name}<hr class="m-0">{slug}<div><hr class="m-0">{lat},{lon}</div></div>';
        fopopup = new atlas.Popup({
            pixelOffset: [0, -18],
            closeButton: false
        });

        //Add a hover event to the symbol layer.
        map2.events.add('mouseover', foLayer, function (e) {
            if (e.shapes && e.shapes.length > 0) {
            var content, coordinate
            var properties = e.shapes[0].getProperties()
            content = fopopupTemplate.replace(/{name}/g, properties.name).replace(/{slug}/g, properties.slug).replace(/{lat}/g, properties.lat).replace(/{lon}/g, properties.lon)
            coordinate = e.shapes[0].getCoordinates()
            fopopup.setOptions({
                content: content,
                position: coordinate
            })
            fopopup.open(map2)
            }
        })
        map2.events.add('mouseleave', foLayer, function () { fopopup.close() })

        const aidtypes_data = JSON.parse(document.getElementById('aid-types-data').textContent)
        console.log("aidtypes_data:", aidtypes_data)

        // now the aid requests
        const locations = JSON.parse(document.getElementById('aid-locations-data').textContent)
        var points = []
        locations.forEach(location => {
            if (location.latitude && location.longitude) {
                var position = new atlas.data.Position(parseFloat(location.longitude), parseFloat(location.latitude))
                var point = new atlas.data.Feature(new atlas.data.Point(position), location)
                points.push(point);
            }
        })
        var dataSource2 = new atlas.source.DataSource(undefined, {
            cluster: false,
          })
        map2.sources.add(dataSource2)
        dataSource2.add(points)
        //Create an array of custom icon promises to load into the map. 
        // var iconPromises = [
        //     // map.imageSprite.add('gas_station_icon', '/images/icons/gas_station_pin.png'),
        //     // map.imageSprite.add('grocery_store_icon', '/images/icons/grocery_cart_pin.png'),
        //     // map.imageSprite.add('restaurant_icon', '/images/icons/restaurant_pin.png'),
        //     map2.imageSprite.add('life_preserver', '/static/images/icons/life-preserver-red.svg'),
        // ]
        // await map2.imageSprite.createFromTemplate('')
        // Promise.all(iconPromises).then(function () {
            // console.log('promises kept')
            // map2.imageSprite.add('life-preserver-red', '/static/images/icons/life-preserver-red.svg')
        // map2.imageSprite.createFromTemplate('flat-teal', 'marker-flat', 'teal', '#fff').then(function () {
        // const iconPromises = [
        //     map2.imageSprite.createFromTemplate('flag-red', 'flag', 'red', '#fff'),
        //     map2.imageSprite.createFromTemplate('car-blue', 'car', 'blue', '#fff'),
        // ]
        const iconPromises = Object.keys(aidtypes_data).map(key =>
            map2.imageSprite.createFromTemplate(key, aidtypes_data[key].icon_name, aidtypes_data[key].icon_color, '#fff')
        )
        console.log(iconPromises)

        var icon_map = [ 'match', ['get', 'aid_type'] ]
        Object.keys(aidtypes_data).map(key => {
            icon_map.push(key, key)
            aidtype = aidtypes_data[key]
            console.log('aidtype: key, name, color:', key, aidtype.icon_name, aidtype.icon_color)
        })
        // no match need an icon
        icon_map.push('marker-yellow')
        console.log(icon_map)

        Promise.all(iconPromises).then(function () {
            var aidLayer = new atlas.layer.SymbolLayer(dataSource2, 'Aid Requests', {
                iconOptions: {
                    ignorePlacement: false,
                    allowOverlap: true,
                    // image: "pin-red",
                    anchor: "bottom",
                    // size: 1.5,
                    //Use a match expression to select the image icon based on the EntityType property of the data point.
                    // image: [
                    //     'match', ['get', 'aid_type'],
                    //     'welfare_check', 'pin-blue',
                    //     're_supply', 'pin-darkblue',
                    //     // 'evacuation', 'pin-round-blue',
                    //     'evacuation', 'flag-red',
                    //     'other', 'car-blue',
                    //     // 'evacuation', 'life_preserver',
                    //     // Default fallback icon.
                    //     'marker-yellow'
                    // ]
                    // image: JSON.stringify(icon_map)
                    image: icon_map
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
            })
            map2.layers.add(aidLayer)
        })
    })
}
