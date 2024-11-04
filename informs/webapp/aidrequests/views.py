# from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from .models import AidRequest
from .forms import AidRequestForm


# List View for AidRequests
class AidRequestListView(LoginRequiredMixin, ListView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_list.html'


# Detail View for AidRequest
class AidRequestDetailView(LoginRequiredMixin, DetailView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_detail.html'


# Create View for AidRequest
class AidRequestCreateView(CreateView):
    model = AidRequest
    form_class = AidRequestForm
    template_name = 'aidrequests/aidrequest_form.html'
    success_url = reverse_lazy('aidrequest_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'create'  # Pass 'create' action to the form
        return kwargs


# Update View for AidRequest
class AidRequestUpdateView(LoginRequiredMixin, UpdateView):
    model = AidRequest
    form_class = AidRequestForm
    template_name = 'aidrequests/aidrequest_form.html'
    success_url = reverse_lazy('aidrequest_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'update'  # Pass 'create' action to the form
        return kwargs


# Delete View for AidRequest
class AidRequestDeleteView(LoginRequiredMixin, DeleteView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_confirm_delete.html'
    success_url = reverse_lazy('aidrequest_list')
