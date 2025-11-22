import os
import logging
import httpx
from datetime import datetime
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import Http404, JsonResponse, FileResponse
from django_q.tasks import async_task, fetch, result
from geopy.distance import geodesic
from icecream import ic

from ..models import AidRequest, AidLocation

logger = logging.getLogger(__name__)


def staticmap_aid(width=600, height=400,
                  fieldop_lat=0.0, fieldop_lon=0.0,
                  aid1_lat=0.0, aid1_lon=0.0):

    # --- Calculate Center Point ---
    # Handle cases where lat/lon might be None or non-numeric
    try:
        f_lat = float(fieldop_lat) if fieldop_lat is not None else 0.0
        f_lon = float(fieldop_lon) if fieldop_lon is not None else 0.0
        a_lat = float(aid1_lat) if aid1_lat is not None else 0.0
        a_lon = float(aid1_lon) if aid1_lon is not None else 0.0
    except (ValueError, TypeError):
        f_lat, f_lon, a_lat, a_lon = 0.0, 0.0, 0.0, 0.0

    center_lon = (f_lon + a_lon) / 2
    center_lat = (f_lat + a_lat) / 2

    # --- Calculate Distance and Zoom ---
    try:
        distance_km = geodesic((f_lat, f_lon), (a_lat, a_lon)).kilometers
    except Exception:
        distance_km = 0

    zoom = calculate_zoom(distance_km)

    # Correct Pin Format
    pin1 = f"default|co008000|lcFFFFFF||'OP'{f_lon} {f_lat}"
    pin2 = f"default|coFF0000|lcFFFFFF||'AID'{a_lon} {a_lat}"

    raw_path = f"lcFF1493||{f_lon} {f_lat}|{a_lon} {a_lat}"

    url = "https://atlas.microsoft.com/map/static"

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
        response = httpx.get(url, params=params)
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"Error making static map request: {e}")
        logger.error(f"Response status: {e.response.status_code}")
        logger.error(f"Response body: {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}")
        return None

    if response.content.startswith(b'\x89PNG'):
        return response.content
    else:
        logger.warning(f"Non-PNG response from Azure Maps: {response.text}")
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

def staticmap_fieldop(width=600, height=400, latitude=0.0, longitude=0.0, zoom=12, ring_size=None):
    """Generate a static map for a single field op location."""
    pin_instances = f"default|co008000|lcFFFFFF||'OP'{longitude} {latitude}"

    url = "https://atlas.microsoft.com/map/static"
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
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Error making static map request for FieldOp: {e}")
        return None

    if response.content.startswith(b'\x89PNG'):
        return response.content
    else:
        logger.warning(f"Non-PNG response for FieldOp map: {response.text}")
        return None

def create_static_map(location, wait_with_timeout: int = None, synchronous: bool = False):
    """
    Generates a static map for an AidLocation.
    If synchronous=True, runs the task immediately in the current thread.
    Otherwise, enqueues a background task.
    Optionally waits for the task to complete (if async) and returns the filename.
    """
    if synchronous:
        from ..tasks import generate_static_map_for_location
        result = generate_static_map_for_location(location.pk)
        return result.get('map_filename') if result.get('status') == 'success' else None

    task_name = f"GenerateMap_L{location.pk}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    async_task(
        'aidrequests.tasks.generate_static_map_for_location',
        location.pk,
        task_name=task_name
    )

    if wait_with_timeout:
        try:
            task_result_obj = result(task_name, wait=wait_with_timeout)
            if task_result_obj:
                ic(f"Map generation task {task_name} result after waiting: {task_result_obj}")
                return task_result_obj.get('map_filename')
            else:
                logger.warning(f"Map generation task for L-{location.pk} did not complete in time.")
                return None
        except Exception as e:
            logger.error(f"Error waiting for map generation task for L-{location.pk}: {e}")
            return None
    else:
        return None

@login_required
def check_map_status(request, task_id):
    """
    Checks the status of a map generation task for polling.
    """
    task = fetch(task_id)
    if task:
        return JsonResponse({'status': task.status(), 'result': task.result})
    return JsonResponse({'status': 'UNKNOWN'}, status=404)
