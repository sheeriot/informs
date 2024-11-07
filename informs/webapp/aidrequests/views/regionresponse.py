# from django.shortcuts import render, redirect
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.db.models import Count
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView

from ..models import RegionResponse
from .forms import RegionResponseForm

# from icecream import ic


# List View for RegionResponse
class RegionResponseListView(LoginRequiredMixin, ListView):
    model = RegionResponse
    template_name = 'aidrequests/regionresponse_list.html'

    def get_queryset(self):
        queryset = RegionResponse.objects.annotate(aidrequest_count=Count('aidrequest'))
        return queryset


# Detail View for RegionResponse
class RegionResponseDetailView(LoginRequiredMixin, DetailView):
    model = RegionResponse
    template_name = 'aidrequests/regionresponse_detail.html'


# Create View for RegionResponse
class RegionResponseCreateView(LoginRequiredMixin, CreateView):
    model = RegionResponse
    form_class = RegionResponseForm
    template_name = 'aidrequests/regionresponse_form.html'
    success_url = reverse_lazy('regionresponse_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'create'  # Pass 'create' action to the form
        return kwargs


# Update View for RegionResponse
class RegionResponseUpdateView(LoginRequiredMixin, UpdateView):
    model = RegionResponse
    form_class = RegionResponseForm
    template_name = 'aidrequests/regionresponse_form.html'
    success_url = reverse_lazy('regionresponse_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'update'  # Pass 'update' action to the form
        return kwargs


# Delete View for RegionResponse
class RegionResponseDeleteView(LoginRequiredMixin, DeleteView):
    model = RegionResponse
    template_name = 'aidrequests/regionresponse_confirm_delete.html'
    success_url = reverse_lazy('regionresponse_list')
