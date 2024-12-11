from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy, reverse
from django.views.generic import ListView, DetailView, CreateView, UpdateView

from django_q import tasks

from geopy.distance import geodesic
import base64
from time import perf_counter as timer
from ..models import AidRequest, FieldOp, AidRequestLog
from ..emailer import aid_request_new_email
from .aid_request_forms import AidRequestCreateForm, AidRequestUpdateForm, AidRequestLogForm
from .geocode_form import AidLocationForm
from .maps import staticmap_aid, calculate_zoom
# from .getAzureGeocode import getAddressGeocode
from ..azure_geocode import get_azure_geocode

from icecream import ic


def has_confirmed_location(aid_request):
    """
    Check if any of the aid_request locations has status 'confirmed'.

    :param aid_request: The AidRequest instance to check.
    :return: True if any location has status 'confirmed', False otherwise.
    """
    status = aid_request.locations.filter(status='confirmed').exists()
    locations = aid_request.locations.filter(status='confirmed')
    return status, locations


def geodist(aid_request):
    if any([aid_request.latitude, aid_request.longitude, aid_request.field_op.latitude,
            aid_request.field_op.longitude]) is None:
        return None

    return round(
        geodesic(
            (aid_request.latitude, aid_request.longitude),
            (aid_request.field_op.latitude, aid_request.field_op.longitude)
            ).km, 1)


# List View for AidRequests
class AidRequestListView(LoginRequiredMixin, ListView):
    """ list the aid requests"""
    model = AidRequest
    template_name = 'aidrequests/aidrequest_list.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        field_op_slug = self.kwargs['field_op']
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        context['field_op'] = field_op
        # context['map'] = generate_map(self.get_queryset())
        return context

    def get_queryset(self):
        field_op_slug = self.kwargs['field_op']
        field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        aidrequests = AidRequest.objects.filter(field_op_id=field_op.id)
        return aidrequests


# Detail View for AidRequest
class AidRequestDetailView(LoginRequiredMixin, DetailView):
    model = AidRequest
    template_name = 'aidrequests/aidrequest_detail.html'

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        if hasattr(self, "get") and not hasattr(self, "head"):
            self.head = self.get
        self.request = request
        self.args = args
        self.kwargs = kwargs

        # custom setup
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])

        confirmed_location, locations = has_confirmed_location(self.aid_request)
        if confirmed_location:
            self.confirmed = True
            self.aid1_lat = locations.first().latitude
            self.aid1_lon = locations.first().longitude
            self.aid1_note = locations.first().note
        else:
            self.geocode_results = get_azure_geocode(self.aid_request)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['location_confirmed'] = getattr(self, 'confirmed', False)
        context['field_op'] = self.field_op
        context['aid_request'] = object
        context['locations'] = self.aid_request.locations.all()
        context['logs'] = self.aid_request.logs.all().order_by('-updated_at')
        context['fieldop_lat'] = self.field_op.latitude
        context['fieldop_lon'] = self.field_op.longitude

        # show the static map. Current, it runs in every context.
        # should be saved locally and updated as needed

        log_init = {
            'field_op': self.field_op.slug,
            'aid_request': self.aid_request.pk,
            }
        context['log_form'] = AidRequestLogForm(initial=log_init)

        if hasattr(self, 'geocode_results'):
            zoom = calculate_zoom(self.geocode_results['distance'])
            note = self.geocode_results['note']

            initial_data = {
                'field_op': self.field_op.slug,
                'aid_request': self.aid_request.pk,
                'latitude': self.geocode_results['latitude'],
                'longitude': self.geocode_results['longitude'],
                'status': 'confirmed',
                'source': 'azure_maps',
                'note': note,
                }

            context['geocode_form'] = AidLocationForm(initial=initial_data)
            context['aid_lat'] = self.geocode_results['latitude']
            context['aid_lon'] = self.geocode_results['longitude']
            context['distance'] = self.geocode_results['distance']
            staticmap_data = staticmap_aid(
                width=600, height=600, zoom=zoom,
                fieldop_lat=self.field_op.latitude,
                fieldop_lon=self.field_op.longitude,
                aid1_lat=self.geocode_results['latitude'],
                aid1_lon=self.geocode_results['longitude'],
                )
            if staticmap_data is not None:
                image_data = base64.b64encode(staticmap_data).decode('utf-8')
                context['map_image'] = f"data:image/png;base64,{image_data}"
            else:
                context['map_image'] = None
        else:
            distance = round(geodesic(
                (self.aid1_lat, self.aid1_lon),
                (self.field_op.latitude, self.field_op.longitude)
                ).km, 1)
            zoom = calculate_zoom(distance)
            # ic(zoom)
            context['distance'] = distance
            staticmap_data = staticmap_aid(
                width=600, height=600, zoom=zoom,
                fieldop_lat=self.field_op.latitude,
                fieldop_lon=self.field_op.longitude,
                aid1_lat=self.aid1_lat,
                aid1_lon=self.aid1_lon,
                )
            image_data = base64.b64encode(staticmap_data).decode('utf-8')
            context['map_image'] = f"data:image/png;base64,{image_data}"
            context['aid_lat'] = self.aid1_lat
            context['aid_lon'] = self.aid1_lon
            context['note'] = self.aid1_note

        return context


# Create View for AidRequest
class AidRequestCreateView(CreateView):
    """ Aid Request - Create """
    model = AidRequest
    form_class = AidRequestCreateForm
    template_name = 'aidrequests/aidrequest_form.html'
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
        postsave_start = timer()
        updated_at_stamp = self.object.updated_at.strftime('%Y%m%d%H%M%S')
        tasks.async_task(aid_request_new_email, self.object, kwargs={}, task_name=f"AR{self.object.pk}-Saved-{updated_at_stamp}")
        postsave_time = round((timer() - postsave_start), 2)
        ic(postsave_time)
        return super().form_valid(form)


# Update View for AidRequest
class AidRequestUpdateView(LoginRequiredMixin, UpdateView):
    model = AidRequest
    form_class = AidRequestUpdateForm
    template_name = 'aidrequests/aidrequest_update.html'
    # success_url = reverse_lazy('aidrequest_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        return kwargs

    def get_success_url(self):
        return reverse_lazy('aidrequest_list', kwargs={'field_op': self.kwargs['field_op']})

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
        return reverse('aidrequest_detail',
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
