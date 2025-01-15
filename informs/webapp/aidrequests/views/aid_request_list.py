from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
import django_filters
from django_filters.views import FilterView

from ..models import FieldOp, AidRequest
from .maps import calculate_zoom

from geopy.distance import geodesic
# from icecream import ic


class AidRequestFilter(django_filters.FilterSet):

    ordering = django_filters.OrderingFilter(
        fields=(
            ('status', 'Status'),
            ('priority', 'Priority'),
            ('created_at', 'Created'),
            ('updated_at', 'Updated'),
        ),
        label='Sort by'
    )

    class Meta:
        model = AidRequest
        fields = ['aid_type', 'status', 'priority', 'ordering']


# Filter View for AidRequests
class AidRequestListView(LoginRequiredMixin, PermissionRequiredMixin, FilterView):
    model = AidRequest
    filterset_class = AidRequestFilter
    template_name = 'aidrequests/aid_request_list.html'
    permission_required = 'aidrequests.view_aidrequest'

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        field_op_slug = self.kwargs['field_op']
        self.field_op = get_object_or_404(FieldOp, slug=field_op_slug)

    def get_queryset(self):
        super().get_queryset()
        aid_requests = AidRequest.objects.filter(field_op_id=self.field_op.id)
        return aid_requests

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        aid_locations = []
        for aid_request in self.filterset.qs:
            if aid_request.location:
                if not aid_request.location.distance:
                    aid_request.location.distance = geodesic(
                        (self.field_op.latitude, self.field_op.longitude),
                        (aid_request.location.latitude, aid_request.location.longitude)
                    ).kilometers
                aid_location = {
                    'pk': aid_request.pk,
                    'aid_type': aid_request.aid_type.slug,
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
        # ic(aid_locations)
        context['aid_locations'] = aid_locations
        aid_types = self.field_op.aid_types

        aid_types_dict = {}
        for aid_type in aid_types.all():
            aid_types_dict[aid_type.slug] = {
                'icon_name': aid_type.icon_name,
                'icon_color': aid_type.icon_color,
                'icon_scale': aid_type.icon_scale,
            }
        context['aid_types'] = aid_types_dict

        if aid_locations:
            min_lat = min(aid_location['latitude'] for aid_location in aid_locations)
            max_lat = max(aid_location['latitude'] for aid_location in aid_locations)
            min_lon = min(aid_location['longitude'] for aid_location in aid_locations)
            max_lon = max(aid_location['longitude'] for aid_location in aid_locations)
            # compare to field_op location
            min_lat = float(min(min_lat, self.field_op.latitude))
            max_lat = float(max(max_lat, self.field_op.latitude))
            min_lon = float(min(min_lon, self.field_op.longitude))
            max_lon = float(max(max_lon, self.field_op.longitude))
            center_lat = (min_lat + max_lat) / 2
            center_lon = (min_lon + max_lon) / 2
            context['center_lat'] = center_lat
            context['center_lon'] = center_lon
            max_distance = geodesic(
                (min_lat, min_lon),
                (max_lat, max_lon)
            ).kilometers
            # ic(max_distance)
            context['max_distance'] = max_distance
            context['ring_size'] = int(max_distance / 10)
            if context['ring_size'] < 1:
                context['ring_size'] = 1
            context['map_zoom'] = calculate_zoom(max_distance/1.5)
        return context
