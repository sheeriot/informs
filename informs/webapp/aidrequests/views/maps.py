from django.conf import settings
import httpx
from icecream import ic
from ..models import FieldOp
from geopy.distance import geodesic
# from decimal import Decimal


def staticmap_aid(width=600, height=400, zoom=13,
                  fieldop_lat=0.0, fieldop_lon=0.0,
                  aid1_lat=0.0, aid1_lon=0.0):

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


def staticmap_fieldops(width=1200, height=600):
    # map all field ops
    field_ops = FieldOp.objects.all()

    pin_instances = [
        f"default|co008000|lc000000||'{field_op.slug}'{field_op.longitude} {field_op.latitude}"
        # ic(field_op.latitude)
        for field_op in field_ops
    ]
    if not field_ops:
        return None

    avg_lat = sum(field_op.latitude for field_op in field_ops) / len(field_ops)
    avg_lon = sum(field_op.longitude for field_op in field_ops) / len(field_ops)
    min_lat = min(field_op.latitude for field_op in field_ops)
    max_lat = max(field_op.latitude for field_op in field_ops)
    min_lon = min(field_op.longitude for field_op in field_ops)
    max_lon = max(field_op.longitude for field_op in field_ops)

    distance = geodesic((min_lat, min_lon), (max_lat, max_lon)).kilometers
    zoom = calculate_zoom(distance)

    url = settings.AZURE_MAPS_STATIC_URL
    params = {
        'subscription-key': settings.AZURE_MAPS_KEY,
        'api-version': '2024-04-01',
        'layer': 'basic',
        'style': 'main',
        'zoom': zoom,
        'center': f'{avg_lon},{avg_lat}',
        'width': width,
        'height': height,
        'pins': pin_instances
    }
    try:
        response = httpx.get(url, params=params)
    except Exception as e:
        ic(f"Error: {e}")

    # ic(response.content)
    if response.content.startswith(b'\x89PNG'):

        return response.content
    else:
        return None


def staticmap_aidrequests(field_op=None, aid_requests=None, width=1200, height=800):

    pin_instances = [
        f"default|co008000|lcFFFFFF||'AR{aid_request.pk}'"
        f"{aid_request.location.longitude} {aid_request.location.latitude}"
        for aid_request in aid_requests
    ]

    min_lat = min(aid_request.location.latitude for aid_request in aid_requests)
    max_lat = max(aid_request.location.latitude for aid_request in aid_requests)
    min_lon = min(aid_request.location.longitude for aid_request in aid_requests)
    max_lon = max(aid_request.location.longitude for aid_request in aid_requests)

    if field_op:
        min_lat = min(min_lat, field_op.latitude)
        max_lat = max(max_lat, field_op.latitude)
        min_lon = min(min_lon, field_op.longitude)
        max_lon = max(max_lon, field_op.longitude)
        pin_instances.insert(0,
                             f"default|coFF0000|lcFFFFFF||'OP'"
                             f"{field_op.longitude} {field_op.latitude}"
                             )
    center_lat = (min_lat + max_lat) / 2
    center_lon = (min_lon + max_lon) / 2
    map_distance = geodesic((min_lat, min_lon), (max_lat, max_lon)).kilometers

    zoom = calculate_zoom(map_distance/1.5)

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
        'path': f"lcff0000|lw2|la0.60|ra20000||{field_op.longitude} {field_op.latitude}",
        'pins': pin_instances
    }
    try:
        response = httpx.get(url, params=params)
    except Exception as e:
        ic(f"Error: {e}")

    # ic(response.content)
    if response.content.startswith(b'\x89PNG'):

        return response.content
    else:
        return None


def calculate_zoom(distance=0):
    if distance <= 0.4:
        return 16
    if distance <= 1:
        return 15
    if distance <= 2:
        return 14
    elif distance <= 4:
        return 13
    elif distance <= 10:
        return 12
    elif distance <= 17:
        return 11
    elif distance <= 30:
        return 10
    elif distance <= 60:
        return 9
    elif distance <= 120:
        return 8
    elif distance <= 250:
        return 7
    elif distance <= 550:
        return 6
    elif distance <= 1100:
        return 5
    elif distance <= 2000:
        return 4
    elif distance <= 5000:
        return 3
    else:
        return 2
