from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.db.models import Count
from django.views.generic import ListView, DetailView, CreateView, UpdateView

from ..models import FieldOp
from .forms import FieldOpForm
from .maps import calculate_zoom

from geopy.distance import geodesic
# from icecream import ic


# List View for FieldOp
class FieldOpListView0(LoginRequiredMixin, ListView):
    model = FieldOp
    template_name = 'aidrequests/field_op_list.html'

    def get_queryset(self):
        queryset = FieldOp.objects.annotate(aid_request_count=Count('aid_requests'))
        return queryset


# Detail View for FieldOp
class FieldOpDetailView(LoginRequiredMixin, DetailView):
    model = FieldOp
    template_name = 'aidrequests/field_op_detail.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['notifies_email'] = self.object.notify.filter(type__startswith='email')
        context['notifies_sms'] = self.object.notify.filter(type='sms')

        context['aid_request_count'] = self.object.aid_requests.count()
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        aid_locations = []
        for aid_request in self.object.aid_requests.all():
            if aid_request.location:
                aid_location = {
                    'pk': aid_request.pk,
                    'latitude': float(aid_request.location.latitude),
                    'longitude': float(aid_request.location.longitude),
                    'address': (
                                f"{aid_request.street_address}, "
                                f"{aid_request.city}, "
                                f"{aid_request.state}"
                                ),
                    'requester_name': f"{aid_request.requestor_first_name} {aid_request.requestor_last_name}"
                }
                aid_locations.append(aid_location)
        context['aid_locations'] = aid_locations
        if aid_locations:
            min_lat = min(aid_location['latitude'] for aid_location in aid_locations)
            max_lat = max(aid_location['latitude'] for aid_location in aid_locations)
            min_lon = min(aid_location['longitude'] for aid_location in aid_locations)
            max_lon = max(aid_location['longitude'] for aid_location in aid_locations)
            # compare to field_op location
            min_lat = float(min(min_lat, self.object.latitude))
            max_lat = float(max(max_lat, self.object.latitude))
            min_lon = float(min(min_lon, self.object.longitude))
            max_lon = float(max(max_lon, self.object.longitude))
            center_lat = (min_lat + max_lat) / 2
            center_lon = (min_lon + max_lon) / 2
            context['center_lat'] = center_lat
            context['center_lon'] = center_lon
            context['map_zoom'] = calculate_zoom(geodesic(
                (min_lat, min_lon),
                (max_lat, max_lon)
            ).kilometers/1.5)

        # for aid_request in self.field:
        #     if aid_request.location:
        #         if not aid_request.location.distance:
        #             aid_request.location.distance = geodesic(
        #                 (self.field_op.latitude, self.field_op.longitude),
        #                 (aid_request.location.latitude, aid_request.location.longitude)
        #             ).kilometers
        #         aid_location = {
        #             'pk': aid_request.pk,
        #             'latitude': float(aid_request.location.latitude),
        #             'longitude': float(aid_request.location.longitude),
        #             'address': (
        #                 f"{aid_request.street_address}, "
        #                 f"{aid_request.city}, "
        #                 f"{aid_request.state}"
        #             ),
        #             'requester_name': f"{aid_request.requestor_first_name} {aid_request.requestor_last_name}"
        #         }
        #         aid_locations.append(aid_location)
        return context


# Create View for FieldOp
class FieldOpCreateView(LoginRequiredMixin, CreateView):
    model = FieldOp
    form_class = FieldOpForm
    template_name = 'aidrequests/field_op_form.html'
    success_url = reverse_lazy('field_op_list')

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)

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

    def get_success_url(self):
        return reverse_lazy(
            'field_op_detail',
            kwargs={
                'pk': self.kwargs['pk'],
            }
        )

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
