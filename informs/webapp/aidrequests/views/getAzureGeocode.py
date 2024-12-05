from azure.core.credentials import AzureKeyCredential
from azure.maps.search import MapsSearchClient
from azure.core.exceptions import HttpResponseError

from django.conf import settings

from icecream import ic


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
            ic(query_results['features'][0]['properties'])
            results['status'] = "Success"
            coordinates = query_results['features'][0]['geometry']['coordinates']
            results['latitude'] = round(coordinates[1], 5)
            results['longitude'] = round(coordinates[0], 5)
            results['features'] = query_results['features']

            results['confidence'] = query_results['features'][0]['properties']['confidence']
            results['found_address'] = query_results['features'][0]['properties']['address']['formattedAddress']
            results['locality'] = query_results['features'][0]['properties']['address'].get('locality', None)
            results['neighborhood'] = query_results['features'][0]['properties']['address'].get('neighborhood', None)
            results['match_codes'] = query_results['features'][0]['properties'].get('match_codes', None)
            results['match_type'] = query_results['features'][0]['properties'].get('type', None)
            return results
        else:
            results['status'] = "No Matches"
            return results

    except HttpResponseError as exception:
        if exception.error is not None:
            return exception.error.code, exception.error.message
        results['status'] = "HttpError"
        results['error_code'] = exception.error.code
        results['error_message'] = exception.error.message
        return results
