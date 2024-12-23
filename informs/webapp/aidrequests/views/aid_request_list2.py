from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin

import django_filters
from django_filters.views import FilterView
# from .maps import staticmap_aidrequests

from ..models import FieldOp, AidRequest

from icecream import ic


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

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op

        # if self.filterset.qs:
        #     mapped_aidrequests = [aid_request for aid_request in self.filterset.qs if aid_request.location]
        #     image_data = base64.b64encode(staticmap_aidrequests(self.field_op, mapped_aidrequests)).decode('utf-8')
        #     context['map'] = f"data:image/png;base64,{image_data}"

        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        aid_locations = []
        for aid_request in self.filterset.qs:
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

        ic(aid_locations)
        context['aid_locations'] = aid_locations
        return context

    def get_queryset(self):
        super().get_queryset()
        # aid_requests = AidRequest.objects.only(
        #     'assistance_type',
        #     'priority',
        #     'status',
        #     'requestor_first_name',
        #     'requestor_last_name',
        #     'street_address',
        #     'created_at',
        #     'updated_at',
        #     ).filter(field_op_id=field_op.id)

        aid_requests = AidRequest.objects.filter(field_op_id=self.field_op.id)

        return aid_requests
