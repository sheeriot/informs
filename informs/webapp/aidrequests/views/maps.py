from django.conf import settings
import httpx
from icecream import ic
from geopy.distance import geodesic
# import math

def staticmap_aid(width=600, height=400, zoom=13,
                  fieldop_lat=0.0, fieldop_lon=0.0,
                  aid1_lat=0.0, aid1_lon=0.0):

    ic("build staticmap_aid")
    # ic(type(aid1_lat), type(aid1_lon))
    # ic(type(fieldop_lat), type(fieldop_lon))
    center_lat = (float(fieldop_lat) + float(aid1_lat)) / 2
    center_lon = (float(fieldop_lon) + float(aid1_lon)) / 2

    pin_instances = [
        f"default|co008000|lcFFFFFF||'OP'{fieldop_lon} {fieldop_lat}",
        f"default|coFFFF00|lc000000||'AID'{aid1_lon} {aid1_lat}"
    ]

    url = settings.AZURE_MAPS_STATIC_URL
    params = {
        'subscription-key': settings.AZURE_MAPS_KEY,
        'api-version': '2024-04-01',
        'layer': 'basic',
        'style': 'main',
        'zoom': zoom,
        'center': f'{center_lon},{center_lat}',
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
        return response.content
    else:
        return None


def calculate_zoom(distance_km):
    """Calculate zoom level based on distance between points."""
    if distance_km <= 1:
        return 14
    elif distance_km <= 2:
        return 13
    elif distance_km <= 5:
        return 12
    elif distance_km <= 10:
        return 11
    elif distance_km <= 20:
        return 10
    elif distance_km <= 50:
        return 9
    elif distance_km <= 100:
        return 8
    elif distance_km <= 200:
        return 7
    elif distance_km <= 500:
        return 6
    elif distance_km <= 1000:
        return 5
    else:
        return 4

def staticmap_fieldop(width=600, height=400, latitude=0.0, longitude=0.0, zoom=12):
    """Generate a static map for a single field op location."""
    pin_instances = [
        f"default|co008000|lcFFFFFF|OP|{longitude} {latitude}"
    ]

    url = settings.AZURE_MAPS_STATIC_URL
    params = {
        'subscription-key': settings.AZURE_MAPS_KEY,
        'api-version': '2024-04-01',
        'tilesetId': 'microsoft.base.road',
        'center': f'{longitude},{latitude}',
        'zoom': zoom,
        'pins': pin_instances,
        'width': width,
        'height': height
    }
    try:
        response = httpx.get(url, params=params)
        ic("Static map request params:", params)
    except Exception as e:
        ic(f"Error: {e}")

    if response.content.startswith(b'\x89PNG'):
        return response.content
    else:
        ic("Non-PNG response:", response.text)
        return None
