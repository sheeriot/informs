from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.urls import reverse_lazy
from django.views.generic import DetailView, CreateView, UpdateView
from django.http import HttpResponseRedirect
from ..models import FieldOp
from .forms import FieldOpForm
from icecream import ic

class FieldOpDetailView(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    permission_required = 'aidrequests.view_fieldop'
    model = FieldOp
    template_name = 'aidrequests/field_op_detail.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        return context

class FieldOpCreateView(LoginRequiredMixin, PermissionRequiredMixin, CreateView):
    permission_required = 'aidrequests.add_fieldop'
    model = FieldOp
    form_class = FieldOpForm
    template_name = 'aidrequests/field_op_form.html'

    def get_success_url(self):
        return reverse_lazy('field_op_detail', kwargs={'slug': self.object.slug})

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'create'
        # Pass next URL to form if present
        next_url = self.request.GET.get('next')
        if next_url:
            if 'initial' not in kwargs:
                kwargs['initial'] = {}
            kwargs['initial']['next'] = next_url
        return kwargs

    def form_valid(self, form):
        user = self.request.user
        if user.is_authenticated:
            form.instance.created_by = user
            form.instance.updated_by = user
        return super().form_valid(form)

class FieldOpUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    permission_required = 'aidrequests.change_fieldop'
    model = FieldOp
    form_class = FieldOpForm
    template_name = 'aidrequests/field_op_form.html'

    def get_success_url(self):
        # First try to get the next URL from POST or GET
        next_url = self.request.POST.get('next') or self.request.GET.get('next')
        ic("get_success_url - next:", next_url)

        # If we have a next URL and it's not empty, use it
        if next_url and next_url.strip():
            return next_url

        # Otherwise, redirect to the detail page
        return reverse_lazy('field_op_detail', kwargs={'slug': self.object.slug})

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'update'

        # Get next URL from GET parameters
        next_url = self.request.GET.get('next')
        if next_url:
            if 'initial' not in kwargs:
                kwargs['initial'] = {}
            kwargs['initial']['next'] = next_url

        return kwargs

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        form = self.get_form()
        ic("Processing POST request")

        if form.is_valid():
            ic("Form is valid, saving...")
            return self.form_valid(form)
        else:
            ic("Form is invalid:", form.errors)
            return self.form_invalid(form)

    def form_valid(self, form):
        ic("form_valid called")
        user = self.request.user
        if user.is_authenticated:
            form.instance.updated_by = user
        form.save()
        success_url = self.get_success_url()
        ic("Redirecting to:", success_url)
        return HttpResponseRedirect(success_url)
