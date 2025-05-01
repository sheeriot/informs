from django.conf import settings
import httpx
from icecream import ic
from geopy.distance import geodesic
import math

def staticmap_aid(width=600, height=400,
                 fieldop_lat=0.0, fieldop_lon=0.0,
                 aid1_lat=0.0, aid1_lon=0.0):

    # Calculate bounds to include both points
    min_lat = min(float(fieldop_lat), float(aid1_lat))
    max_lat = max(float(fieldop_lat), float(aid1_lat))
    min_lon = min(float(fieldop_lon), float(aid1_lon))
    max_lon = max(float(fieldop_lon), float(aid1_lon))

    # Add some padding to the bounds (about 10% of the range)
    lat_padding = (max_lat - min_lat) * 0.1
    lon_padding = (max_lon - min_lon) * 0.1

    min_lat -= lat_padding
    max_lat += lat_padding
    min_lon -= lon_padding
    max_lon += lon_padding

    pin_instances = [
        f"default|co008000|lcFFFFFF||'OP'|{fieldop_lon} {fieldop_lat}",
        f"default|coFFFF00|lc000000||'AID'|{aid1_lon} {aid1_lat}"
    ]

    url = settings.AZURE_MAPS_STATIC_URL
    params = {
        'subscription-key': settings.AZURE_MAPS_KEY,
        'api-version': '2024-04-01',
        'tilesetId': 'microsoft.base.road',
        'bbox': f'{min_lon},{min_lat},{max_lon},{max_lat}',
        'pins': pin_instances,
        'path': f'lcFF1493||{fieldop_lon} {fieldop_lat}|{aid1_lon} {aid1_lat}'
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
