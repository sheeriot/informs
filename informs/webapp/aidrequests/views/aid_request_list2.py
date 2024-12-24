from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
import django_filters
from django_filters.views import FilterView

from ..models import FieldOp, AidRequest
from .maps import calculate_zoom

from geopy.distance import geodesic
# from icecream import ic


class AidRequestFilter2(django_filters.FilterSet):

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
        fields = ['assistance_type', 'status', 'priority', 'ordering']


# Filter View for AidRequests
class AidRequestListView2(LoginRequiredMixin, FilterView):
    model = AidRequest
    filterset_class = AidRequestFilter2
    template_name = 'aidrequests/aid_request_list2.html'

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
                    aid_request.location.save()
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
            min_lat = min(min_lat, self.field_op.latitude)
            max_lat = max(max_lat, self.field_op.latitude)
            min_lon = min(min_lon, self.field_op.longitude)
            max_lon = max(max_lon, self.field_op.longitude)
            center_lat = (min_lat + max_lat) / 2
            center_lon = (min_lon + max_lon) / 2
            context['center_lat'] = center_lat
            context['center_lon'] = center_lon
            context['map_zoom'] = calculate_zoom(geodesic(
                (min_lat, min_lon),
                (max_lat, max_lon)
            ).kilometers/1.5)
        return context
