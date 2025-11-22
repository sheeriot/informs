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
from django.db.models import Prefetch, Case, When, Value, IntegerField
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.generic import CreateView, DetailView, ListView, UpdateView
from django_filters.views import FilterView
from django.utils.timesince import timesince

from ..models import FieldOp, AidRequest, AidType, AidLocation
from .utils import prepare_aid_locations_for_map, get_points_bounds, get_circle_bounds


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
        # Optimization: Check if field_op is already cached on the request (e.g. by middleware)
        # or cache it after fetching to save queries in context processors
        slug = kwargs.get('field_op')
        if hasattr(request, 'field_op') and request.field_op.slug == slug:
            self.field_op = request.field_op
        else:
            self.field_op = get_object_or_404(FieldOp, slug=slug)
            request.field_op = self.field_op

        self.status_group = kwargs.get('status_group', 'active')

    def get_queryset(self):
        """
        Return all AidRequest objects for the current field operation,
        with related data efficiently pre-fetched.
        """
        # Prefetch sorted locations to avoid N+1 queries later.
        # This replicates the logic from the AidRequest.location property.
        prefetch_locations = Prefetch(
            'locations',
            queryset=AidLocation.objects.order_by(
                Case(
                    When(status='confirmed', then=Value(1)),
                    When(status='new', then=Value(2)),
                    default=Value(3),
                    output_field=IntegerField()
                ),
                'created_at'  # oldest of the highest-precedence status
            ),
            to_attr='sorted_locations'
        )

        qs = AidRequest.objects.filter(
            field_op=self.field_op
        ).select_related('aid_type').prefetch_related(prefetch_locations).order_by('-updated_at')

        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Evaluate the object_list ONCE into a list.
        # This executes the query (with prefetches) one time.
        all_aid_requests = list(self.object_list)

        # Prepare aid_type counts for the filter interface
        aid_types_data = []
        for at_data in self.field_op.aid_types.values('id', 'name', 'slug', 'icon_name', 'icon_color', 'icon_scale').distinct():
            # Ensure icon_scale has a default value to prevent javascript errors
            if at_data['icon_scale'] is None:
                at_data['icon_scale'] = 1.0
            aid_types_data.append(at_data)

        total_count = len(all_aid_requests)

        # Prepare status counts for the filter interface
        all_statuses = AidRequest.STATUS_CHOICES
        status_counts = {}
        active_total_count = 0
        inactive_total_count = 0
        for status_code, status_name in all_statuses:
            count = sum(1 for req in all_aid_requests if req.status == status_code)
            checked_by_default = status_code in AidRequest.ACTIVE_STATUSES
            status_counts[status_name] = {
                'count': count,
                'checked_by_default': checked_by_default,
            }
            if checked_by_default:
                active_total_count += count
            else:
                inactive_total_count += count
        context['status_counts'] = status_counts
        context['status_group_counts'] = {
            'active': active_total_count,
            'inactive': inactive_total_count
        }

        # Prepare priority counts for the filter interface
        all_priorities = AidRequest.PRIORITY_CHOICES
        priority_counts = {}
        for code, name in all_priorities:
            count = sum(1 for req in all_aid_requests if req.priority == code)
            # All priorities are checked by default under the "All" group
            checked_by_default = True
            priority_counts[name] = {
                'value': code if code is not None else 'none',
                'count': count,
                'checked_by_default': checked_by_default,
            }
        context['priority_counts'] = priority_counts

        # Prepare aid_type counts for the filter interface
        aid_type_counts = {}
        for at_data in aid_types_data:
            slug = at_data['slug']
            name = at_data['name']
            count = sum(1 for req in all_aid_requests if req.aid_type.slug == slug)
            # All aid types are checked by default under the "All" group
            checked_by_default = True
            aid_type_counts[name] = {
                'value': slug,
                'count': count,
                'checked_by_default': checked_by_default,
            }
        context['aid_type_counts'] = aid_type_counts

        # Add the debug info to the main JSON data blob
        # Use the already evaluated list 'all_aid_requests' to avoid re-querying
        all_requests_data = [req.to_dict() for req in all_aid_requests]

        field_op_data = {
            'slug': self.field_op.slug,
            'latitude': self.field_op.latitude,
            'longitude': self.field_op.longitude,
            'ring_size': self.field_op.ring_size,
        }

        # This will be the NEW single source of truth for all client-side data
        context_data_for_js = {
            'field_op': field_op_data,
            'debug': settings.DEBUG,
            'active_total_count': active_total_count,
            'inactive_total_count': inactive_total_count,
            'status_groups': {
                'active': AidRequest.ACTIVE_STATUSES,
                'inactive': AidRequest.INACTIVE_STATUSES
            }
        }

        context.update({
            'field_op': self.field_op,
            'aid_requests': all_aid_requests, # Use the list, not the queryset
            'total_count': total_count,
            'active_total_count': active_total_count,
            'inactive_total_count': inactive_total_count,
            'azure_maps_key': settings.AZURE_MAPS_KEY,
            'status_groups': {
                'active': AidRequest.ACTIVE_STATUSES,
                'inactive': AidRequest.INACTIVE_STATUSES
            },
            'status_choices_list': AidRequest.STATUS_CHOICES,
            'priority_choices_list': AidRequest.PRIORITY_CHOICES,
            'aid_types_list': aid_types_data,
            'aid_types_json': json.dumps(aid_types_data, cls=DecimalEncoder),
            'status_choices_json': json.dumps(list(AidRequest.STATUS_CHOICES)),
            'priority_choices_json': json.dumps(list(AidRequest.PRIORITY_CHOICES)),
            # Pass the list of requests and the config separately
            'all_requests_json': json.dumps(all_requests_data, cls=DecimalEncoder),
            'aid_requests_config_json': json.dumps(context_data_for_js, cls=DecimalEncoder),
        })

        # --- Bounding Box Calculation ---
        # Use the serialized data as the source for locations
        aid_locations = [req for req in all_requests_data if req.get('location') and req.get('location').get('latitude') and req.get('location').get('longitude')]

        final_bounds = None
        aid_requests_bounds = get_points_bounds(aid_locations)

        # 2. Calculate bounds for the Field Op area (2.5x radius for padding)
        field_op_bounds = None
        if self.field_op.ring_size and self.field_op.ring_size > 0:
            radius_km = float(self.field_op.ring_size) * 2.5 * 1.60934  # 2.5x radius in km
            field_op_bounds = get_circle_bounds(
                center_lat=self.field_op.latitude,
                center_lon=self.field_op.longitude,
                radius_km=radius_km
            )

        # 3. Merge the two bounding boxes
        if aid_requests_bounds and field_op_bounds:
            # Merge by taking the min of lower corners and max of upper corners
            final_bounds = [
                min(aid_requests_bounds[0], field_op_bounds[0]),
                min(aid_requests_bounds[1], field_op_bounds[1]),
                max(aid_requests_bounds[2], field_op_bounds[2]),
                max(aid_requests_bounds[3], field_op_bounds[3]),
            ]
        elif aid_requests_bounds:
            final_bounds = aid_requests_bounds
        elif field_op_bounds:
            final_bounds = field_op_bounds
        else:
            # Fallback if no locations and no radius: create a 10km box around the field op center
            final_bounds = get_circle_bounds(self.field_op.latitude, self.field_op.longitude, 10)

        # 4. Ensure the bounds are not a single point or a line
        if final_bounds and (final_bounds[0] == final_bounds[2] or final_bounds[1] == final_bounds[3]):
            padding = 0.01  # degrees
            final_bounds = [
                final_bounds[0] - padding,
                final_bounds[1] - padding,
                final_bounds[2] + padding,
                final_bounds[3] + padding
            ]

        context['initial_bounds_json'] = json.dumps(final_bounds)

        return context

    def get_aid_locations_json(self, aid_requests):
        locations = []
        for request in aid_requests:
            if request.sorted_locations:
                primary_location = request.sorted_locations[0]
                locations.append({
                    'id': request.id,
                    'provided_address': request.provided_address,
                    'requester_full_name': request.requester_full_name,
                    'status': request.status,
                    'status_display': request.get_status_display(),
                    'priority': request.priority,
                    'priority_display': request.get_priority_display(),
                    'aid_type': request.aid_type.slug,
                    'updated_at_human': f"{timesince(request.updated_at)} ago",
                    'longitude': float(primary_location.longitude),
                    'latitude': float(primary_location.latitude),
                    'group_size': request.group_size
                })
        return json.dumps(locations)
