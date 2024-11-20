# from django.shortcuts import render, redirect
# from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.db.models import Count
from django.views.generic import ListView, DetailView, CreateView, UpdateView

from ..models import FieldOp
from .forms import FieldOpForm

# from icecream import ic


# List View for FieldOp
class FieldOpListView(LoginRequiredMixin, ListView):
    model = FieldOp
    template_name = 'aidrequests/field_op_list.html'

    def get_queryset(self):
        # queryset = FieldOp.objects.annotate(aidrequest_count=Count('aid_requests'))
        queryset = FieldOp.objects.annotate(aidrequest_count=Count('aid_requests'))
        # ic(queryset)
        return queryset


# Detail View for FieldOp
class FieldOpDetailView(LoginRequiredMixin, DetailView):
    model = FieldOp
    template_name = 'aidrequests/field_op_detail.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['aid_request_count'] = self.object.aid_requests.count()
        return context


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

    def form_valid(self, form):
        user = self.request.user
        if user.is_authenticated:
            form.instance.created_by = user
            form.instance.updated_by = user
        else:
            form.instance.created_by = None
            form.instance.updated_by = None
        return super().form_valid(form)


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

    def form_valid(self, form):
        user = self.request.user
        if user.is_authenticated:
            form.instance.updated_by = user
        else:
            form.instance.updated_by = None
        return super().form_valid(form)
