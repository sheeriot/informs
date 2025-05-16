from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.db.models import Count, Q
from django.views.generic import ListView
from django.conf import settings
from ..models import FieldOp, AidRequest


import base64
# from icecream import ic


# Map View for FieldOp
class FieldOpListView(LoginRequiredMixin, PermissionRequiredMixin, ListView):
    model = FieldOp
    template_name = 'aidrequests/field_op_list.html'
    permission_required = 'aidrequests.view_fieldop'

    def get_queryset(self):
        queryset = FieldOp.objects.annotate(
            aidrequests_active_count=Count(
                'aid_requests',
                filter=Q(aid_requests__status__in=AidRequest.ACTIVE_STATUSES)
            ),
            aidrequests_inactive_count=Count(
                'aid_requests',
                filter=Q(aid_requests__status__in=AidRequest.INACTIVE_STATUSES)
            )
        )
        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Add Azure Maps key for JavaScript map
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY

        # Add status groups for template use
        context['active_statuses'] = AidRequest.ACTIVE_STATUSES
        context['inactive_statuses'] = AidRequest.INACTIVE_STATUSES

        # Prepare field ops data for the map
        field_ops_data = []
        for field_op in self.get_queryset():
            field_ops_data.append({
                'id': field_op.pk,
                'name': field_op.name,
                'slug': field_op.slug,
                'latitude': float(field_op.latitude),
                'longitude': float(field_op.longitude),
                'ring_size': float(field_op.ring_size),
                'aidrequests_active_count': field_op.aidrequests_active_count,
                'aidrequests_inactive_count': field_op.aidrequests_inactive_count
            })
        context['field_ops_data'] = field_ops_data

        return context
