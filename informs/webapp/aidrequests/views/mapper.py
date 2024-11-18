from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.conf import settings
from django.views.generic import DetailView

from azure.core.credentials import AzureKeyCredential
from azure.maps.search import MapsSearchClient
from azure.core.exceptions import HttpResponseError
import requests

from geopy.distance import geodesic

from ..models import AidRequest, FieldOp

from icecream import ic


def geodist(aid_request):
    if any([aid_request.latitude, aid_request.longitude, aid_request.field_op.latitude,
            aid_request.field_op.longitude]) is None:
        return None

    return round(
        geodesic(
            (aid_request.latitude, aid_request.longitude),
            (aid_request.field_op.latitude, aid_request.field_op.longitude)
            ).km,
        1)


class AddressValidationView(LoginRequiredMixin, DetailView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_addresser.html'
    """
    A Django class-based view for validating addresses using Azure Maps.
    """

    def check_address_azure(self):
        """
        Validate an address using Azure Maps API.

        :param address: The address string to validate.
        :return: A dictionary containing the response from Azure Maps.
        """
        azure_maps_key = settings.AZURE_MAPS_KEY
        # ic(azure_maps_key)
        if not azure_maps_key:
            return {"error": "Azure Maps key is not configured."}

        endpoint = "https://atlas.microsoft.com/search/address/json"

        query_address = f"{self.object.street_address}, {self.object.city}"
        query_address += f", {self.object.state}, {self.object.zip_code}, {self.object.country}"

        params = {
            "api-version": "1.0",
            "subscription-key": azure_maps_key,
            "query": query_address,
            "lat": self.object.field_op.latitude,
            "lon": self.object.field_op.longitude
        }

        try:
            response = requests.get(endpoint, params=params)
            response.raise_for_status()  # Raise an exception for HTTP errors

            return response.json()
        except requests.RequestException as e:
            return {"error": str(e)}

    def geocode_address_azure(self):
        """
        Validate an address using Azure Maps API.

        :param address: The address string to validate.
        :return: A dictionary containing the response from Azure Maps.
        """
        azure_maps_key = settings.AZURE_MAPS_KEY
        # ic(azure_maps_key)
        if not azure_maps_key:
            return {"error": "Azure Maps key is not configured."}

        endpoint = "https://atlas.microsoft.com/geocode"

        query_address = f"{self.object.street_address} {self.object.city} {self.object.state} {self.object.country}"
        ic(query_address)
        params = {
            "api-version": "2023-06-01",
            "query": query_address,
            "coordinates": str(self.object.field_op.longitude) + "," + str(self.object.field_op.latitude)
        }

        headers = {
            "Subscription-Key": azure_maps_key
        }

        try:
            response = requests.get(endpoint, params=params, headers=headers)
            response.raise_for_status()  # Raise an exception for HTTP errors

            return response.json(), query_address

        except requests.RequestException as e:
            return {"error": str(e)}

    def getAddressGeocode(self):
        map_cred = AzureKeyCredential(settings.AZURE_MAPS_KEY)
        maps_search_client = MapsSearchClient(credential=map_cred,)
        query_address = f"{self.object.street_address} {self.object.city} {self.object.state} {self.object.country}"
        # ic(query_address)
        field_op_coords = [self.object.field_op.longitude,self.object.field_op.latitude]
        results = {"status": None}
        try:
            query_results = maps_search_client.get_geocoding(query=query_address, coordinates = field_op_coords)

            if query_results.get('features', False):
                results['status'] = "Success"
                coordinates = query_results['features'][0]['geometry']['coordinates']
                results['latitude'] = coordinates[1]
                results['longitude'] = coordinates[0]
                results['features'] = query_results['features']
                results['confidence'] = query_results['features'][0]['properties']['confidence']
                results['found_address'] = query_results['features'][0]['properties']['address']['formattedAddress']
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

    def get_context_data(self, **kwargs):
        """ Add Action and Field_Op """

        context = super().get_context_data(**kwargs)
        action = self.request.GET.get('action') or None
        field_op_slug = self.kwargs['field_op']
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        context['action'] = action

        # Geocode this address
        geocode_results = self.getAddressGeocode()
        dist = geodesic((geocode_results['latitude'], geocode_results['longitude']), (self.object.field_op.latitude, self.object.field_op.longitude)).km
        context['latitude'] = geocode_results['latitude']
        context['longitude'] = geocode_results['longitude']
        context['confidence'] = geocode_results['confidence']
        context['distance'] = dist
        context['found_address'] = geocode_results['found_address']
        ic(geocode_results['features'])

        if action == 'search':
            action_results = self.check_address_azure()
            context['action_summary'] = action_results['summary']
            results = sorted(action_results['results'], key=lambda x: x['score'], reverse=True)
            context['results'] = results

        elif action == 'geocode':
            action_results, query_address = self.geocode_address_azure()
            context["query_address"] = query_address
            features = action_results['features']
            for feature in features:
                lat1 = feature['geometry']['coordinates'][1]
                lon1 = feature['geometry']['coordinates'][0]
                lat2 = self.object.field_op.latitude
                lon2 = self.object.field_op.longitude
                feature['distance'] = geodesic((lat1, lon1), (lat2, lon2)).km
            context['features'] = features

        return context
