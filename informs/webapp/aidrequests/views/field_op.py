from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.urls import reverse_lazy, reverse
from django.views.generic import DetailView, CreateView, UpdateView
from django.http import HttpResponseRedirect, HttpResponse
from django_q.tasks import async_task
from ..models import FieldOp, AidRequest
from ..forms import FieldOpForm
from .utils import prepare_aid_locations_for_map, locations_to_bounds
from .maps import staticmap_fieldop
from icecream import ic
import json
import base64
from django.core.serializers.json import DjangoJSONEncoder
from django.shortcuts import get_object_or_404


def field_op_static_map(request, slug):
    """Generate and return a static map image for a FieldOp."""
    field_op = get_object_or_404(FieldOp, slug=slug)
    map_content = staticmap_fieldop(
        latitude=field_op.latitude,
        longitude=field_op.longitude,
        zoom=10  # A reasonable default zoom
    )
    if map_content:
        return HttpResponse(map_content, content_type='image/png')
    # Return a placeholder or error image if map generation fails
    return HttpResponse(status=500)


class FieldOpDetailView(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    permission_required = 'aidrequests.view_fieldop'
    model = FieldOp
    template_name = 'aidrequests/field_op_detail.html'
    slug_url_kwarg = 'field_op'
    slug_field = 'slug'

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

        # ic("FieldOpDetailView map config:", {
        #     'azure_maps_key': bool(context.get('azure_maps_key')),
        #     'center_lat': context.get('center_lat'),
        #     'center_lon': context.get('center_lon'),
        #     'ring_size': context.get('ring_size'),
        # })

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
        return reverse_lazy('field_op_detail', kwargs={'field_op': self.object.slug})

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

        response = super().form_valid(form)

        if not self.object.disable_cot:
            async_task(
                'aidrequests.tasks.send_cot_task',
                field_op_slug=self.object.slug,
                mark_type='field_op',
                task_name=f"Send_CoT_FieldOp_{self.object.slug}"
            )

        return response

class FieldOpUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    permission_required = 'aidrequests.change_fieldop'
    model = FieldOp
    form_class = FieldOpForm
    template_name = 'aidrequests/field_op_form.html'
    slug_url_kwarg = 'slug'
    slug_field = 'slug'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        field_op = self.get_object()
        context.update({
            'azure_maps_key': settings.AZURE_MAPS_KEY,
            'geocode_url': reverse('geocode_address', kwargs={'field_op': field_op.slug}),
        })

        # For the update view, generate a static map of the current location
        map_png_data = staticmap_fieldop(
            latitude=field_op.latitude,
            longitude=field_op.longitude,
            zoom=12
        )
        # ic("FieldOpUpdateView: staticmap_fieldop returned image data?", bool(map_png_data))

        if map_png_data:
            context['static_map_url'] = f"data:image/png;base64,{base64.b64encode(map_png_data).decode('utf-8')}"

        # ic("FieldOpUpdateView: static_map_url is set?", 'static_map_url' in context)

        return context

    def get_success_url(self):
        # First try to get the next URL from POST or GET
        next_url = self.request.POST.get('next') or self.request.GET.get('next')
        ic("get_success_url - next:", next_url)

        # If we have a next URL and it's not empty, use it
        if next_url and next_url.strip():
            return next_url

        # Otherwise, redirect to the detail page
        return reverse_lazy('field_op_detail', kwargs={'field_op': self.object.slug})

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['action'] = 'update'

        # Get next URL from GET parameters or from referrer
        next_url = self.request.GET.get('next')
        if not next_url:
            next_url = self.request.META.get('HTTP_REFERER')

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

        if not self.object.disable_cot:
            async_task(
                'aidrequests.tasks.send_cot_task',
                field_op_slug=self.object.slug,
                mark_type='field_op',
                task_name=f"Send_CoT_FieldOp_{self.object.slug}"
            )

        success_url = self.get_success_url()
        ic("Redirecting to:", success_url)
        return HttpResponseRedirect(success_url)
