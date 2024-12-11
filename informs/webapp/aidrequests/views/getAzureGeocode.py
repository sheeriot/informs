from azure.core.credentials import AzureKeyCredential
from azure.maps.search import MapsSearchClient
from azure.core.exceptions import HttpResponseError

from django.conf import settings

from time import sleep
from geopy.distance import geodesic

# from icecream import ic


def getAddressGeocode(self):
    map_cred = AzureKeyCredential(settings.AZURE_MAPS_KEY)
    maps_search_client = MapsSearchClient(credential=map_cred,)
    query_address = (
        f"{self.street_address} "
        f"{self.city} "
        f"{self.state} "
        f"{self.country}"
    )
    field_op_coords = [self.field_op.longitude, self.field_op.latitude]
    results = {"status": None}
    try:
        query_results = maps_search_client.get_geocoding(query=query_address, coordinates=field_op_coords)

        if query_results.get('features', False):
            results['status'] = "Success"
            feature0 = query_results['features'][0]
            # ic(feature0)
            coordinates = feature0['geometry']['coordinates']
            results['latitude'] = round(coordinates[1], 5)
            results['longitude'] = round(coordinates[0], 5)
            results['features'] = query_results['features']
            results['confidence'] = feature0['properties']['confidence']
            results['found_address'] = feature0['properties']['address']['formattedAddress']
            results['locality'] = feature0['properties']['address'].get('locality', None)
            results['neighborhood'] = feature0['properties']['address'].get('neighborhood', None)
            results['match_codes'] = feature0['properties'].get('match_codes', None)
            results['match_type'] = feature0['properties'].get('type', None)
            districts = feature0['properties']['address'].get('adminDistricts', None)
            results['districts'] = [district['shortName'] for district in districts][::-1]

            distance = round(geodesic(
                                (self.field_op.latitude, self.field_op.longitude),
                                (results['latitude'], results['longitude'])
                                ).km, 1)
            results['distance'] = distance
            note = geocode_note(results)
            results['note'] = note
        else:
            results['status'] = "No Matches"

    except HttpResponseError as exception:
        if exception.error is not None:
            return exception.error.code, exception.error.message
        results['status'] = "HttpError"
        results['error_code'] = exception.error.code
        results['error_message'] = exception.error.message

    # check for blocking
    sleep(20)
    return results


def geocode_note(geocode_results):
    note = (
        f"Found: {geocode_results['found_address']}\n"
        f"Distance: {geocode_results['distance']} km\n"
        f"Confidence: {geocode_results['confidence']}\n"
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
