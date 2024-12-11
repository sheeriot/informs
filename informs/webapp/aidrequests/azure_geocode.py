from azure.core.credentials import AzureKeyCredential
# from azure.core.pipeline.transport import AsyncHttpTransport
from azure.maps.search import MapsSearchClient


from django.conf import settings

# import asyncio
from geopy.distance import geodesic
# from time import perf_counter as timer

from icecream import ic


def get_azure_geocode(self):
    query_address = (
        f"{self.street_address} "
        f"{self.city} "
        f"{self.state} "
        f"{self.country}"
    )
    field_op_coords = [self.field_op.longitude, self.field_op.latitude]

    try:
        cred = AzureKeyCredential(settings.AZURE_MAPS_KEY)

        # ic(f'Start Geocode:\n @ {round((timer() - geocode_start), 5)}s')
        with MapsSearchClient(credential=cred) as client:
            query_results = client.get_geocoding(query=query_address, coordinates=field_op_coords)
    except Exception as e:
        ic(e)
        return e

    # ic(f'Got Geocode:\n @ {round((timer() - geocode_start), 5)}s')
    features = query_results.get('features', False)
    results = {}
    if features:
        results['status'] = "Success"
        # ic(f'Result Count (features): {len(features)}')
        # ic(features)
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
