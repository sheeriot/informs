from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
# from django.urls import reverse
import django_filters
from django_filters.views import FilterView
from .maps import staticmap_aidrequests

from ..models import FieldOp, AidRequest

import base64
# from time import perf_counter as timer
# from icecream import ic


class AidRequestFilter(django_filters.FilterSet):

    ordering = django_filters.OrderingFilter(
        fields=(
            ('status', 'status'),
            ('priority', 'priority'),
        ),
        label='Sort by'
    )

    class Meta:
        model = AidRequest
        fields = ['assistance_type', 'status', 'priority', 'ordering']


# Filter View for AidRequests
class AidRequestFilterView(LoginRequiredMixin, FilterView):
    model = AidRequest
    filterset_class = AidRequestFilter
    # context_object_name = 'aid_requests'
    template_name = 'aidrequests/aid_request_filter.html'
    # paginate_by = 10

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        # self.start_time = timer()
        field_op_slug = self.kwargs['field_op']
        self.field_op = get_object_or_404(FieldOp, slug=field_op_slug)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op

        # should do this by queryset but for now map the full field_op
        image_data = base64.b64encode(staticmap_aidrequests(self.field_op)).decode('utf-8')
        context['map'] = f"data:image/png;base64,{image_data}"
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

        return aid_requests
