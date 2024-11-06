# from django.shortcuts import render, redirect
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from .models import AidRequest, RegionResponse
from .forms import AidRequestForm, RegionResponseForm

from icecream import ic


# List View for AidRequests
class AidRequestListView(LoginRequiredMixin, ListView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_list.html'

    def get_context_data(self, **kwargs):
        rrslug = self.kwargs['regionresponse']
        context = super().get_context_data(**kwargs)
        regionresponse = get_object_or_404(RegionResponse, slug=rrslug)
        context['regionresponse'] = regionresponse
        return context

    def get_queryset(self):
        rrslug = self.kwargs['regionresponse']
        regionresponse = get_object_or_404(RegionResponse, slug=rrslug)
        aidrequests = AidRequest.objects.filter(region_response_id=regionresponse.id)
        return aidrequests


# Detail View for AidRequest
class AidRequestDetailView(LoginRequiredMixin, DetailView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_detail.html'

    def get_context_data(self, **kwargs):
        rrslug = self.kwargs['regionresponse']
        context = super().get_context_data(**kwargs)
        regionresponse = get_object_or_404(RegionResponse, slug=rrslug)
        context['regionresponse'] = regionresponse
        return context


# Create View for AidRequest
class AidRequestCreateView(CreateView):
    model = AidRequest
    form_class = AidRequestForm
    template_name = 'aidrequests/aidrequest_form.html'
    success_url = reverse_lazy('home')

    def get_context_data(self, **kwargs):
        rrslug = self.kwargs['regionresponse']
        context = super().get_context_data(**kwargs)
        regionresponse = get_object_or_404(RegionResponse, slug=rrslug)
        context['regionresponse'] = regionresponse
        # context['form'] = AidRequestForm()
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'create'  # Pass 'create' action to the form
        return kwargs

    def form_valid(self, form):
        self.object = form.save()
        rrslug = self.kwargs['regionresponse']
        region_response = RegionResponse.objects.get(slug=rrslug)
        self.object.region_response = region_response
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
        return reverse_lazy('aidrequest_list', kwargs={'regionresponse': self.kwargs['regionresponse']})

    def get_context_data(self, **kwargs):
        rrslug = self.kwargs['regionresponse']
        context = super().get_context_data(**kwargs)
        regionresponse = get_object_or_404(RegionResponse, slug=rrslug)
        context['regionresponse'] = regionresponse
        return context


# Delete View for AidRequest
class AidRequestDeleteView(LoginRequiredMixin, DeleteView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_confirm_delete.html'
    # success_url = reverse_lazy('aidrequest_list')

    def get_success_url(self):
        return reverse_lazy('aidrequest_list', kwargs={'regionresponse': self.kwargs['regionresponse']})

    def get_context_data(self, **kwargs):
        ic(kwargs)
        rrslug = self.kwargs['regionresponse']
        context = super().get_context_data(**kwargs)
        regionresponse = get_object_or_404(RegionResponse, slug=rrslug)
        context['regionresponse'] = regionresponse
        return context


# List View for RegionResponse
class RegionResponseListView(LoginRequiredMixin, ListView):
    model = RegionResponse
    template_name = 'aidrequests/regionresponse_list.html'


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
