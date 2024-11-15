# from django.shortcuts import render, redirect
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.conf import settings
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
# from django.http import JsonResponse

import requests
import json
from geopy.distance import geodesic

from ..models import AidRequest, FieldOp
from .forms import AidRequestForm

from icecream import ic


def geodist(aid_request):
    if any([aid_request.latitude, aid_request.longitude, aid_request.field_op.latitude,
            aid_request.field_op.longitude]) is None:
        return None
    return round(geodesic(
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
        params = {
            "api-version": "1.0",
            "subscription-key": azure_maps_key,
            "query": self.object.street_address + " " + self.object.city + " " + self.object.state,
        }

        try:
            response = requests.get(endpoint, params=params)
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

        action_result = self.check_address_azure()

        context['action_summary'] = action_result['summary']
        context['action_results'] = action_result['results']

        return context


# List View for AidRequests
class AidRequestListView(LoginRequiredMixin, ListView):
    """ list the aid requests"""
    model = AidRequest
    template_name = 'aidrequests/aidrequest_list.html'

    def get_context_data(self, **kwargs):
        field_op_slug = self.kwargs['field_op']
        context = super().get_context_data(**kwargs)
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        # context['map'] = generate_map(self.get_queryset())
        return context

    def get_queryset(self):
        field_op_slug = self.kwargs['field_op']
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        aidrequests = AidRequest.objects.filter(field_op_id=field_op.id)
        return aidrequests


# Detail View for AidRequest
class AidRequestDetailView(LoginRequiredMixin, DetailView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_detail.html'

    def get_context_data(self, **kwargs):
        field_op_slug = self.kwargs['field_op']
        context = super().get_context_data(**kwargs)
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        return context


# Create View for AidRequest
class AidRequestCreateView(CreateView):
    """ Aid Request - Create """
    model = AidRequest
    form_class = AidRequestForm
    template_name = 'aidrequests/aidrequest_form.html'
    success_url = reverse_lazy('home')

    def get_context_data(self, **kwargs):
        field_op_slug = self.kwargs['field_op']
        context = super().get_context_data(**kwargs)
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        # context['form'] = AidRequestForm()
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'create'  # Pass 'create' action to the form
        return kwargs

    def form_valid(self, form):
        self.object = form.save()
        field_op_slug = self.kwargs['field_op']
        field_op = FieldOp.objects.get(slug=field_op_slug)
        self.object.field_op = field_op
        # distance = geodist(self.object)
        # if distance is not None and distance > 200:
        #     form.add_error(None, 'The Aid Request is more than 200 km away from the Field Op.')
        #     return self.form_invalid(form)
        self.object.save()
        return super().form_valid(form)


# Update View for AidRequest
class AidRequestUpdateView(LoginRequiredMixin, UpdateView):
    model = AidRequest
    form_class = AidRequestForm
    template_name = 'aidrequests/aidrequest_form.html'
    # success_url = reverse_lazy('aidrequest_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'update'  # Pass 'create' action to the form
        return kwargs

    def get_success_url(self):
        return reverse_lazy('aidrequest_list', kwargs={'field_op': self.kwargs['field_op']})

    def get_context_data(self, **kwargs):
        field_op_slug = self.kwargs['field_op']
        context = super().get_context_data(**kwargs)
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        return context

    def form_valid(self, form):
        self.object = form.save()
        field_op_slug = self.kwargs['field_op']
        field_op = FieldOp.objects.get(slug=field_op_slug)
        self.object.field_op = field_op
        # distance = geodist(self.object)
        # if distance is not None and distance > 200:
        #     form.add_error(None, 'The Aid Request is more than 200 km away from the Field Op.')
        #     return self.form_invalid(form)
        self.object.save()
        return super().form_valid(form)


# Delete View for AidRequest
class AidRequestDeleteView(LoginRequiredMixin, DeleteView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_confirm_delete.html'
    # success_url = reverse_lazy('aidrequest_list')

    def get_success_url(self):
        return reverse_lazy('aidrequest_list', kwargs={'field_op': self.kwargs['field_op']})

    def get_context_data(self, **kwargs):
        field_op_slug = self.kwargs['field_op']
        context = super().get_context_data(**kwargs)
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        return context
