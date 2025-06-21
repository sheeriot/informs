"""
Location-related views for the aidrequests app.
"""
import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
import json

from ..geocoder import get_azure_geocode
from ..context_processors import get_field_op_from_kwargs
from ..models import AidRequest

@csrf_exempt
@require_POST
def geocode_address(request, field_op):
    """
    Geocode an address using Azure Maps and return the full results.
    """
    try:
        field_op_obj, _ = get_field_op_from_kwargs({'field_op': field_op})
        if not field_op_obj:
            return JsonResponse({'error': 'Field Operation not found'}, status=404)

        data = json.loads(request.body)
        street = data.get('street_address', '')
        city = data.get('city', '')
        state = data.get('state', '')

        # Create a temporary AidRequest object to pass to the geocoder
        temp_aid_request = AidRequest(
            field_op=field_op_obj,
            street_address=street,
            city=city,
            state=state,
            country=field_op_obj.country
        )

        geocode_results = get_azure_geocode(temp_aid_request)

        if geocode_results.get('status') == 'Success':
            # We don't want to send all the features back, just the essentials
            geocode_results.pop('features', None)
            return JsonResponse(geocode_results)
        else:
            return JsonResponse({'error': geocode_results.get('status', 'Geocoding failed')}, status=400)

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': f'An unexpected error occurred: {str(e)}'}, status=500)
