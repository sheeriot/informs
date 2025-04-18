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
import numpy as np

from ..models import FieldOp, AidRequest, AidType
from .maps import calculate_zoom

from geopy.distance import geodesic

from icecream import ic


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
            # ic(f"Aid types for field_op {field_op}: {list(field_op.aid_types.values_list('name', flat=True))}")

    # def filter_by_fieldop(self, queryset, name, value):
    #     # Filter products based on the selected category
    #     if value:
    #         # ic(f"Filtering by aid_type: {value}")
    #         return queryset.filter(aid_type=value)
    #     return queryset


# Filter View for AidRequests
class AidRequestListView(LoginRequiredMixin, PermissionRequiredMixin, FilterView):
    model = AidRequest
    template_name = 'aidrequests/aid_request_list.html'
    permission_required = 'aidrequests.view_aidrequest'

    filterset_class = AidRequestFilter

    def get_filterset(self, filterset_class):
        return filterset_class(self.request.GET, queryset=self.get_queryset(), field_op=self.field_op)

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        field_op_slug = self.kwargs['field_op']
        self.field_op = get_object_or_404(FieldOp, slug=field_op_slug)
        # ic(f"Setup AidRequestListView for field_op: {field_op_slug}")

    def get_queryset(self):
        super().get_queryset()
        aid_requests = AidRequest.objects.filter(field_op_id=self.field_op.id).distinct()

        # Use icecream for debug logging if needed
        ic(f"Found {aid_requests.count()} total aid requests for field_op: {self.field_op.name}")

        return aid_requests

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY

        # Get all aid types for client-side filtering
        aid_types = self.field_op.aid_types.all().distinct()
        aid_types_data = [{
            'id': aid_type.id,
            'name': aid_type.name,
            'slug': aid_type.slug,
            'icon_name': aid_type.icon_name,
            'icon_color': aid_type.icon_color,
            'icon_scale': float(aid_type.icon_scale)
        } for aid_type in aid_types]
        context['aid_types_json'] = json.dumps(aid_types_data, cls=DecimalEncoder)
        context['aid_types_list'] = aid_types_data

        # Get all status options for client-side filtering
        status_choices = [[status[0], status[1]] for status in AidRequest.STATUS_CHOICES]
        context['status_choices_json'] = json.dumps(status_choices, cls=DecimalEncoder)
        context['status_choices_list'] = status_choices

        # Get all priority options for client-side filtering
        priority_choices = [[priority[0], priority[1]] for priority in AidRequest.PRIORITY_CHOICES]
        context['priority_choices_json'] = json.dumps(priority_choices, cls=DecimalEncoder)
        context['priority_choices_list'] = priority_choices

        # Get ALL aid requests for the field op
        all_aid_requests = self.get_queryset()
        context['aid_requests'] = all_aid_requests

        # Calculate active/inactive counts based on status groups
        active_statuses = ['new', 'assigned', 'resolved']
        inactive_statuses = ['closed', 'rejected', 'other']

        active_requests = [ar for ar in all_aid_requests if ar.status in active_statuses]
        context['active_count'] = len(active_requests)
        context['total_count'] = len(all_aid_requests)

        # Convert ALL aid requests to DataFrame for counting
        df = pd.DataFrame([{
            'id': ar.pk,
            'status': ar.status,
            'status_display': ar.get_status_display(),
            'priority': ar.priority,
            'priority_display': ar.get_priority_display(),
            'aid_type_name': ar.aid_type.name,
            'aid_type_slug': ar.aid_type.slug,
            'aid_type_id': ar.aid_type.id,
            'latitude': float(ar.location.latitude) if ar.location else None,
            'longitude': float(ar.location.longitude) if ar.location else None,
            'is_active': ar.status in active_statuses
        } for ar in all_aid_requests])

        if not df.empty:
            # Calculate both filtered (active only) and total counts for status
            active_df = df[df['is_active']]

            # Status counts - calculate both filtered and total
            status_counts = {}

            # First get total counts for all statuses
            total_status_counts = df.groupby(['status_display', 'status']).size().reset_index()
            total_status_counts.columns = ['display', 'value', 'count']

            # Then get filtered counts (active only)
            filtered_status_counts = active_df.groupby(['status_display', 'status']).size().reset_index()
            filtered_status_counts.columns = ['display', 'value', 'count']

            # Combine into final status_counts structure
            for _, row in total_status_counts.iterrows():
                status_counts[row['display']] = {
                    'value': row['value'],
                    'total': row['count'],  # Always include total count
                    'count': row['count'] if row['value'] in inactive_statuses else
                            filtered_status_counts[filtered_status_counts['value'] == row['value']]['count'].iloc[0]
                            if not filtered_status_counts[filtered_status_counts['value'] == row['value']].empty else 0
                }

            # Calculate group counts
            group_counts = {
                'active': {
                    'total': len(df[df['status'].isin(active_statuses)]),
                    'filtered': len(active_df)
                },
                'inactive': {
                    'total': len(df[df['status'].isin(inactive_statuses)]),
                    'filtered': 0  # Initially 0 as inactive are not in filter
                }
            }
            context['group_counts'] = group_counts

            # Priority counts (active only initially)
            priority_counts = active_df.groupby(['priority_display', 'priority']).size().reset_index()
            priority_counts.columns = ['display', 'value', 'count']
            priority_counts = priority_counts.to_dict('records')
            priority_counts = {item['display']: {'count': item['count'], 'value': item['value']}
                             for item in priority_counts}

            # Aid type counts (active only initially)
            aid_type_counts = active_df.groupby(['aid_type_name', 'aid_type_slug']).size().reset_index()
            aid_type_counts.columns = ['name', 'value', 'count']
            aid_type_counts = aid_type_counts.to_dict('records')
            aid_type_counts = {item['name']: {'count': item['count'], 'value': item['value']}
                             for item in aid_type_counts}

            # Calculate map bounds if we have locations
            locations_df = df[df['latitude'].notna() & df['longitude'].notna()]
            if not locations_df.empty:
                min_lat = locations_df['latitude'].min()
                max_lat = locations_df['latitude'].max()
                min_lon = locations_df['longitude'].min()
                max_lon = locations_df['longitude'].max()
            else:
                min_lat = max_lat = float(self.field_op.latitude)
                min_lon = max_lon = float(self.field_op.longitude)
        else:
            # Handle empty DataFrame case
            status_counts = {}
            priority_counts = {}
            aid_type_counts = {aid_type['name']: {'count': 0, 'value': aid_type['slug']}
                             for aid_type in aid_types_data}
            min_lat = max_lat = float(self.field_op.latitude)
            min_lon = max_lon = float(self.field_op.longitude)

        # Debug logging using icecream
        ic("Status counts:", status_counts)
        ic("Priority counts:", priority_counts)
        ic("Aid type counts:", aid_type_counts)

        # Add field op location to bounds
        if min_lat is not None:
            min_lat = float(min(min_lat, self.field_op.latitude))
            max_lat = float(max(max_lat, self.field_op.latitude))
            min_lon = float(min(min_lon, self.field_op.longitude))
            max_lon = float(max(max_lon, self.field_op.longitude))

            # Calculate map parameters
            center_lat = (min_lat + max_lat) / 2
            center_lon = (min_lon + max_lon) / 2
            max_distance = geodesic((min_lat, min_lon), (max_lat, max_lon)).kilometers

            context.update({
                'center_lat': center_lat,
                'center_lon': center_lon,
                'max_distance': max_distance,
                'ring_size': max(1, int(max_distance / 10)),
                'map_zoom': calculate_zoom(max_distance/1.5)
            })

            # ic(f"Map bounds: ({min_lat},{min_lon}) to ({max_lat},{max_lon}), max_distance: {max_distance}km")

        # Add ALL aid requests to JSON data for JavaScript
        aid_requests_data = [{
            'id': ar.pk,
            'pk': ar.pk,
            'aid_type': {
                'id': ar.aid_type.id,
                'name': ar.aid_type.name,
                'slug': ar.aid_type.slug,
            },
            'priority': ar.priority,
            'priority_display': ar.get_priority_display(),
            'status': ar.status,
            'status_display': ar.get_status_display(),
            'requester_name': f"{ar.requestor_first_name} {ar.requestor_last_name}",
            'address': {
                'street': ar.street_address,
                'city': ar.city,
                'state': ar.state,
                'zip_code': ar.zip_code,
                'country': ar.country,
                'full': f"{ar.street_address}, {ar.city}, {ar.state}, {ar.zip_code}, {ar.country}"
            },
            'location': {
                'found': ar.location.address_found if ar.location else None,
                'status': ar.location_status,
                'latitude': float(ar.location.latitude) if ar.location else None,
                'longitude': float(ar.location.longitude) if ar.location else None,
                'distance': float(ar.location.distance) if ar.location and ar.location.distance else None
            },
            'timestamps': {
                'updated_at': ar.updated_at.isoformat() if ar.updated_at else None,
                'created_at': ar.created_at.isoformat() if ar.created_at else None
            }
        } for ar in all_aid_requests]

        context.update({
            'aid_requests_json': json.dumps(aid_requests_data, cls=DecimalEncoder),
            'status_counts': status_counts,
            'priority_counts': priority_counts,
            'aid_type_counts': aid_type_counts,
            'status_groups': {
                'active': active_statuses,
                'inactive': inactive_statuses
            }
        })

        return context

# Add new view for AJAX updates
@login_required
@permission_required('aidrequests.change_aidrequest')
@require_http_methods(["POST"])
def update_aid_request(request, field_op, pk):
    try:
        # Get the aid request
        aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)

        # Parse the JSON data
        data = json.loads(request.body)

        # Update status if provided
        if 'status' in data:
            aid_request.status = data['status']

        # Update priority if provided
        if 'priority' in data:
            aid_request.priority = data['priority']

        # Save the changes
        aid_request.save()

        # Return updated data
        response_data = {
            'success': True,
            'status': aid_request.status,
            'status_display': aid_request.get_status_display(),
            'priority': aid_request.priority,
            'priority_display': aid_request.get_priority_display()
        }

        return JsonResponse(response_data)

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)
