import json
from django.core.serializers.json import DjangoJSONEncoder
from geopy.distance import distance
from geopy.point import Point


def prepare_aid_locations_for_map(aid_requests_queryset):
    """
    Takes a queryset of AidRequest objects and returns a list of
    dictionaries formatted for the Azure Maps component.
    """
    aid_locations = []
    # Eager load related data to avoid N+1 query problems
    requests = aid_requests_queryset.select_related('aid_type').prefetch_related('locations')

    for ar in requests:
        # The `location` property on the AidRequest model gets the
        # active (confirmed or new) location.
        loc = ar.location
        if loc and loc.latitude is not None and loc.longitude is not None:
            aid_locations.append({
                'id': ar.pk,
                'status': ar.status,
                'priority': ar.priority or 'none',
                'group_size': ar.group_size or 0,
                'location': {
                    'latitude': loc.latitude,
                    'longitude': loc.longitude,
                },
                'aid_type': {
                    'name': ar.aid_type.name,
                    'slug': ar.aid_type.slug,
                },
                'address': {
                    'full': ar.full_address,
                },
                'requester_name': ar.requester_full_name or 'N/A',
            })
    return aid_locations


def get_circle_bounds(center_lat, center_lon, radius_km):
    """
    Calculates the bounding box for a circle defined by a center and radius.
    Returns a list [west, south, east, north].
    """
    if not all([center_lat, center_lon, radius_km]):
        return None

    center_point = Point(center_lat, center_lon)
    dist = distance(kilometers=radius_km)

    # Calculate destination points for northwest and southeast corners
    nw_point = dist.destination(point=center_point, bearing=315)  # 315 degrees = northwest
    se_point = dist.destination(point=center_point, bearing=135)  # 135 degrees = southeast

    # [west, south, east, north]
    return [nw_point.longitude, se_point.latitude, se_point.longitude, nw_point.latitude]


def get_points_bounds(locations):
    """
    Calculates the bounding box from a list of locations.
    Returns a list [min_lon, min_lat, max_lon, max_lat] or None.
    """
    # Ensure locations have longitude and latitude before processing
    valid_locations = [loc for loc in locations if 'longitude' in loc and 'latitude' in loc]

    if len(valid_locations) > 0:
        min_lon = min(loc['longitude'] for loc in valid_locations)
        min_lat = min(loc['latitude'] for loc in valid_locations)
        max_lon = max(loc['longitude'] for loc in valid_locations)
        max_lat = max(loc['latitude'] for loc in valid_locations)
        return [min_lon, min_lat, max_lon, max_lat]

    return None
