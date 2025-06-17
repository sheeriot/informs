import json
from django.core.serializers.json import DjangoJSONEncoder

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
                'requester_name': ar.requester_name or 'N/A',
            })
    return aid_locations

def locations_to_bounds(aid_locations):
    """
    Calculates the bounding box from a list of aid locations.
    Returns a list [min_lon, min_lat, max_lon, max_lat] or a
    fallback for the javascript if not enough points are available.
    """
    locations_with_coords = [loc for loc in aid_locations if loc.get('location')]
    if len(locations_with_coords) > 1:
        min_lon = min(loc['location']['longitude'] for loc in locations_with_coords)
        min_lat = min(loc['location']['latitude'] for loc in locations_with_coords)
        max_lon = max(loc['location']['longitude'] for loc in locations_with_coords)
        max_lat = max(loc['location']['latitude'] for loc in locations_with_coords)
        return [min_lon, min_lat, max_lon, max_lat]
    else:
        # Fallback for JS to use center and ring size
        return [0, 0, 0, 0]
