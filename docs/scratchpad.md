# Scratchpad

Random stuff that may be kept

## Maps

* [Google Maps Tile URL for Hybrid MapType Tiles](https://stackoverflow.com/questions/23017766/google-maps-tile-url-for-hybrid-maptype-tiles)
* [Google Maps Documentation](https://developers.google.com/maps/documentation/urls/get-started)

### Geocoding Coverage by Azure Maps

* [Geocoding Coverage by Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/geocoding-coverage)

Azure Maps API 2024-04-01:

* [https://learn.microsoft.com/en-us/rest/api/maps/render?view=rest-maps-2024-04-01](https://learn.microsoft.com/en-us/rest/api/maps/render?view=rest-maps-2024-04-01)

### Browser Map Control

Include needed CSS and JS to support Azure Maps.

```html
<link rel="stylesheet" href="https://atlas.microsoft.com/sdk/javascript/mapcontrol/3/atlas.min.css" type="text/css" />
<script src="https://atlas.microsoft.com/sdk/javascript/mapcontrol/3/atlas.min.js"></script>
```

### Python Package: azure-maps-render

How about the python library:

* [https://pypi.org/project/azure-maps-render/](https://pypi.org/project/azure-maps-render/)
* [Azure Maps Render Python Package](https://pypi.org/project/azure-maps-render/)

Check it out:

```python
from azure.core.credentials import AzureKeyCredential
from azure.maps.render import MapsRenderClient

credential = AzureKeyCredential(os.environ.get("AZURE_SUBSCRIPTION_KEY"))

render_client = MapsRenderClient(
        credential=credential,
)
```

so it also needs azure-core:

* [https://pypi.org/project/azure-core/](https://pypi.org/project/azure-core/)
* [Azure Core Python Package](https://pypi.org/project/azure-core/)

Also, Azure Maps Search package

* [https://pypi.org/project/azure-maps-search/](https://pypi.org/project/azure-maps-search/)
* [Azure Maps Search Python Package](https://pypi.org/project/azure-maps-search/)

```python
from azure.core.credentials import AzureKeyCredential
from azure.maps.search import MapsSearchClient

credential = AzureKeyCredential(os.environ.get("AZURE_SUBSCRIPTION_KEY"))
search_client = MapsSearchClient(
        credential=credential,
)
```

### Random Stuff

What is Geocoding: [https://www.mapbox.com/insights/geocoding](https://www.mapbox.com/insights/geocoding)

Google Maps URL:

```html
<a href="https://google.com/maps/place/{{ latitude }},{{ longitude }}/@{{ latitude }},{{ longitude }},13z"
target="_blank" class="btn btn-outline-success btn-sm">
{% bs_icon "geo-alt" %} gMap
</a>
```

brennantymrak.com: Comprehending Class-Based Views

* [https://www.brennantymrak.com/articles/comprehending-class-based-views-view-base-class](https://www.brennantymrak.com/articles/comprehending-class-based-views-view-base-class)

### Pytak

Sample of PyTak in wild

[PyTak Citizen to COT](https://github.com/gncnpk/CitizentoCOT/blob/master/main.py)
