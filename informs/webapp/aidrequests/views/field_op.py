from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.urls import reverse_lazy
from django.views.generic import DetailView, CreateView, UpdateView
from django.http import HttpResponseRedirect
from ..models import FieldOp, AidRequest, AidType
from .forms import FieldOpForm
from .utils import prepare_aid_locations_for_map, locations_to_bounds
from icecream import ic
import json
from django.core.serializers.json import DjangoJSONEncoder

class FieldOpDetailView(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    permission_required = 'aidrequests.view_fieldop'
    model = FieldOp
    template_name = 'aidrequests/field_op_detail.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        field_op = self.object

        # Map data
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        context['field_op_name'] = field_op.name
        context['field_op_slug'] = field_op.slug
        context['center_lat'] = field_op.latitude
        context['center_lon'] = field_op.longitude
        context['ring_size'] = field_op.ring_size

        # Fetch related aid requests for the map
        aid_requests = AidRequest.objects.filter(field_op=field_op)
        aid_locations = prepare_aid_locations_for_map(aid_requests)
        context['aid_locations_json'] = json.dumps(aid_locations, cls=DjangoJSONEncoder)

        # We need to provide the aid types for the field op
        aid_types_data = list(field_op.aid_types.values('slug', 'name', 'description'))
        context['aid_types_json'] = json.dumps(aid_types_data)

        # Calculate map bounds from aid request locations
        context['map_bounds'] = locations_to_bounds(aid_locations)

        return context

class FieldOpCreateView(LoginRequiredMixin, PermissionRequiredMixin, CreateView):
    permission_required = 'aidrequests.add_fieldop'
    model = FieldOp
    form_class = FieldOpForm
    template_name = 'aidrequests/field_op_form.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update({
            'azure_maps_key': settings.AZURE_MAPS_KEY,
        })
        return context

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

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update({
            'azure_maps_key': settings.AZURE_MAPS_KEY,
        })
        return context

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
