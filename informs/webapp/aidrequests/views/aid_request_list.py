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

from ..models import FieldOp, AidRequest, AidType

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
        self.aid_requests = self.field_op.aid_requests.all()
        self.status = kwargs.get('status')
        self.status_group = kwargs.get('status_group', 'active')
        # Initialize counts to 0
        self.active_count = 0
        self.inactive_count = 0
        self.total_count = 0
        self.filtered_count = 0

    def get_queryset(self):
        """Return all aid requests - filtering handled by template visibility"""
        return self.aid_requests

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Store the current filter state
        context.update({
            'field_op': self.field_op,
            'current_status': self.status,
            'current_status_group': self.status_group,
            'azure_maps_key': settings.AZURE_MAPS_KEY,
            # Explicit filter states
            'filter_state': {
                'statuses': self.status if self.status else (
                    AidRequest.INACTIVE_STATUSES if self.status_group == 'inactive'
                    else AidRequest.ACTIVE_STATUSES
                ),
                'aid_types': 'all',  # Default to all if not specified
                'priorities': 'all'   # Default to all if not specified
            },
            # Status group definitions from model
            'status_groups': {
                'active': AidRequest.ACTIVE_STATUSES,
                'inactive': AidRequest.INACTIVE_STATUSES
            }
        })

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

        # Get all status and priority choices for client-side filtering
        status_choices = [[status[0], status[1]] for status in AidRequest.STATUS_CHOICES]
        priority_choices = [[priority[0], priority[1]] for priority in AidRequest.PRIORITY_CHOICES]
        context.update({
            'status_choices_json': json.dumps(status_choices, cls=DecimalEncoder),
            'status_choices_list': status_choices,
            'priority_choices_json': json.dumps(priority_choices, cls=DecimalEncoder),
            'priority_choices_list': priority_choices
        })

        # Get ALL aid requests and convert to DataFrame for counting
        all_aid_requests = AidRequest.objects.filter(field_op__slug=self.field_op.slug)

        # Validate filter state - prevent 'none' filters that would result in empty sets
        if context['filter_state']['aid_types'] == 'none' or context['filter_state']['priorities'] == 'none':
            if logger:
                logger.warning("'none' filter detected, defaulting to 'all' to prevent empty result set")
            context['filter_state']['aid_types'] = 'all' if context['filter_state']['aid_types'] == 'none' else context['filter_state']['aid_types']
            context['filter_state']['priorities'] = 'all' if context['filter_state']['priorities'] == 'none' else context['filter_state']['priorities']

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
            'longitude': float(ar.location.longitude) if ar.location else None
        } for ar in all_aid_requests])

        if not df.empty:
            # First apply status filtering to match the queryset
            if self.status:
                filtered_mask = df['status'] == self.status
            elif self.status_group == 'inactive':
                filtered_mask = df['status'].isin(AidRequest.INACTIVE_STATUSES)
            else:  # active or default
                filtered_mask = df['status'].isin(AidRequest.ACTIVE_STATUSES)

            filtered_df = df[filtered_mask]

            # Calculate counts after filtering
            context.update({
                'active_count': len(df[df['status'].isin(AidRequest.ACTIVE_STATUSES)]),  # Total active count
                'inactive_count': len(df[df['status'].isin(AidRequest.INACTIVE_STATUSES)]),  # Total inactive count
                'total_count': len(df),  # Total count of all requests
                'filtered_count': len(filtered_df)  # Count of currently visible requests
            })

            # Calculate status counts
            status_counts = {}
            for status_code, status_name in AidRequest.STATUS_CHOICES:
                matching_status = df.loc[df['status'] == status_code]
                status_counts[status_name] = {
                    'value': status_code,
                    'total': len(matching_status),  # Total count for this status
                    'count': len(matching_status.loc[filtered_mask])  # Filtered count
                }

            # Calculate aid type counts based on filtered data
            aid_type_counts = filtered_df.groupby(['aid_type_name', 'aid_type_slug']).size().reset_index()
            aid_type_counts.columns = ['name', 'value', 'count']
            aid_type_counts = aid_type_counts.to_dict('records')
            aid_type_counts = {item['name']: {'count': item['count'], 'value': item['value']}
                             for item in aid_type_counts}

            # Calculate priority counts based on filtered data
            priority_counts = {}
            for priority_code, priority_name in AidRequest.PRIORITY_CHOICES:
                matching_priority = filtered_df.loc[filtered_df['priority'].fillna('null') == (priority_code or 'null')]
                priority_counts[priority_name] = {
                    'value': priority_code if priority_code is not None else 'none',
                    'total': len(matching_priority),
                    'count': len(matching_priority)
                }

            # Calculate group counts
            active_mask = df['status'].isin(AidRequest.ACTIVE_STATUSES)
            inactive_mask = df['status'].isin(AidRequest.INACTIVE_STATUSES)

            group_counts = {
                'active': {
                    'total': len(df.loc[active_mask]),
                    'filtered': len(filtered_df.loc[filtered_df['status'].isin(AidRequest.ACTIVE_STATUSES)])
                },
                'inactive': {
                    'total': len(df.loc[inactive_mask]),
                    'filtered': len(filtered_df.loc[filtered_df['status'].isin(AidRequest.INACTIVE_STATUSES)])
                }
            }
            context['group_counts'] = group_counts

            # Calculate map bounds using all locations
            valid_locations = [ar.location for ar in all_aid_requests if ar.location is not None]
            if valid_locations:
                min_lat = min(float(loc.latitude) for loc in valid_locations)
                max_lat = max(float(loc.latitude) for loc in valid_locations)
                min_lon = min(float(loc.longitude) for loc in valid_locations)
                max_lon = max(float(loc.longitude) for loc in valid_locations)

                # Add field op location to bounds
                min_lat = float(min(min_lat, self.field_op.latitude))
                max_lat = float(max(max_lat, self.field_op.latitude))
                min_lon = float(min(min_lon, self.field_op.longitude))
                max_lon = float(max(max_lon, self.field_op.longitude))

                # Add padding
                lat_span = max_lat - min_lat
                lon_span = max_lon - min_lon
                lat_padding = max(lat_span * 0.1, 0.001)
                lon_padding = max(lon_span * 0.1, 0.001)

                min_lat -= lat_padding
                max_lat += lat_padding
                min_lon -= lon_padding
                max_lon += lon_padding

                context.update({
                    'min_lat': min_lat,
                    'max_lat': max_lat,
                    'min_lon': min_lon,
                    'max_lon': max_lon
                })
            else:
                # Use field op location if no valid locations
                min_lat = max_lat = float(self.field_op.latitude)
                min_lon = max_lon = float(self.field_op.longitude)
        else:
            # Handle empty DataFrame case
            context.update({
                'active_count': 0,
                'inactive_count': 0,
                'total_count': 0,
                'filtered_count': 0,
                'status_counts': {},
                'priority_counts': {},
                'aid_type_counts': {aid_type['name']: {'count': 0, 'value': aid_type['slug']}
                                  for aid_type in aid_types_data}
            })
            min_lat = max_lat = float(self.field_op.latitude)
            min_lon = max_lon = float(self.field_op.longitude)

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

        # Update the initial filter state after counts are calculated
        context.update({
            'aid_requests_json': json.dumps(aid_requests_data, cls=DecimalEncoder, indent=2),
            'status_counts': status_counts if 'status_counts' in locals() else {},
            'priority_counts': priority_counts if 'priority_counts' in locals() else {},
            'aid_type_counts': aid_type_counts if 'aid_type_counts' in locals() else {},
        })

        # Now create initial filter state with the updated counts
        context['initial_filter_state'] = json.dumps({
            'statusGroup': self.status_group,
            'activeCount': context.get('active_count', 0),
            'inactiveCount': context.get('inactive_count', 0),
            'totalCount': context.get('total_count', 0)
        }, indent=2)

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
        logger.error(f"Error updating aid request: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)
