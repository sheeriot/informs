from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required, permission_required
import django_filters
from django_filters.views import FilterView
import json
from decimal import Decimal
import pandas as pd
from django.views.generic import ListView
import logging
from ..context_processors import get_field_op_from_kwargs
from icecream import ic
# from django_q.tasks import async_task
# from .aid_request_forms_a import RequestStatusForm
# from ..forms import AidRequestStatusUpdateForm, AidRequestPriorityUpdateForm

from ..models import FieldOp, AidRequest, AidType
from .utils import prepare_aid_locations_for_map, locations_to_bounds
from ..views.aid_request_forms_a import (
    RequestorInformationForm,
    AidContactInformationForm,
    LocationInformationForm,
    RequestDetailsForm,
    RequestStatusForm,
)

logger = logging.getLogger(__name__)

# Custom JSON encoder to handle Decimal objects
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


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

    aid_type = django_filters.ModelChoiceFilter(
        queryset=AidType.objects.all(),
        method='filter_by_fieldop'
    )

    class Meta:
        model = AidRequest
        fields = ['aid_type', 'status', 'priority', 'ordering']

    def __init__(self, *args, **kwargs):
        # Pop the extra variable passed from the view
        field_op = kwargs.pop('field_op', None)
        super().__init__(*args, **kwargs)
        # Dynamically adjust the queryset for the aid_types field
        if field_op is not None:
            self.filters['aid_type'].queryset = field_op.aid_types.all()


# Filter View for AidRequests
class AidRequestListView(LoginRequiredMixin, PermissionRequiredMixin, ListView):
    model = AidRequest
    template_name = 'aidrequests/aid_request_list.html'
    permission_required = 'aidrequests.view_aidrequest'
    context_object_name = 'aid_requests'  # More semantic name than object_list

    def setup(self, request, *args, **kwargs):
        """Initialize common attributes used by all view methods"""
        super().setup(request, *args, **kwargs)
        self.field_op = get_object_or_404(FieldOp, slug=kwargs.get('field_op'))
        self.aid_requests = self.field_op.aid_requests.all().select_related('aid_type').prefetch_related('locations')
        self.status = kwargs.get('status')
        self.status_group = kwargs.get('status_group', 'active')

    def get_queryset(self):
        """Return all aid requests - filtering handled by template visibility"""
        return self.aid_requests

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context.update({
            'field_op': self.field_op,
            'current_status_group': self.status_group,
            'azure_maps_key': settings.AZURE_MAPS_KEY,
            'status_groups': {
                'active': AidRequest.ACTIVE_STATUSES,
                'inactive': AidRequest.INACTIVE_STATUSES
            }
        })

        context['status_choices_list'] = AidRequest.STATUS_CHOICES
        context['priority_choices_list'] = AidRequest.PRIORITY_CHOICES

        # Prepare data for all components
        all_aid_requests = self.aid_requests
        aid_locations = prepare_aid_locations_for_map(all_aid_requests)
        context['aid_requests_json'] = json.dumps(aid_locations, cls=DecimalEncoder)

        bounds = locations_to_bounds(aid_locations)
        if bounds != [0,0,0,0]:
             context['min_lon'], context['min_lat'], context['max_lon'], context['max_lat'] = bounds
        else:
            # Fallback to field op location if no valid bounds
            context['min_lon'] = context['max_lon'] = self.field_op.longitude
            context['min_lat'] = context['max_lat'] = self.field_op.latitude

        # Prepare choices for filter controls
        aid_types_data = list(self.field_op.aid_types.values('id', 'name', 'slug', 'icon_name', 'icon_color', 'icon_scale').distinct())
        context['aid_types_json'] = json.dumps(aid_types_data, cls=DecimalEncoder)
        context['aid_types_list'] = aid_types_data

        status_choices = [[s[0], s[1]] for s in AidRequest.STATUS_CHOICES]
        priority_choices = [[p[0], p[1]] for p in AidRequest.PRIORITY_CHOICES]
        context['status_choices_json'] = json.dumps(status_choices)
        context['priority_choices_json'] = json.dumps(priority_choices)

        # Build DataFrame for counts and perform detailed calculations
        aid_request_values = all_aid_requests.values(
            'status', 'priority', 'aid_type__slug', 'aid_type__name'
        )
        df = pd.DataFrame(list(aid_request_values))

        if not df.empty:
            df.rename(columns={'aid_type__slug': 'aid_type_slug', 'aid_type__name': 'aid_type_name'}, inplace=True)
            active_mask = df['status'].isin(AidRequest.ACTIVE_STATUSES)
            inactive_mask = df['status'].isin(AidRequest.INACTIVE_STATUSES)

            context.update({
                'active_count': int(active_mask.sum()),
                'inactive_count': int(inactive_mask.sum()),
                'total_count': len(df),
            })

            # Base dataframes for active/inactive requests
            df_active = df[active_mask]

            # Determine which dataframe to use for current counts
            if self.status_group == 'inactive':
                df_current = df[inactive_mask]
            else:
                df_current = df_active

            # --- Calculate Counts ---
            status_counts = {}
            for code, name in AidRequest.STATUS_CHOICES:
                status_counts[name] = {
                    'value': code,
                    'count': (df_active['status'] == code).sum() if not df_active.empty else 0,
                    'total': (df['status'] == code).sum()
                }
            context['status_counts'] = status_counts

            priority_counts = {}
            for code, name in AidRequest.PRIORITY_CHOICES:
                # Handle 'None' priority from choices which is None/null in DB
                if code is None:
                    count = df_current['priority'].isnull().sum() if not df_current.empty else 0
                else:
                    count = (df_current['priority'] == code).sum() if not df_current.empty else 0

                # The value for the checkbox needs to be a string, 'none' for the None type
                # so it can be used in the HTML data-filter-value attribute.
                priority_counts[name] = {
                    'value': code if code is not None else 'none',
                    'count': count,
                }
            context['priority_counts'] = priority_counts

            aid_type_counts = {}
            for at_data in aid_types_data:
                slug = at_data['slug']
                name = at_data['name']
                aid_type_counts[name] = {
                    'value': slug,
                    'count': (df_current['aid_type_slug'] == slug).sum() if not df_current.empty else 0,
                }
            context['aid_type_counts'] = aid_type_counts

        else:
             context.update({
                'active_count': 0, 'inactive_count': 0, 'total_count': 0,
                'status_counts': {s[1]: {'value': s[0], 'count': 0, 'total': 0} for s in AidRequest.STATUS_CHOICES},
                'priority_counts': {p[1]: {'value': p[0], 'count': 0} for p in AidRequest.PRIORITY_CHOICES},
                'aid_type_counts': {at['name']: {'value': at['slug'], 'count': 0} for at in aid_types_data},
            })

        context['initial_filter_state'] = json.dumps({
            'statusGroup': self.status_group,
            'activeCount': context.get('active_count', 0),
            'inactiveCount': context.get('inactive_count', 0),
            'totalCount': context.get('total_count', 0)
        })

        return context
