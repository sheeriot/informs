from django.conf import settings
import httpx
from icecream import ic
from geopy.distance import geodesic
from django_q.tasks import async_task, result
from urllib.parse import urlencode, quote
from django.core.files.base import ContentFile
from datetime import datetime
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.contrib.auth.decorators import login_required
import os
from ..models import AidLocation, AidRequest, FieldOp

def staticmap_aid(width=600, height=400,
                  fieldop_lat=0.0, fieldop_lon=0.0,
                  aid1_lat=0.0, aid1_lon=0.0):

    ic("build staticmap_aid")

    # --- Calculate Center Point ---
    center_lon = (float(fieldop_lon) + float(aid1_lon)) / 2
    center_lat = (float(fieldop_lat) + float(aid1_lat)) / 2

    # --- Calculate Distance and Zoom ---
    try:
        distance_km = geodesic((fieldop_lat, fieldop_lon), (aid1_lat, aid1_lon)).kilometers
    except Exception:
        distance_km = 0

    zoom = calculate_zoom(distance_km)

    # Correct Pin Format: style|modifiers||'label'lon lat (no space after label)
    pin1 = f"default|co008000|lcFFFFFF||'OP'{fieldop_lon} {fieldop_lat}"
    pin2 = f"default|coFFFF00|lc000000||'AID'{aid1_lon} {aid1_lat}"

    raw_path = f"lcFF1493||{fieldop_lon} {fieldop_lat}|{aid1_lon} {aid1_lat}"

    url = settings.AZURE_MAPS_STATIC_URL

    params = [
        ('subscription-key', settings.AZURE_MAPS_KEY),
        ('api-version', '2024-04-01'),
        ('tilesetId', 'microsoft.base.road'),
        ('zoom', zoom),
        ('center', f'{center_lon},{center_lat}'),
        ('width', width),
        ('height', height),
        ('pins', pin1),
        ('pins', pin2),
        ('path', raw_path)
    ]
    try:
        # Pass the list of tuples directly to httpx to handle encoding.
        # This avoids double-encoding issues.
        response = httpx.get(url, params=params)
        ic("Final URL:", response.url)
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        ic(f"Error making static map request: {e}")
        ic("Response status:", e.response.status_code)
        ic("Response body:", e.response.text)
        return None
    except Exception as e:
        ic(f"An unexpected error occurred: {e}")
        return None

    if response.content.startswith(b'\x89PNG'):
        return response.content
    else:
        ic("Non-PNG response from Azure Maps:", response.text)
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

def create_static_map(location: object, synchronous=False) -> None:
    """
    Creates a static map for the given location object.
    Can be run synchronously or asynchronously.
    """
    ic('run create_static_map')
    task_name = f"GenerateMap_L{location.pk}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    if synchronous:
        # Run synchronously and wait for the result
        from ..tasks import generate_static_map_for_location
        generate_static_map_for_location(location.pk)
    else:
        # Run asynchronously
        async_task(
            'aidrequests.tasks.generate_static_map_for_location',
            location.pk,
            task_name=task_name
        )

def update_location_map_filename(task):
    pass

@login_required
def check_map_status(request, field_op, location_pk):
    location = get_object_or_404(AidLocation, pk=location_pk)
    if location.map_filename:
        map_file_path = os.path.join(settings.MAPS_PATH, location.map_filename)
        if os.path.exists(map_file_path):
            context = {
                'location': location,
                'aid_request': location.aid_request,
                'MEDIA_URL': settings.MEDIA_URL
            }
            map_html = render_to_string(
                'aidrequests/partials/_location_map_area.html',
                context,
                request=request
            )
            return JsonResponse({'status': 'ready', 'map_html': map_html})

    return JsonResponse({'status': 'pending'})
