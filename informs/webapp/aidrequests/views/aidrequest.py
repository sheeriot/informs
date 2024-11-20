# from django.shortcuts import render, redirect
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
# from django.conf import settings
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
# from django.http import JsonResponse

# import requests
# import json
from geopy.distance import geodesic

from ..models import AidRequest, FieldOp
from .forms import AidRequestForm
from .geocode_form import AidLocationForm
from .getAzureGeocode import getAddressGeocode

from icecream import ic


def has_confirmed_location(aid_request):
    """
    Check if any of the aid_request locations has status 'confirmed'.

    :param aid_request: The AidRequest instance to check.
    :return: True if any location has status 'confirmed', False otherwise.
    """
    return aid_request.locations.filter(status='confirmed').exists()


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
    location_form = 'geocode_form'

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        if hasattr(self, "get") and not hasattr(self, "head"):
            self.head = self.get
        self.request = request
        self.args = args
        self.kwargs = kwargs

        # custom setup
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])

        if has_confirmed_location(self.aid_request):
            ic('location confirmed')
            self.confirmed = True
        else:
            ic('no geocoded address')
            self.geocode_results = getAddressGeocode(self.aid_request)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['aid_request'] = object
        context['locations'] = self.aid_request.locations.all()

        context['location_confirmed'] = getattr(self, 'confirmed', False)

        if hasattr(self, 'geocode_results'):
            distance = round(geodesic(
                (self.geocode_results['latitude'], self.geocode_results['longitude']),
                (self.field_op.latitude, self.field_op.longitude)
                ).km, 1)

            note = (
                f"{self.geocode_results['found_address']}\n"
                f"Distance: {distance} km\n"
                f"Confidence: {self.geocode_results['confidence']}\n"
                f"Match Type: {self.geocode_results['match_type']}\n"
                f"Match Codes: {self.geocode_results['match_codes']}\n"
                )

            initial_data = {
                'field_op': self.field_op.slug,
                'aid_request': self.aid_request.pk,
                'latitude': self.geocode_results['latitude'],
                'longitude': self.geocode_results['longitude'],
                'status': 'confirmed',
                'source': 'azure_maps',
                'note': note,
                }
            context['geocode_form'] = AidLocationForm(initial=initial_data)

        ic(context)
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
