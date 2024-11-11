# from django.shortcuts import render, redirect
# from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.db.models import Count
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView

from ..models import FieldOp
from .forms import FieldOpForm

# from icecream import ic


# List View for FieldOp
class FieldOpListView(LoginRequiredMixin, ListView):
    model = FieldOp
    template_name = 'aidrequests/field_op_list.html'

    def get_queryset(self):
        queryset = FieldOp.objects.annotate(aidrequest_count=Count('aidrequest'))
        return queryset


# Detail View for FieldOp
class FieldOpDetailView(LoginRequiredMixin, DetailView):
    model = FieldOp
    template_name = 'aidrequests/field_op_detail.html'


# Create View for FieldOp
class FieldOpCreateView(LoginRequiredMixin, CreateView):
    model = FieldOp
    form_class = FieldOpForm
    template_name = 'aidrequests/field_op_form.html'
    success_url = reverse_lazy('field_op_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'create'  # Pass 'create' action to the form
        return kwargs


# Update View for FieldOp
class FieldOpUpdateView(LoginRequiredMixin, UpdateView):
    model = FieldOp
    form_class = FieldOpForm
    template_name = 'aidrequests/field_op_form.html'
    success_url = reverse_lazy('field_op_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'update'  # Pass 'update' action to the form
        return kwargs


# Delete View for FieldOp
class FieldOpDeleteView(LoginRequiredMixin, DeleteView):
    model = FieldOp
    template_name = 'aidrequests/field_op_confirm_delete.html'
    success_url = reverse_lazy('field_op_list')
