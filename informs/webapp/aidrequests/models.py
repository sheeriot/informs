"""
This module  for AidRequests and FieldOps
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.urls import reverse
from django_q.tasks import async_task
from geopy.distance import geodesic
from django_countries.fields import CountryField
import json
from icecream import ic
from django.template.loader import render_to_string
from django.db.models import Case, When, Value
from django.forms.models import model_to_dict

from .timestamped_model import TimeStampedModel
from takserver.models import TakServer
from auditlog.registry import auditlog
# from .maps import create_static_map # This was causing a circular import

from informs.utils import takuid_new


class FieldOpNotify(TimeStampedModel):
    """Notify contacts for Field Operations"""
    name = models.CharField(max_length=50)

    TYPE_CHOICES = [
        ('email-individual', 'Email Individual'),
        ('email-group', 'Email Group'),
        ('sms', 'SMS'),
    ]
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    email = models.EmailField(blank=True, null=True)
    sms_number = models.CharField(max_length=15, blank=True, null=True)

    class Meta:
        verbose_name = 'Notify Address'
        verbose_name_plural = 'Notify Addresses'

    def __str__(self):
        address = self.email if self.email else self.sms_number
        return f"{self.name}:{self.type}:{address}"

    def clean(self):
        if (self.email and self.sms_number):
            raise ValidationError('Must provide EMAIL -or- SMS, not both')
        if self.type.startswith('email') and not self.email:
            raise ValidationError('Email address must be provided for email notifications')
        if self.type == 'sms' and not self.sms_number:
            raise ValidationError('SMS address must be provided for sms notifications')


class AidType(models.Model):
    """Model to define types of aid"""
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True, null=True)
    weight = models.PositiveIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text='1-10, lower is higher priority for lists'
    )

    ICON_CHOICES = [
            ('marker', 'marker'),
            ('marker-thick', 'marker-thick'),
            ('marker-circle', 'marker-circle'),
            ('marker-flat', 'marker-flat'),
            ('marker-square', 'marker-square'),
            ('marker-square-cluster', 'marker-square-cluster'),
            ('marker-arrow', 'marker-arrow'),
            ('marker-ball-pin', 'marker-ball-pin'),
            ('marker-square-rounded', 'marker-square-rounded'),
            ('marker-square-rounded-cluster', 'marker-square-rounded-cluster'),
            ('flag', 'flag'),
            ('flag-triangle', 'flag-triangle'),
            ('triangle', 'triangle'),
            ('triangle-thick', 'triangle-thick'),
            ('triangle-arrow-up', 'triangle-arrow-up'),
            ('triangle-arrow-left', 'triangle-arrow-left'),
            ('hexagon', 'hexagon'),
            ('hexagon-thick', 'hexagon-thick'),
            ('hexagon-rounded', 'hexagon-rounded'),
            ('hexagon-rounded-thick', 'hexagon-rounded-thick'),
            ('pin', 'pin'),
            ('pin-round', 'pin-round'),
            ('rounded-square', 'rounded-square'),
            ('rounded-square-thick', 'rounded-square-thick'),
            ('arrow-up', 'arrow-up'),
            ('arrow-up-thin', 'arrow-up-thin'),
            ('car', 'car'),
        ]

    # https://learn.microsoft.com/en-us/azure/azure-maps/how-to-use-image-templates-web-sdk#list-of-image-templates

    icon_name = models.CharField(max_length=30, choices=ICON_CHOICES,  default='helicopter')
    icon_color = models.CharField(max_length=7, default='blue')  # Hex color code or name, e.g., #FF5733
    icon_scale = models.DecimalField(max_digits=4, decimal_places=2, default=1.00, validators=[
        MinValueValidator(0.00),
        MaxValueValidator(5.00)
    ])

    COT_ICON_CHOICES = [(key, key) for key in settings.COT_ICONS.keys()]
    cot_icon = models.CharField(max_length=50, blank=True, null=True)

    bs_icon = models.CharField(max_length=50, blank=True, null=True, help_text="Name of the Bootstrap icon to use.")

    class Meta:
        verbose_name = 'Aid Type'
        verbose_name_plural = 'Aid Types'

    def __str__(self):
        return self.name


class FieldOp(TimeStampedModel):
    """Field Ops"""
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=50)
    country = CountryField(default='US', help_text="Default country for new aid requests.")
    latitude = models.DecimalField(
        max_digits=8,
        decimal_places=5,
        help_text="Maximum 5 decimal places.",
        validators=[MinValueValidator(-90), MaxValueValidator(90)]
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=5,
        help_text="Maximum 5 decimal places.",
        validators=[MinValueValidator(-180), MaxValueValidator(180)]
    )
    ring_size = models.PositiveIntegerField(
        default=1,
        help_text='kilometers'
    )

    aid_types = models.ManyToManyField(AidType, related_name='field_ops', default=1, blank=True)

    tak_server = models.ForeignKey(
        TakServer, related_name='field_ops', on_delete=models.SET_NULL, null=True, blank=True
    )
    created_by = models.ForeignKey(
        User, related_name='field_ops_created', on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_by = models.ForeignKey(
        User, related_name='field_ops_updated', on_delete=models.SET_NULL, null=True, blank=True
    )

    notify = models.ManyToManyField(FieldOpNotify, blank=True)

    disable_cot = models.BooleanField(
        default=False
    )

    class Meta:
        verbose_name = 'Field Operation'
        verbose_name_plural = 'Field Operations'

    def __str__(self):
        return str(self.name)


class AidRequest(TimeStampedModel):
    """ scope to a field operation object"""
    field_op = models.ForeignKey(FieldOp, on_delete=models.CASCADE,
                                 null=True, related_name='aid_requests')
    # 1. Requester details
    requester_first_name = models.CharField(max_length=100, blank=True)
    requester_last_name = models.CharField(max_length=100, blank=True)
    requester_phone = models.CharField(max_length=20, blank=True)
    requester_phone_is_whatsapp = models.BooleanField(default=False)
    requester_email = models.EmailField(blank=True)

    @property
    def requester_full_name(self):
        return f"{self.requester_first_name} {self.requester_last_name}".strip()

    # 2. Contact details for party needing assistance
    aid_first_name = models.CharField(max_length=20, blank=True)
    aid_last_name = models.CharField(max_length=30, blank=True)
    aid_email = models.EmailField(blank=True)
    aid_phone = models.CharField(max_length=25, blank=True)
    use_whatsapp_aid = models.BooleanField(default=False)

    @property
    def aid_contact(self):
        return bool(self.aid_first_name or self.aid_last_name or self.aid_email or self.aid_phone)

    @property
    def location_status(self):
        """
        Calculates the primary location status.
        Uses prefetched 'sorted_locations' if available to avoid DB queries.
        Order of precedence: 'confirmed', then 'new'.
        """
        if hasattr(self, 'sorted_locations'):
            if not self.sorted_locations:
                return None

            # sorted_locations is ordered by: confirmed(1), new(2), other(3)
            top_loc = self.sorted_locations[0]

            if top_loc.status == 'confirmed':
                return 'confirmed'
            if top_loc.status == 'new':
                return 'new'

            return None

        is_confirmed = self.locations.filter(status='confirmed').exists()

        if is_confirmed:
            return 'confirmed'

        is_new = self.locations.filter(status='new').exists()
        # ic(f"AidRequest #{self.pk}: any new? ->", is_new)
        if is_new:
            return 'new'

        # ic(f"AidRequest #{self.pk}: returning None")
        return None

    @property
    def location(self):
        """
        Finds the primary location object.
        Uses prefetched 'sorted_locations' if available to avoid DB queries.
        Order of precedence: 'confirmed', then 'new'.
        """
        if hasattr(self, 'sorted_locations'):
            if not self.sorted_locations:
                return None

            # sorted_locations is ordered by: confirmed(1), new(2), other(3)
            top_loc = self.sorted_locations[0]

            if top_loc.status in ['confirmed', 'new']:
                return top_loc

            return None

        confirmed_loc = self.locations.filter(status='confirmed').order_by('created_at').first()
        if confirmed_loc:
            return confirmed_loc

        new_loc = self.locations.filter(status='new').order_by('created_at').first()
        if new_loc:
            return new_loc

        return None

    # 3. Location of assistance request
    street_address = models.CharField(max_length=50, blank=True)
    city = models.CharField(max_length=25, blank=True)
    state = models.CharField(max_length=20, blank=True)
    zip_code = models.CharField(max_length=10, blank=True)
    country = CountryField(blank=True)

    @property
    def provided_address(self):
        """Returns the full address as a single string, without the country."""
        parts = [self.street_address, self.city, self.state, self.zip_code]
        return ", ".join(filter(None, parts))

    # 4. Type of assistance requested
    # ASSISTANCE_CHOICES = [
    #     ('evacuation', 'Evacuation'),
    #     ('re_supply', 'Re-supply'),
    #     ('welfare_check', 'Welfare check'),
    #     ('other', 'Other'),
    # ]
    # 4. Type of assistance requested
    aid_type = models.ForeignKey(AidType, on_delete=models.CASCADE)
    aid_description = models.TextField(blank=True, null=True)
    # assistance_type = models.CharField(max_length=20, choices=ASSISTANCE_CHOICES)
    # assistance_description = models.TextField(blank=True, null=True)

    # 5. Group size
    group_size = models.PositiveIntegerField(blank=True, null=True)

    # 6. Preferred contact methods
    contact_methods = models.TextField(blank=True, null=True)

    # 7. Emergency medical needs
    medical_needs = models.TextField(blank=True, null=True)

    # 8. Supplies needed
    supplies_needed = models.TextField(blank=True, null=True)

    # 9. Welfare check information
    welfare_check_info = models.TextField(blank=True, null=True)

    # 10. Additional information
    additional_info = models.TextField(blank=True, null=True)

    created_by = models.ForeignKey(
        User, related_name='aid_requests_created', on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_by = models.ForeignKey(
        User, related_name='aid_requests_updated', on_delete=models.SET_NULL, null=True, blank=True
    )

    PRIORITY_CHOICES = [
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
        (None, 'None'),
    ]

    priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default=None,
        null=True,
        blank=True,
    )

    STATUS_CHOICES = [
        ('new', 'New'),
        ('assigned', 'Assigned'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
        ('rejected', 'Rejected'),
        ('other', 'Other'),
    ]

    # Status group definitions
    ACTIVE_STATUSES = ['new', 'assigned', 'resolved']
    INACTIVE_STATUSES = ['closed', 'rejected', 'other']

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='new',
    )

    @property
    def is_active(self):
        """
        Checks if the request status is one of the active statuses.
        """
        return self.status in self.ACTIVE_STATUSES

    def to_dict(self):
        """
        Serializes the AidRequest object to a dictionary for JSON embedding.
        """
        location_data = None
        # Use the 'location' property which already finds the primary location
        primary_location = self.location
        if primary_location:
            location_data = {
                'latitude': primary_location.latitude,
                'longitude': primary_location.longitude,
                'address_display': self.provided_address, # The user-provided address
                'free_form_address': primary_location.free_form_address, # The machine-geocoded address
            }

        aid_type_data = None
        if self.aid_type:
            aid_type_data = {
                'name': self.aid_type.name,
                'slug': self.aid_type.slug,
            }

        return {
            'id': self.pk,
            'status': self.status,
            'status_display': self.get_status_display(),
            'priority': self.priority,
            'priority_display': self.get_priority_display(),
            'aid_type': aid_type_data,
            'location': location_data,
            'group_size': self.group_size,
            'requester_name': self.requester_full_name,
        }

    class Meta:
        verbose_name = 'Aid Request'
        verbose_name_plural = 'Aid Requests'

    def __str__(self):
        return f"Request for {self.requester_full_name} - {self.aid_type.name} ({self.pk})"

    @staticmethod
    def get_filtered_counts(base_queryset, statuses, priorities, aid_types):
        """
        A static method to calculate counts efficiently using conditional aggregation.
        """
        # Overall counts for the entire field_op (ignoring filters)
        # We can get these in a single query with aggregation
        aggregates = base_queryset.aggregate(
            total=models.Count('id'),
            active=models.Count(
                Case(When(status__in=AidRequest.ACTIVE_STATUSES, then=1))
            ),
            inactive=models.Count(
                Case(When(status__in=AidRequest.INACTIVE_STATUSES, then=1))
            )
        )

        total_requests = aggregates['total']
        active_requests_count = aggregates['active']
        inactive_requests_count = aggregates['inactive']

        # Build the filtered queryset
        filtered_qs = base_queryset
        if statuses and statuses != 'all':
            filtered_qs = filtered_qs.filter(status__in=statuses)
        if priorities and priorities != 'all':
            if 'none' in priorities:
                priorities.remove('none')
                q_objects = models.Q(priority__in=priorities) | models.Q(priority__isnull=True)
                filtered_qs = filtered_qs.filter(q_objects)
            else:
                filtered_qs = filtered_qs.filter(priority__in=priorities)
        if aid_types and aid_types != 'all':
            filtered_qs = filtered_qs.filter(aid_type__slug__in=aid_types)

        # Total number of requests that match the current filters
        matched_count = filtered_qs.count()

        # Initialize counts dictionary
        counts = {
            'total': total_requests,
            'matched': matched_count,
            'groups': {
                'active': {'total': active_requests_count, 'filtered': 0},
                'inactive': {'total': inactive_requests_count, 'filtered': 0}
            },
            'byStatus': {},
            'byAidType': {},
            'byPriority': {},
        }

        # --- Status Counts (Filtered) ---
        # Calculate counts for active/inactive groups within the filtered set
        filtered_status_aggregates = filtered_qs.aggregate(
            active_filtered=models.Count(
                Case(When(status__in=AidRequest.ACTIVE_STATUSES, then=1))
            ),
            inactive_filtered=models.Count(
                Case(When(status__in=AidRequest.INACTIVE_STATUSES, then=1))
            )
        )
        counts['groups']['active']['filtered'] = filtered_status_aggregates['active_filtered']
        counts['groups']['inactive']['filtered'] = filtered_status_aggregates['inactive_filtered']

        # --- Calculate specific facet counts ---
        # 1. Status Counts: Apply priority and aid_type filters only
        status_qs = base_queryset
        if priorities and priorities != 'all':
            if 'none' in priorities:
                q_objects = models.Q(priority__in=priorities) | models.Q(priority__isnull=True)
                status_qs = status_qs.filter(q_objects)
            else:
                status_qs = status_qs.filter(priority__in=priorities)

        if aid_types and aid_types != 'all':
            status_qs = status_qs.filter(aid_type__slug__in=aid_types)

        status_counts_data = status_qs.values('status').annotate(count=models.Count('id'))
        status_map = {item['status']: item['count'] for item in status_counts_data}

        for status_code, _ in AidRequest.STATUS_CHOICES:
            counts['byStatus'][status_code] = status_map.get(status_code, 0)

        # 2. Aid Type Counts: Apply status and priority filters only
        aid_type_qs = base_queryset
        if statuses and statuses != 'all':
            aid_type_qs = aid_type_qs.filter(status__in=statuses)

        if priorities and priorities != 'all':
            if 'none' in priorities:
                q_objects = models.Q(priority__in=priorities) | models.Q(priority__isnull=True)
                aid_type_qs = aid_type_qs.filter(q_objects)
            else:
                aid_type_qs = aid_type_qs.filter(priority__in=priorities)

        aid_type_counts_data = aid_type_qs.values('aid_type__slug').annotate(count=models.Count('id'))
        aid_type_map = {item['aid_type__slug']: item['count'] for item in aid_type_counts_data}

        # 3. Priority Counts: Apply status and aid_type filters only
        priority_qs = base_queryset
        if statuses and statuses != 'all':
            priority_qs = priority_qs.filter(status__in=statuses)

        if aid_types and aid_types != 'all':
            priority_qs = priority_qs.filter(aid_type__slug__in=aid_types)

        priority_counts_data = priority_qs.values('priority').annotate(count=models.Count('id'))
        priority_map = {item['priority']: item['count'] for item in priority_counts_data}

        for prio_code, _ in AidRequest.PRIORITY_CHOICES:
            key = prio_code if prio_code is not None else None
            count = priority_map.get(key, 0)
            out_key = prio_code if prio_code is not None else 'none'
            counts['byPriority'][out_key] = count

        # Aid Type manual fill (since we don't have the full list of slugs here easily)
        # The original method queried AidType objects.
        # To keep this efficient, we will just return the map we have.
        # The javascript or view calling this might need to merge with all available types if it needs zero counts.
        # However, the original code DID iterate over all types.
        # Let's replicate that logic by doing a single query for aid types if we can, or assume the caller handles it.
        # Actually, the original code imported AidType locally. Let's do that.
        from .models import AidType # Local import to avoid circular dependency
        # We need the field_op to filter aid types. base_queryset has a field_op filter.
        # We can get one instance to find the field_op.
        first_req = base_queryset.first()
        if first_req:
            all_aid_types = AidType.objects.filter(field_ops=first_req.field_op)
            for at in all_aid_types:
                if at.slug not in counts['byAidType']:
                    counts['byAidType'][at.slug] = 0
                # If it is in the map, it's already set correctly from the aggregation above.
                # Wait, the map has the counts. We just need to ensure 0s are there.
                # Actually, the map aggregation is what we want.
                # We just need to merge.
                if at.slug in aid_type_map:
                    counts['byAidType'][at.slug] = aid_type_map[at.slug]
                else:
                    counts['byAidType'][at.slug] = 0

        return counts

    def save(self, *args, **kwargs):
        """
        Custom save method to trigger CoT updates and log all changes.
        This method is designed to be the single point of truth for logging
        changes to the AidRequest model. It can automatically detect changes
        or accept specific event details.
        """
        # --- 1. Pop all custom kwargs at the start ---
        # These are not part of the model, so they must be removed before super().save()
        note = kwargs.pop('note', None)
        note_markdown = kwargs.pop('note_markdown', False)
        source_ip = kwargs.pop('source_ip', None)
        # Allow views to pass pre-formatted event details for logging
        event_name = kwargs.pop('event_name', None)
        event_text = kwargs.pop('event_text', None)

        is_new = self._state.adding
        original = None
        if not is_new:
            try:
                # Get the object's state from the DB before we change it
                original = AidRequest.objects.get(pk=self.pk)
            except AidRequest.DoesNotExist:
                pass  # Should not happen on an update, but handle gracefully

        # --- 2. Call the actual save method ONCE ---
        super(AidRequest, self).save(*args, **kwargs)

        # --- 3. Handle Logging ---
        if is_new:
            # For new requests, log the creation event
            excluded_fields = ['id', 'created_at', 'updated_at', 'field_op']
            data_dict = model_to_dict(self, exclude=excluded_fields)
            if source_ip:
                data_dict['source_ip'] = source_ip
            log_details = json.dumps(data_dict, indent=4, default=str)

            ActionLog.objects.create(
                aid_request=self,
                log_type='system',
                event_name="Request Created",
                event_text=log_details,
                created_by=self.created_by,
                agent_name=self.created_by.username if self.created_by else "System"
            )
        elif original: # For existing requests, log the updates
            changes = []
            log_type = 'system'  # Default log type

            if event_text: # If the view provided event_text, use it
                final_event_text = event_text
            else: # Otherwise, auto-detect changes
                fields_to_check = [
                    'status', 'priority', 'street_address', 'city', 'state', 'zip_code',
                    'requester_first_name', 'requester_last_name', 'requester_phone',
                    'requester_email', 'requester_phone_is_whatsapp', 'group_size',
                    'aid_description', 'supplies_needed', 'medical_needs',
                    'welfare_check_info', 'additional_info'
                ]
                for field in fields_to_check:
                    old_value = getattr(original, field)
                    new_value = getattr(self, field)
                    if old_value != new_value:
                        if field == 'status':
                            log_type = 'status'
                        elif field == 'priority':
                            log_type = 'priority'

                        old_display = getattr(original, f'get_{field}_display', lambda: old_value)() or 'None'
                        new_display = getattr(self, f'get_{field}_display', lambda: new_value)()

                        # Indent every line of the value after the first to align with the start of the value
                        indented_old = str(old_display).replace('\n', '\n' + ' ' * 7)
                        indented_new = str(new_display).replace('\n', '\n' + ' ' * 7)

                        field_title = field.replace('_', ' ').title()
                        # Format with right-aligned labels and indented values
                        change_str = (
                            f"{field_title}:\n"
                            f" from: {indented_old}\n"
                            f"   to: {indented_new}"
                        )
                        changes.append(change_str)

                final_event_text = "\n\n".join(changes)

            final_event_name = event_name or "Aid Request Updated"

            if final_event_text:  # Only create a log if something actually changed
                log_entry = ActionLog(
                    aid_request=self,
                    log_type=log_type,
                    event_name=final_event_name,
                    event_text=final_event_text,
                    created_by=getattr(self, 'updated_by', None),
                    agent_name=self.updated_by.username if getattr(self, 'updated_by', None) else "System",
                    note=note,
                    note_markdown=note_markdown
                )
                log_entry.save()

            # --- 4. Trigger CoT update on any change for an existing request ---
            if not self.field_op.disable_cot:
                async_task(
                    'aidrequests.tasks.send_cot_task',
                    field_op_slug=self.field_op.slug,
                    mark_type='aid',
                    aidrequest=self.pk,
                    task_name=f"Update_CoT_AR_{self.pk}"
                )


class AidLocationManager(models.Manager):
    def sorted_for_display(self):
        """
        Returns a queryset of locations sorted in the standard display order:
        1. Confirmed (newest first)
        2. New (newest first)
        3. Rejected (newest first)
        4. Others (newest first)
        """
        status_order = Case(
            When(status='confirmed', then=Value(1)),
            When(status='new', then=Value(2)),
            When(status='rejected', then=Value(3)),
            default=Value(4)
        )
        return self.get_queryset().order_by(status_order, '-created_at')


class AidLocation(TimeStampedModel):
    """Location details for AidRequest"""
    aid_request = models.ForeignKey(AidRequest, on_delete=models.CASCADE, related_name='locations')
    uid = models.CharField(max_length=36, default=takuid_new, unique=True)

    STATUS_CHOICES = [
        ('new', 'New'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
        ('candidate', 'Candidate'),
        ('other', 'Other'),
    ]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)

    latitude = models.DecimalField(max_digits=8, decimal_places=5)
    longitude = models.DecimalField(max_digits=9, decimal_places=5)

    SOURCE_CHOICES = [
        ('manual', 'Manual'),
        ('azure_maps', 'Azure Maps'),
        ('address_provided', 'Address Provided'),
        ('device_location', 'Device Location'),
        ('other', 'Other'),
        ('user_picked', 'User Picked'),
    ]
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    note = models.TextField(blank=True, null=True)

    address_searched = models.CharField(max_length=100, null=True, blank=True)
    free_form_address = models.CharField(max_length=255, blank=True, null=True)
    geocode_json = models.JSONField(null=True, blank=True)

    distance = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)

    map_filename = models.CharField(max_length=100, null=True, blank=True)

    created_by = models.ForeignKey(
        User, related_name='aid_locations_created', on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_by = models.ForeignKey(
        User, related_name='aid_locations_updated', on_delete=models.SET_NULL, null=True, blank=True
    )

    objects = AidLocationManager()

    class Meta:
        verbose_name = 'Aid Location'
        verbose_name_plural = 'Aid Locations'

    def __str__(self):
        return f"Location ({round(self.latitude, 5)}, {round(self.longitude, 5)}) - {self.status} - {self.source}"

    @property
    def pretty_geocode_json(self):
        """Returns a pretty-printed JSON string of the geocode_json field."""
        if self.geocode_json:
            return json.dumps(self.geocode_json, indent=4)
        return ""

    @property
    def static_map_url(self):
        """
        Returns a secure, cacheable URL for the static map image.
        """
        if self.map_filename:
            return reverse('serve_map_file', kwargs={
                'field_op': self.aid_request.field_op.slug,
                'aid_request_pk': self.aid_request.pk,
                'filename': self.map_filename,
            })
        return None

    def save(self, *args, **kwargs):
        """ override save to send CoT """
        from .views.maps import create_static_map # Local import to avoid circular dependency

        note = kwargs.pop('note', None)
        note_markdown = kwargs.pop('note_markdown', False)

        is_new = self._state.adding
        status_changed = False
        old_status = None

        if not is_new:
            try:
                original = AidLocation.objects.get(pk=self.pk)
                old_status = original.status
                if original.status != self.status:
                    status_changed = True

                # If this location is becoming confirmed, reject any others.
                if self.status == 'confirmed' and original.status != 'confirmed':
                    other_confirmed = AidLocation.objects.filter(
                        aid_request=self.aid_request,
                        status='confirmed'
                    ).exclude(pk=self.pk)

                    for loc in other_confirmed:
                        loc.status = 'rejected'
                        # Pass the user who initiated the change
                        loc.updated_by = self.updated_by
                        # The note will be picked up by the save() method and added to the ActionLog
                        loc.save(
                            note=f"Automatically rejected because Location #{self.pk} was confirmed.",
                            note_markdown=False
                        )

            except AidLocation.DoesNotExist:
                # This case should ideally not happen in an update
                pass

        if self.latitude and self.longitude and self.aid_request.field_op:
            op_coords = (self.aid_request.field_op.latitude, self.aid_request.field_op.longitude)
            loc_coords = (self.latitude, self.longitude)
            self.distance = round(geodesic(op_coords, loc_coords).km, 2)

        super(AidLocation, self).save(*args, **kwargs)

        if is_new:
            # Now that the instance is saved and has a PK, generate the map
            # Wait up to 1 second for the map to be generated.
            create_static_map(self, wait_with_timeout=1000)
            self.refresh_from_db() # Refresh to get the map_filename

            log_text = render_to_string(
                'aidrequests/logs/location_created_log.txt',
                {'location': self}
            )
            ActionLog.objects.create(
                aid_request=self.aid_request,
                log_type='location',
                event_name=f"Location #{self.pk} Created",
                event_text=log_text,
                agent_name=self.created_by.username if self.created_by else "System",
                created_by=self.created_by
            )

            # If a new location is created, trigger a CoT update for the parent AidRequest
            if not self.aid_request.field_op.disable_cot:
                async_task(
                    'aidrequests.tasks.send_cot_task',
                    field_op_slug=self.aid_request.field_op.slug,
                    mark_type='aid',
                    aidrequest=self.aid_request.pk,
                    task_name=f"Update_CoT_AR_{self.aid_request.pk}_Loc_{self.pk}_Created"
                )
        elif status_changed:
            if self.status == 'confirmed':
                event_name = f"Location #{self.pk} Confirmed"
            elif self.status == 'rejected':
                # Check if a note is being passed, which indicates an auto-rejection
                if note:
                    event_name = f"Location #{self.pk} Auto-Rejected"
                else:
                    event_name = f"Location #{self.pk} Rejected"
            else:
                event_name = f"Location #{self.pk} Updated"

            log_text = render_to_string(
                'aidrequests/logs/location_status_change_log.txt',
                {
                    'location': self,
                    'old_status': old_status,
                }
            )

            ActionLog.objects.create(
                aid_request=self.aid_request,
                log_type='location',
                event_name=event_name,
                event_text=log_text,
                agent_name=self.updated_by.username if self.updated_by else "System",
                created_by=self.updated_by,
                note=note,
                note_markdown=note_markdown
            )

            # If a location's status changes, trigger a CoT update for the parent AidRequest
            # to ensure the marker reflects the new primary location.
            if not self.aid_request.field_op.disable_cot:
                async_task(
                    'aidrequests.tasks.send_cot_task',
                    field_op_slug=self.aid_request.field_op.slug,
                    mark_type='aid',
                    aidrequest=self.aid_request.pk,
                    task_name=f"Update_CoT_AR_{self.aid_request.pk}_Loc_{self.pk}"
                )

    def get_absolute_url(self):
        return reverse('aid_location_detail', kwargs={'pk': self.pk})


class ActionLog(TimeStampedModel):
    """Action Log for an AidRequest"""
    LOG_TYPE_CHOICES = [
        ('user', 'User'),
        ('system', 'System'),
        ('location', 'Location'),
        ('status', 'Status'),
        ('priority', 'Priority'),
        ('alert', 'Alert'),
    ]

    aid_request = models.ForeignKey(AidRequest, on_delete=models.CASCADE, related_name='action_logs')
    log_type = models.CharField(max_length=10, choices=LOG_TYPE_CHOICES, default='user')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    # New structured fields
    event_name = models.CharField(max_length=255, blank=True)
    event_text = models.TextField(blank=True)
    note = models.TextField(blank=True, null=True)
    note_markdown = models.BooleanField(default=False, help_text="Flag for note markdown")
    agent_name = models.CharField(max_length=150, blank=True)

    def __str__(self):
        return f"{self.log_type} log for {self.aid_request} at {self.created_at}"


auditlog.register(FieldOp,
                  exclude_fields=['created_by', 'created_at', 'updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
auditlog.register(AidRequest,
                  exclude_fields=['created_by', 'created_at', 'updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
auditlog.register(AidLocation,
                  exclude_fields=['created_by', 'created_at', 'updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
auditlog.register(ActionLog,
                  exclude_fields=['created_at', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
auditlog.register(FieldOpNotify,
                  exclude_fields=['created_by', 'created_at', 'updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
