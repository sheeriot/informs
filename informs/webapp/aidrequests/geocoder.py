from django.conf import settings

from aidrequests.models import AidLocation

from azure.core.credentials import AzureKeyCredential
from azure.maps.search import MapsSearchClient

from geopy.distance import geodesic

from icecream import ic


class AidLocationError(Exception):
    pass


def get_azure_geocode(aid_request):
    query_address = (
        f"{aid_request.street_address} "
        f"{aid_request.city} "
        f"{aid_request.state} "
        f"{aid_request.country}"
    )
    field_op_coords = [aid_request.field_op.longitude, aid_request.field_op.latitude]

    try:
        cred = AzureKeyCredential(settings.AZURE_MAPS_KEY)
        with MapsSearchClient(credential=cred) as client:
            query_results = client.get_geocoding(query=query_address, coordinates=field_op_coords)
    except Exception as e:
        ic(e)

    features = query_results['features']
    results = {}
    results['address_searched'] = query_address

    if features:
        results['status'] = "Success"
        feature0 = query_results['features'][0]
        ic(len(features))
        # ic(feature0)
        coordinates = feature0['geometry']['coordinates']
        results['latitude'] = round(coordinates[1], 5)
        results['longitude'] = round(coordinates[0], 5)
        results['features'] = query_results['features']
        results['confidence'] = feature0['properties']['confidence']
        results['address_found'] = feature0['properties']['address']['formattedAddress']
        results['locality'] = feature0['properties']['address'].get('locality', None)
        results['neighborhood'] = feature0['properties']['address'].get('neighborhood', None)
        results['match_codes'] = feature0['properties'].get('matchCodes', None)
        results['match_type'] = feature0['properties'].get('type', None)
        districts = feature0['properties']['address'].get('adminDistricts', None)
        results['districts'] = [district['shortName'] for district in districts][::-1]

        distance = round(geodesic(
                            (aid_request.field_op.latitude, aid_request.field_op.longitude),
                            (results['latitude'], results['longitude'])
                            ).km, 2)

        results['distance'] = distance

        note = geocode_note(results)
        results['note'] = note
        results['source'] = "azure_maps"

    else:
        results['status'] = "No Match"

    return results


def geocode_note(geocode_results):
    note = (
        f"Found: {geocode_results['address_found']}\n"
        f"Confidence: {geocode_results['confidence']}\n"
        f"Distance: {geocode_results['distance']} km\n"
    )
    if geocode_results['match_type'] is not None:
        note += f"Match Type: {geocode_results['match_type']}\n"
    if geocode_results['locality'] is not None:
        note += f"Locality: {geocode_results['locality']}\n"
    if geocode_results['neighborhood'] is not None:
        note += f"Neighborhood: {geocode_results['neighborhood']}\n"
    if geocode_results['districts'] is not None:
        note += f"Districts: {str(geocode_results['districts'])}\n"
    if geocode_results['match_codes'] is not None:
        note += f"Match Codes: {geocode_results['match_codes']}\n"
    return note


def geocode_save(aid_request, geocode_results):

    aid_location = AidLocation(
        aid_request=aid_request,
        status='new',
        latitude=str(geocode_results['latitude']),
        longitude=str(geocode_results['longitude']),
        source='azure_maps',
        note=geocode_results['note'],
        address_searched=geocode_results['address_searched'],
        address_found=geocode_results['address_found'],
        distance=str(geocode_results['distance'])
    )

    try:
        aid_location.full_clean()
        aid_location.save()
        return aid_location
    except Exception as e:
        ic(e)
        raise AidLocationError(f"Could NOT Save Geocoded location!\n{e}")
