"""
Location-related views for the aidrequests app.
"""
import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
import json

@csrf_exempt
@require_POST
def geocode_address(request, field_op):
    """
    Geocode an address using Azure Maps and return the coordinates.
    """
    try:
        data = json.loads(request.body)
        address = data.get('address')

        if not address:
            return JsonResponse({'error': 'Address is required'}, status=400)

        subscription_key = settings.AZURE_MAPS_KEY
        if not subscription_key:
            return JsonResponse({'error': 'Azure Maps key is not configured'}, status=500)

        url = f'https://atlas.microsoft.com/search/address/json'
        params = {
            'api-version': '1.0',
            'subscription-key': subscription_key,
            'query': address
        }

        response = requests.get(url, params=params)
        response.raise_for_status()  # Raise an exception for bad status codes

        results = response.json().get('results', [])
        if results:
            location = results[0]['position']
            return JsonResponse({'latitude': location['lat'], 'longitude': location['lon']})
        else:
            return JsonResponse({'error': 'Address not found'}, status=404)

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except requests.exceptions.RequestException as e:
        return JsonResponse({'error': str(e)}, status=500)
    except Exception as e:
        return JsonResponse({'error': f'An unexpected error occurred: {str(e)}'}, status=500)
