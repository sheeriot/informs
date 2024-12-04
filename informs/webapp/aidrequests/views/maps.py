from django.conf import settings
import httpx
from icecream import ic


def staticmap_aid(width=600, height=400, zoom=13,
                  fieldop_lat=30.42, fieldop_lon=-97.92,
                  aid1_lat=30.415, aid1_lon=-97.922):

    pin_instances = [
        f"default|co008000|lcFFFFFF||'OP'{fieldop_lon} {fieldop_lat}",
        f"default|coFFFF00|lc000000||'AID'{aid1_lon} {aid1_lat}"
    ]

    url = "https://atlas.microsoft.com/map/static/png"
    params = {
        'subscription-key': settings.AZURE_MAPS_KEY,
        'api-version': '1.0',
        'layer': 'basic',
        'style': 'main',
        'zoom': zoom,
        'center': f'{fieldop_lon},{fieldop_lat}',
        'width': width,
        'height': height,
        'pins': pin_instances,
        'path': f'lcFF1493||{fieldop_lon} {fieldop_lat}|{aid1_lon} {aid1_lat}'
    }
    try:
        response = httpx.get(url, params=params)
    except Exception as e:
        ic(f"Error: {e}")

    if response.content.startswith(b'\x89PNG'):
        content_length = response.headers['content-length']
        content_type = response.headers['content-type']
        ic(f"The response content is a PNG file, size: {content_length}. Type: {content_type}")
        return response.content
    else:
        ic("The Azure Map is not a PNG file.")
        ic(response.content)
        return None
