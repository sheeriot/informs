from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.urls import reverse_lazy, reverse
from django.views.generic import CreateView, UpdateView, DetailView, DeleteView, ListView
from django.conf import settings
from django.http import Http404, HttpResponseRedirect
from django.template import Template
from django.template.context import Context

from django_q.tasks import async_chain, async_task

import logging
from geopy.distance import geodesic

from ..models import AidRequest, FieldOp, AidRequestLog, AidLocation
from ..tasks import aid_request_postsave, send_cot_task
from ..forms import (
    AidRequestCreateFormA,
    RequestorInformationForm,
    AidContactInformationForm,
    LocationInformationForm,
    RequestDetailsForm,
    RequestStatusForm,
    AidRequestLogForm,
)
from .aid_request_forms_b import AidRequestCreateFormB
from .aid_request_forms_c import AidRequestCreateFormC
from .aid_location_forms import AidLocationCreateForm
from ..context_processors import get_field_op_from_kwargs
from ..geocoder import get_azure_geocode

logger = logging.getLogger(__name__)

# Create View for AidRequest
class AidRequestCreateView(CreateView):
    """ Aid Request - Create """
    model = AidRequest
    template_name = 'aidrequests/aid_request_form.html'
    success_url = reverse_lazy('home')

    FORM_CLASSES = {
        'A': AidRequestCreateFormA,
        'B': AidRequestCreateFormB,
        'C': AidRequestCreateFormC,
    }
    DEFAULT_FORM = 'C'

    def get_form_class(self):
        form_key = self.request.GET.get('form', self.DEFAULT_FORM).upper()
        return self.FORM_CLASSES.get(form_key, self.FORM_CLASSES[self.DEFAULT_FORM])

    def get_template_names(self):
        form_key = self.request.GET.get('form', self.DEFAULT_FORM).upper()
        if form_key == 'C':
            return ['aidrequests/aid_request_form_c.html']
        return super().get_template_names()

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.field_op, self.fieldop_slug = get_field_op_from_kwargs(kwargs)
        if not self.field_op:
            raise Http404("Field operation not found")
        # ic(f"Setup AidRequestCreateView for field_op: {self.fieldop_slug}")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['fieldop_slug'] = self.fieldop_slug
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        context['hide_auth_header_items'] = True
        if self.object is None:
            context['New'] = True
        else:
            context['New'] = False
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        kwargs['initial'] = {
            'field_op': self.field_op.pk,
            'fieldop_slug': self.fieldop_slug
        }
        return kwargs

    def get(self, request, *args, **kwargs):
        self.field_op = get_object_or_404(FieldOp, slug=self.kwargs.get('field_op'))
        self.fieldop_slug = self.field_op.slug
        # ic(f"Setup AidRequestCreateView for field_op: {self.fieldop_slug}")
        return super().get(request, *args, **kwargs)

    def get_initial(self):
        initial = super().get_initial()
        initial['field_op'] = self.field_op.pk
        initial['fieldop_slug'] = self.fieldop_slug
        return initial

    def form_valid(self, form):
        self.object = form.save(commit=False)
        self.object.field_op = get_object_or_404(FieldOp, slug=self.kwargs['field_op'])

        # ic(form.cleaned_data)

        if self.request.user.is_authenticated:
            self.object.requestor_first_name = self.request.user.first_name
            self.object.requestor_last_name = self.request.user.last_name
        else:
            self.object.created_by = None
            self.object.updated_by = None

        self.object.save()

        latitude = form.cleaned_data.get('latitude')
        longitude = form.cleaned_data.get('longitude')
        location_note = form.cleaned_data.get('location_note')
        location_source = form.cleaned_data.get('location_source')

        task_name = f"AR{self.object.pk}_postsave"
        async_task('aidrequests.tasks.aid_request_postsave',
            self.object,
            is_new=True,
            latitude=latitude,
            longitude=longitude,
            location_note=location_note,
            location_source=location_source,
            task_name=task_name,
        )

        # Redirect to the list view for this field_op after creating
        self.success_url = reverse_lazy('aid_request_submitted', kwargs={'field_op': self.fieldop_slug, 'pk': self.object.pk})
        return super().form_valid(form)

    def form_invalid(self, form):
        # ic("Form is invalid, rendering again with errors.")
        # ic(form.errors.as_json())
        return super().form_invalid(form)


# Update View for AidRequest
class AidRequestUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    model = AidRequest
    form_class = RequestorInformationForm  # Default form, though we use multiple
    permission_required = 'aidrequests.change_aidrequest'
    template_name = 'aidrequests/aid_request_update.html'

    def dispatch(self, request, *args, **kwargs):
        self.object = self.get_object()
        self.field_op = self.object.field_op
        self.fieldop_slug = self.field_op.slug
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['MEDIA_URL'] = settings.MEDIA_URL
        context['AZURE_MAPS_KEY'] = settings.AZURE_MAPS_KEY

        # URLs for javascript actions
        context['url_partial_update'] = reverse('aid_request_ajax_update', kwargs={'field_op': self.field_op.slug, 'pk': self.object.pk})
        context['url_regenerate_map'] = reverse('static_map_regenerate', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})
        context['url_delete_location'] = reverse('api_aid_location_delete', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})
        context['url_update_location_status'] = reverse('aid_location_status_update', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})
        context['url_check_map_status'] = reverse('check_map_status', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})

        # Get locations and sort them
        all_locations = self.object.locations.all()
        status_order = {'confirmed': 0, 'new': 1, 'candidate': 2, 'rejected': 3, 'other': 4}
        sorted_locations = sorted(
            all_locations,
            key=lambda loc: (status_order.get(loc.status, 99), -loc.created_at.timestamp())
        )
        context['locations'] = sorted_locations

        # Add Location Form
        context['add_location_form'] = AidLocationCreateForm(field_op_obj=self.field_op, initial={
            'field_op': self.fieldop_slug,
            'aid_request': self.object.pk,
            'country': self.field_op.country,
            'status': 'new',
            'source': 'manual'
        })

        instance = self.object
        context['requestor_form'] = RequestorInformationForm(instance=instance)
        context['location_form'] = LocationInformationForm(instance=instance)
        context['details_form'] = RequestDetailsForm(instance=instance)
        context['aid_contact_form'] = AidContactInformationForm(instance=instance)
        context['status_form'] = RequestStatusForm(instance=instance)
        context['log_form'] = AidRequestLogForm(initial={'aid_request': self.object.pk})

        return context

    def get_success_url(self):
        return reverse_lazy('aid_request_update', kwargs={'pk': self.object.pk, 'field_op': self.object.field_op.slug})

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        if 'initial' not in kwargs:
            kwargs['initial'] = {}
        kwargs['initial']['fieldop_slug'] = self.fieldop_slug
        return kwargs

    def form_valid(self, form):
        # This method will no longer be used for standard form submissions,
        # as updates will be handled by the AJAX view.
        # We can leave it for now or remove it if we are sure it's not needed.
        return super().form_valid(form)


class AidRequestLogCreateView(LoginRequiredMixin, CreateView):
    """ Aid Request Log - Create """
    model = AidRequestLog
    form_class = AidRequestLogForm

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        # custom setup
        self.field_op, self.fieldop_slug = get_field_op_from_kwargs(kwargs)
        if not self.field_op:
            raise Http404("Field operation not found")
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])

    def get_success_url(self):
        return reverse('aid_request_detail',
                       kwargs={
                           'field_op': self.fieldop_slug,
                           'pk': self.aid_request.pk}
                       )

    def form_valid(self, form):
        self.object = form.save(commit=False)
        user = self.request.user
        if user.is_authenticated:
            self.object.created_by = user
            self.object.updated_by = user
        else:
            self.object.created_by = None
            self.object.updated_by = None
        self.object.save()
        return HttpResponseRedirect(self.get_success_url())

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {
            'aid_request': self.aid_request.pk,
            'fieldop_slug': self.fieldop_slug
        }
        return kwargs


def has_location_status(aid_request, status):
    """
    Check if any of the aid_request locations have the matching status.

    :param aid_request: The AidRequest instance to check.
    :param status: location status you seek
    :return: found (boolean), and locations list
    """
    found = aid_request.locations.filter(status=status).exists()
    locations = aid_request.locations.filter(status=status)
    return found, locations


def geodist(aid_request):
    if any([aid_request.latitude, aid_request.longitude, aid_request.field_op.latitude,
            aid_request.field_op.longitude]) is None:
        return None

    return round(
        geodesic(
            (aid_request.latitude, aid_request.longitude),
            (aid_request.field_op.latitude, aid_request.field_op.longitude)
            ).km, 1)


def format_aid_location_note(aid_location):
    """
    Renders an HTML-formatted note for a given AidLocation object.
    """
    if not aid_location:
        return ""

    template_string = """
        <strong>{{ aid_location.get_status_display }}</strong>
        {% if aid_location.distance %}
            ({{ aid_location.distance }} km from FieldOp)
        {% endif %}
        - {{ aid_location.created_at|date:'Y-m-d H:i' }}
    """
    template = Template(template_string)
    context = {'aid_location': aid_location}
    return template.render(Context(context))
