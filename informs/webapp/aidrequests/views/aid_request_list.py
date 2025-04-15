from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
import django_filters
from django_filters.views import FilterView
import json
from decimal import Decimal

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
            ic(f"Aid types for field_op {field_op}: {list(field_op.aid_types.values_list('name', flat=True))}")

    def filter_by_fieldop(self, queryset, name, value):
        # Filter products based on the selected category
        if value:
            ic(f"Filtering by aid_type: {value}")
            return queryset.filter(aid_type=value)
        return queryset


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
        ic(f"Setup AidRequestListView for field_op: {field_op_slug}")

    def get_queryset(self):
        super().get_queryset()
        aid_requests = AidRequest.objects.filter(field_op_id=self.field_op.id).distinct()
        ic(f"Found {aid_requests.count()} aid requests for field_op: {self.field_op.name}")
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
            'icon_scale': float(aid_type.icon_scale)  # Convert Decimal to float for JSON
        } for aid_type in aid_types]
        context['aid_types_json'] = json.dumps(aid_types_data, cls=DecimalEncoder)
        context['aid_types_list'] = aid_types_data  # Add non-JSON version for server-side rendering

        ic(f"Prepared aid_types_json with {len(aid_types_data)} distinct types")

        # Get all status options for client-side filtering
        status_choices = [[status[0], status[1]] for status in AidRequest.STATUS_CHOICES]
        context['status_choices_json'] = json.dumps(status_choices, cls=DecimalEncoder)
        context['status_choices_list'] = status_choices  # Add non-JSON version
        ic(f"Status choices: {status_choices}")

        # Get all priority options for client-side filtering
        priority_choices = [[priority[0], priority[1]] for priority in AidRequest.PRIORITY_CHOICES]
        context['priority_choices_json'] = json.dumps(priority_choices, cls=DecimalEncoder)
        context['priority_choices_list'] = priority_choices  # Add non-JSON version
        ic(f"Priority choices: {priority_choices}")

        # Prepare aid request data for client-side filtering and sorting
        aid_requests_data = []
        aid_locations = []
        processed_ids = set()  # Track ids we've already processed

        ic(f"Preparing aid request data for client-side filtering")

        # Get a count of distinct aid request IDs for comparison
        distinct_count = self.filterset.qs.values_list('id', flat=True).distinct().count()
        ic(f"There are {distinct_count} distinct aid request IDs in the filtered queryset")

        # Get filtered queryset in list format for HTML rendering
        filtered_aid_requests = list(self.filterset.qs.distinct())

        # Pre-format the status and priority displays for each request
        for aid_request in filtered_aid_requests:
            aid_request.status_display = aid_request.get_status_display()
            aid_request.priority_display = aid_request.get_priority_display()

        context['filtered_aid_requests'] = filtered_aid_requests

        for aid_request in filtered_aid_requests:
            # Skip if we've already processed this ID
            if aid_request.id in processed_ids:
                continue

            processed_ids.add(aid_request.id)

            # Calculate distance if location exists
            distance = None
            if aid_request.location:
                if not aid_request.location.distance:
                    aid_request.location.distance = geodesic(
                        (self.field_op.latitude, self.field_op.longitude),
                        (aid_request.location.latitude, aid_request.location.longitude)
                    ).kilometers
                distance = aid_request.location.distance

                # Prepare location data for map
                aid_location = {
                    'pk': aid_request.pk,
                    'aid_type': aid_request.aid_type.slug,
                    'status': aid_request.status,
                    'priority': aid_request.priority,
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

            # Prepare data for client-side table
            aid_requests_data.append({
                'id': aid_request.pk,
                'pk': aid_request.pk,  # For consistency with JavaScript updates
                'aid_type_id': aid_request.aid_type.id,
                'aid_type_name': aid_request.aid_type.name,
                'aid_type_slug': aid_request.aid_type.slug,
                'aid_type': aid_request.aid_type.slug,  # For consistency with JavaScript updates
                'priority': aid_request.priority,
                'priority_display': aid_request.priority_display,
                'status': aid_request.status,
                'status_display': aid_request.status_display,
                'requester_name': f"{aid_request.requestor_first_name} {aid_request.requestor_last_name}",
                'address': aid_request.street_address,
                'city': aid_request.city,
                'state': aid_request.state,
                'zip_code': aid_request.zip_code,
                'country': aid_request.country,
                'full_address': f"{aid_request.street_address}, {aid_request.city}, {aid_request.state}, {aid_request.zip_code}, {aid_request.country}",
                'address_found': aid_request.location.address_found if aid_request.location else None,
                'location_status': aid_request.location_status,
                'latitude': float(aid_request.location.latitude) if aid_request.location else None,
                'longitude': float(aid_request.location.longitude) if aid_request.location else None,
                'distance': float(distance) if distance else None,
                'updated_at': aid_request.updated_at.isoformat() if aid_request.updated_at else None,
                'created_at': aid_request.created_at.isoformat() if aid_request.created_at else None,
            })

        # Use the custom JSON encoder to handle Decimal objects
        context['aid_requests_json'] = json.dumps(aid_requests_data, cls=DecimalEncoder)
        context['aid_locations'] = json.dumps(aid_locations, cls=DecimalEncoder)

        ic(f"Sending {len(aid_requests_data)} unique aid requests to the client")
        ic(f"Sending {len(aid_locations)} aid locations to the map")

        # Count by status and priority for dashboard summary
        status_counts = {}
        priority_counts = {}
        aid_type_counts = {}

        # Use the already filtered and de-duplicated aid_requests_data
        for aid_request_data in aid_requests_data:
            status = aid_request_data['status_display']
            status_value = aid_request_data['status']  # Add the raw value for filtering
            status_counts[status] = {
                'count': status_counts.get(status, {}).get('count', 0) + 1,
                'value': status_value
            }

            priority = aid_request_data['priority_display']
            priority_value = aid_request_data['priority']  # Add the raw value for filtering
            priority_counts[priority] = {
                'count': priority_counts.get(priority, {}).get('count', 0) + 1,
                'value': priority_value
            }

            aid_type = aid_request_data['aid_type_name']
            aid_type_value = aid_request_data['aid_type']  # Add the raw value for filtering
            aid_type_counts[aid_type] = {
                'count': aid_type_counts.get(aid_type, {}).get('count', 0) + 1,
                'value': aid_type_value
            }

        context['status_counts'] = status_counts
        context['priority_counts'] = priority_counts
        context['aid_type_counts'] = aid_type_counts

        ic(f"Status counts (from unique records): {status_counts}")
        ic(f"Priority counts (from unique records): {priority_counts}")
        ic(f"Aid type counts (from unique records): {aid_type_counts}")

        # Define status groups for filter buttons
        status_groups = {
            'active': ['new', 'assigned', 'resolved'],
            'inactive': ['closed', 'rejected', 'other']
        }
        context['status_groups'] = status_groups

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
            field_op_lat = float(self.field_op.latitude)
            field_op_lon = float(self.field_op.longitude)
            min_lat = float(min(min_lat, field_op_lat))
            max_lat = float(max(max_lat, field_op_lat))
            min_lon = float(min(min_lon, field_op_lon))
            max_lon = float(max(max_lon, field_op_lon))
            center_lat = (min_lat + max_lat) / 2
            center_lon = (min_lon + max_lon) / 2
            context['center_lat'] = center_lat
            context['center_lon'] = center_lon
            max_distance = geodesic(
                (min_lat, min_lon),
                (max_lat, max_lon)
            ).kilometers

            ic(f"Map bounds: ({min_lat},{min_lon}) to ({max_lat},{max_lon}), max_distance: {max_distance}km")

            context['max_distance'] = max_distance
            context['ring_size'] = int(max_distance / 10)
            if context['ring_size'] < 1:
                context['ring_size'] = 1
            context['map_zoom'] = calculate_zoom(max_distance/1.5)

        return context
