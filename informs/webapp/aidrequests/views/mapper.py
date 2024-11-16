# from django.shortcuts import render, redirect
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
# from django.urls import reverse_lazy
from django.conf import settings
from django.views.generic import DetailView
# from django.http import JsonResponse

import requests
# import json
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

        query_address = f"{self.object.street_address}, {self.object.city}"
        query_address += f", {self.object.state}, {self.object.zip_code}"
        ic(query_address)

        params = {
            "api-version": "2023-06-01",
            "query": query_address,
            "coordinates": str(self.object.field_op.latitude) + "," + str(self.object.field_op.longitude)
        }
        ic(params)
        
        headers = {
            "Subscription-Key": azure_maps_key
        }
        try:
            response = requests.get(endpoint, params=params, headers=headers)
            response.raise_for_status()  # Raise an exception for HTTP errors

            return response.json()

        except requests.RequestException as e:
            return {"error": str(e)}

    def get_context_data(self, **kwargs):
        """ Add Action and Field_Op """

        context = super().get_context_data(**kwargs)
        action = self.request.GET.get('action') or None
        field_op_slug = self.kwargs['field_op']
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        context['action'] = action
        if action == 'search':
            action_results = self.check_address_azure()
            context['action_summary'] = action_results['summary']
            results = sorted(action_results['results'], key=lambda x: x['score'], reverse=True)
            context['action_results'] = results

        elif action == 'geocode':
            action_results = self.geocode_address_azure()
            ic(action_results)

        return context
