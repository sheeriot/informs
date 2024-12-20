from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy, reverse
from django.views.generic import ListView, DetailView, CreateView, UpdateView

from django_q import tasks

from geopy.distance import geodesic
from time import perf_counter as timer
from datetime import datetime
from jinja2 import Template

from ..models import AidRequest, FieldOp, AidRequestLog
from ..tasks import aid_request_postsave
from .aid_request_forms import AidRequestCreateForm, AidRequestUpdateForm, AidRequestLogForm
from .aid_location_forms import AidLocationCreateForm, AidLocationStatusForm
from .maps import staticmap_aid, calculate_zoom
from ..geocoder import get_azure_geocode, geocode_save

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


# List View for AidRequests
class AidRequestListView(LoginRequiredMixin, ListView):
    """ list the aid requests"""
    model = AidRequest
    template_name = 'aidrequests/aid_request_list.html'

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.start_time = timer()
        field_op_slug = self.kwargs['field_op']
        self.field_op = get_object_or_404(FieldOp, slug=field_op_slug)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        return context

    def get_queryset(self):
        super().get_queryset()
        field_op_slug = self.kwargs['field_op']
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        aid_requests = AidRequest.objects.only(
            'assistance_type',
            'priority',
            'status',
            'requestor_first_name',
            'requestor_last_name',
            'street_address',
            'created_at',
            'updated_at',
            ).filter(field_op_id=field_op.id)
        for aid_request in aid_requests:
            aid_request.url_detail = reverse('aid_request_detail',
                                             kwargs={'field_op': field_op_slug, 'pk': aid_request.pk})
            aid_request.url_update = reverse('aid_request_update',
                                             kwargs={'field_op': field_op_slug, 'pk': aid_request.pk})
            aid_request.location_confirmed, aid_request.locs_confirmed = has_location_status(aid_request, 'confirmed')
            aid_request.location_new, aid_request.locs_new = has_location_status(aid_request, 'new')

            if aid_request.location_confirmed:
                # ic(aid_request.locs_confirmed.first().latitude)
                aid_request.latitude = aid_request.locs_confirmed.first().latitude
                aid_request.longitude = aid_request.locs_confirmed.first().longitude
            elif aid_request.location_new:
                aid_request.latitude = aid_request.locs_new.first().latitude
                aid_request.longitude = aid_request.locs_new.first().longitude
            else:
                aid_request.latitude, aid_request.longitude = None, None
        return aid_requests


# Detail View for AidRequest
class AidRequestDetailView(LoginRequiredMixin, DetailView):
    model = AidRequest
    template_name = 'aidrequests/aid_request_detail.html'

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        self.kwargs = kwargs
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])

        location_confirmed, locs_confirmed = has_location_status(self.aid_request, 'confirmed')

        location_new, locs_new = has_location_status(self.aid_request, 'new')

        if location_confirmed:
            self.aid_location_confirmed = locs_confirmed.first()
        elif location_new:
            self.aid_location_new = locs_new.first()
        else:
            # not confirmed, not new, better geocode and map it.
            try:
                self.geocode_results = get_azure_geocode(self.aid_request)
            except Exception as e:
                ic(e)
            try:
                self.aid_location_new = geocode_save(self.aid_request, self.geocode_results)
            except Exception as e:
                ic(e)
            zoom = calculate_zoom(self.geocode_results['distance'])
            # ic(zoom)

            staticmap_data = staticmap_aid(
                width=600, height=600, zoom=zoom,
                fieldop_lat=self.aid_request.field_op.latitude,
                fieldop_lon=self.aid_request.field_op.longitude,
                aid1_lat=self.geocode_results['latitude'],
                aid1_lon=self.geocode_results['longitude'],
                )

            if staticmap_data:
                timestamp = datetime.now().strftime("%y%m%d%H%M%S")
                map_filename = f"AR{self.aid_request.pk}-map_{timestamp}.png"
                map_file = f"{settings.MAPS_PATH}/{map_filename}"
                with open(map_file, 'wb') as file:
                    file.write(staticmap_data)
                try:
                    self.aid_location_new.map_filename = map_filename
                    self.aid_location_new.save()
                except Exception as e:
                    ic(e)
            try:
                self.aid_request.logs.create(
                    log_entry='New Aid Location Created!'
                )
            except Exception as e:
                ic(f"Log Error: {e}")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context['field_op'] = self.field_op
        context['aid_request'] = self.aid_request
        if hasattr(self, 'aid_location_confirmed'):
            context['confirmed'] = True
            context['location'] = self.aid_location_confirmed
            context['map_filename'] = self.aid_location_confirmed.map_filename
            context['location_note'] = format_aid_location_note(self.aid_location_confirmed)
            found_pk = self.aid_location_confirmed.pk
        elif hasattr(self, 'aid_location_new'):
            context['new'] = True
            context['location'] = self.aid_location_new
            context['map_filename'] = self.aid_location_new.map_filename
            context['location_note'] = format_aid_location_note(self.aid_location_new)
            found_pk = self.aid_location_new.pk

        context['MAPS_PATH'] = settings.MAPS_PATH
        context['locations'] = self.aid_request.locations.all()
        context['logs'] = self.aid_request.logs.all().order_by('-updated_at')
        aid_location_status_init = {
            'field_op': self.field_op.slug,
            'aid_request': self.aid_request.pk,
            'pk': found_pk,
        }
        aid_location_status_form = AidLocationStatusForm(initial=aid_location_status_init)
        context['aid_location_status_form'] = aid_location_status_form

        # show the static map. Current, it runs in every context.
        # should be saved locally and updated as needed

        log_init = {
            'field_op': self.field_op.slug,
            'aid_request': self.aid_request.pk,
            }
        context['log_form'] = AidRequestLogForm(initial=log_init)
        # Manual Location Form
        aid_location_manual_init = {
            'field_op': self.field_op.slug,
            'aid_request': self.aid_request.pk,
        }
        context['aid_location_manual_form'] = AidLocationCreateForm(initial=aid_location_manual_init)

        return context


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
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        if self.object is None:
            context['New'] = True
        else:
            context['New'] = False
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {'field_op': self.field_op.pk}
        return kwargs

    def form_valid(self, form):
        self.object = form.save()

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
        self.object.save()

        # ----- post save starts here ------
        updated_at_stamp = self.object.updated_at.strftime('%Y%m%d%H%M%S')

        tasks.async_task(aid_request_postsave, self.object, kwargs={},
                         task_name=f"AR{self.object.pk}-PostSave-{updated_at_stamp}")

        return super().form_valid(form)


# Update View for AidRequest
class AidRequestUpdateView(LoginRequiredMixin, UpdateView):
    model = AidRequest
    form_class = AidRequestUpdateForm
    template_name = 'aidrequests/aid_request_update.html'
    # success_url = reverse_lazy('aid_request_list')

    # def get_form_kwargs(self):
    #     kwargs = super().get_form_kwargs()
    #     return kwargs

    def get_success_url(self):
        return reverse_lazy('aid_request_list', kwargs={'field_op': self.kwargs['field_op']})

    def get_context_data(self, **kwargs):
        field_op_slug = self.kwargs['field_op']
        context = super().get_context_data(**kwargs)
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        return context

    def form_valid(self, form):
        self.object = form.save()
        field_op_slug = self.kwargs['field_op']
        field_op = FieldOp.objects.get(slug=field_op_slug)
        # this locks the field_op to the URL regardless of form values
        self.object.field_op = field_op
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
        return super().form_valid(form)


class AidRequestLogCreateView(LoginRequiredMixin, CreateView):
    """ Aid Request Log - Create """
    model = AidRequestLog
    form_class = AidRequestLogForm

    def get_success_url(self):
        return reverse('aid_request_detail',
                       kwargs={
                           'field_op': self.field_op.slug,
                           'pk': self.aid_request.pk}
                       )

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        # custom setup
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])

    def form_valid(self, form):
        self.object = form.save()
        field_op_slug = self.kwargs['field_op']
        field_op = FieldOp.objects.get(slug=field_op_slug)
        self.object.field_op = field_op

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
                'field_op': self.field_op.slug,
        }
        return kwargs
