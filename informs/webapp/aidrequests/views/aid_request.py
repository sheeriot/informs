from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.urls import reverse_lazy, reverse
from django.views.generic import CreateView, UpdateView
from django.conf import settings

from django_q.tasks import async_chain

from geopy.distance import geodesic
from jinja2 import Template

from ..models import AidRequest, FieldOp, AidRequestLog, AidLocation
from ..tasks import aid_request_postsave, send_cot_task
from .aid_request_forms import AidRequestCreateForm, AidRequestUpdateForm, AidRequestLogForm
from ..context_processors import get_field_op_from_kwargs

from icecream import ic


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
    Format a text string using Jinja2 and aid_location data.

    :param aid_location: The AidLocation instance to format.
    :return: Formatted text string.
    """
    if aid_location.source == "azure_maps":
        template_str = "Geocode Note:\n{{ aid_location.note }}"
    elif aid_location.source == "manual":
        template_str = """
        Aid Location Details:
        ---------------------
        ID: {{ aid_location.pk }}
        Source: {{ aid_location.source }}
        Created: {{ aid_location.created_at.strftime('%Y-%m-%d %H:%M') }}
        By: {{ aid_location.created_by }}
        """
        template_str = "\n".join([line.strip() for line in template_str.split('\n')])
    else:
        template_str = "Location Note:\n{{ aid_location.note }}"

    template = Template(template_str)
    return template.render(aid_location=aid_location)


# Create View for AidRequest
class AidRequestCreateView(CreateView):
    """ Aid Request - Create """
    model = AidRequest
    form_class = AidRequestCreateForm
    template_name = 'aidrequests/aid_request_form.html'
    # should return to Field Op Home
    success_url = reverse_lazy('home')

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.field_op, self.fieldop_slug = get_field_op_from_kwargs(kwargs)
        if not self.field_op:
            raise Http404("Field operation not found")
        ic(f"Setup AidRequestCreateView for field_op: {self.fieldop_slug}")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['fieldop_slug'] = self.fieldop_slug
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        if self.object is None:
            context['New'] = True
        else:
            context['New'] = False
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {
            'field_op': self.field_op.pk,
            'fieldop_slug': self.fieldop_slug
        }
        return kwargs

    def form_valid(self, form):
        ic(form.cleaned_data)
        self.object = form.save(commit=False)

        if not self.object.requestor_email and not self.object.requestor_phone:
            form.add_error(None, 'Provide one of phone or email.')
            return self.form_invalid(form)
        user = self.request.user
        if user.is_authenticated:
            self.object.created_by = user
            self.object.updated_by = user
        else:
            self.object.created_by = None
            self.object.updated_by = None
        self.object.save(**form.cleaned_data)

        # Redirect to the list view for this field_op after creating
        self.success_url = reverse_lazy('aid_request_submitted', kwargs={'field_op': self.fieldop_slug, 'pk': self.object.pk})
        return super().form_valid(form)


# Update View for AidRequest
class AidRequestUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    permission_required = 'aidrequests.change_aidrequest'
    model = AidRequest
    form_class = AidRequestUpdateForm
    template_name = 'aidrequests/aid_request_update.html'

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.field_op, self.fieldop_slug = get_field_op_from_kwargs(kwargs)
        if not self.field_op:
            raise Http404("Field operation not found")

    def get_success_url(self):
        return reverse_lazy('aid_request_list', kwargs={'field_op': self.fieldop_slug})

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['fieldop_slug'] = self.fieldop_slug
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        if 'initial' not in kwargs:
            kwargs['initial'] = {}
        kwargs['initial']['fieldop_slug'] = self.fieldop_slug
        return kwargs

    def form_valid(self, form):
        self.object = form.save()
        # this locks the field_op to the URL regardless of form values
        self.object.field_op = self.field_op
        # check either or email/phone
        if not self.object.requestor_email and not self.object.requestor_phone:
            form.add_error(None, 'Provide one of phone or email.')
            return self.form_invalid(form)
        user = self.request.user
        if user.is_authenticated:
            form.instance.updated_by = user
        else:
            form.instance.updated_by = None
        self.object.save()

        # Create or update AidLocation
        latitude = form.cleaned_data.get('latitude')
        longitude = form.cleaned_data.get('longitude')
        location_note = form.cleaned_data.get('location_note')
        if latitude and longitude:
            # Check if an AidLocation already exists for this AidRequest
            aid_location, created = AidLocation.objects.get_or_create(
                aid_request=self.object,
                defaults={
                    'latitude': latitude,
                    'longitude': longitude,
                    'source': 'azure_maps',  # Assuming azure maps for now
                    'status': 'confirmed',  # Assuming confirmed for now
                    'note': location_note
                }
            )
            # If it's not a new one, update it
            if not created:
                aid_location.latitude = latitude
                aid_location.longitude = longitude
                aid_location.note = location_note
                aid_location.save()

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
        self.object = form.save()
        self.object.field_op = self.field_op

        user = self.request.user
        if user.is_authenticated:
            self.object.created_by = user
            self.object.updated_by = user
        else:
            self.object.created_by = None
            self.object.updated_by = None
        self.object.save()
        return super().form_valid(form)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {
            'aid_request': self.aid_request.pk,
            'fieldop_slug': self.fieldop_slug
        }
        return kwargs
