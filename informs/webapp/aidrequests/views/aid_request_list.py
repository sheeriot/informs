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

from ..models import FieldOp, AidRequest, AidType

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


# Filter View for AidRequests
class AidRequestListView(LoginRequiredMixin, PermissionRequiredMixin, ListView):
    model = AidRequest
    template_name = 'aidrequests/aid_request_list.html'
    permission_required = 'aidrequests.view_aidrequest'

    def get_queryset(self):
        field_op_slug = self.kwargs.get('field_op')
        status = self.kwargs.get('status')  # Individual status if provided
        status_group = self.kwargs.get('status_group', 'active')  # Default to active if not specified

        # Start with all requests for this field op
        queryset = AidRequest.objects.filter(field_op__slug=field_op_slug)

        # Apply status filtering
        if status:
            # If specific status provided, filter to just that status
            queryset = queryset.filter(status=status)
        elif status_group == 'active':
            # If no specific status but status_group is active (or default)
            queryset = queryset.filter(status__in=AidRequest.ACTIVE_STATUSES)
        elif status_group == 'inactive':
            # If status_group is inactive
            queryset = queryset.filter(status__in=AidRequest.INACTIVE_STATUSES)

        ic("AidRequestListView Query Parameters:", {
            'field_op_slug': field_op_slug,
            'status': status,
            'status_group': status_group,
            'filtered_count': queryset.count()
        })

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        field_op = FieldOp.objects.get(slug=self.kwargs.get('field_op'))
        status = self.kwargs.get('status')
        status_group = self.kwargs.get('status_group', 'active')  # Default to active if not specified

        # Store the current filter state
        context.update({
            'field_op': field_op,
            'current_status': status,
            'current_status_group': status_group,
            'azure_maps_key': settings.AZURE_MAPS_KEY
        })

        # Get all aid types for client-side filtering
        aid_types = field_op.aid_types.all().distinct()
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
        all_aid_requests = AidRequest.objects.filter(field_op__slug=field_op.slug)
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
            if status:
                filtered_mask = df['status'] == status
            elif status_group == 'inactive':
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
                matching_status = df[df['status'] == status_code]
                status_counts[status_name] = {
                    'value': status_code,
                    'total': len(matching_status),  # Total count for this status
                    'count': len(matching_status[filtered_mask])  # Filtered count
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
                matching_priority = filtered_df[filtered_df['priority'].fillna('null') == (priority_code or 'null')]
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
                    'total': len(df[active_mask]),
                    'filtered': len(filtered_df[filtered_df['status'].isin(AidRequest.ACTIVE_STATUSES)])
                },
                'inactive': {
                    'total': len(df[inactive_mask]),
                    'filtered': len(filtered_df[filtered_df['status'].isin(AidRequest.INACTIVE_STATUSES)])
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
                min_lat = float(min(min_lat, field_op.latitude))
                max_lat = float(max(max_lat, field_op.latitude))
                min_lon = float(min(min_lon, field_op.longitude))
                max_lon = float(max(max_lon, field_op.longitude))

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
                min_lat = max_lat = float(field_op.latitude)
                min_lon = max_lon = float(field_op.longitude)
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
            min_lat = max_lat = float(field_op.latitude)
            min_lon = max_lon = float(field_op.longitude)

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
            'status_counts': status_counts if 'status_counts' in locals() else {},
            'priority_counts': priority_counts if 'priority_counts' in locals() else {},
            'aid_type_counts': aid_type_counts if 'aid_type_counts' in locals() else {},
            'status_groups': {
                'active': AidRequest.ACTIVE_STATUSES,
                'inactive': AidRequest.INACTIVE_STATUSES
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
