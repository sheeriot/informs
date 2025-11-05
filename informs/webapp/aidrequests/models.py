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
    latitude = models.DecimalField(max_digits=7, decimal_places=5)
    longitude = models.DecimalField(max_digits=8, decimal_places=5)
    ring_size = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=None,
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
        Calculates the primary location status using efficient database queries.
        Order of precedence: 'confirmed', then 'new'.
        """

        is_confirmed = self.locations.filter(status='confirmed').exists()

        if is_confirmed:
            return 'confirmed'

        is_new = self.locations.filter(status='new').exists()
        # ic(f"AidRequest #{self.pk}: any new? ->", is_new)
        if is_new:
            return 'new'

        ic(f"AidRequest #{self.pk}: returning None")
        return None

    @property
    def location(self):
        """
        Finds the primary location object using an ordered database query to ensure
        the oldest of the highest-precedence locations is returned.
        Order of precedence: 'confirmed', then 'new'.
        """
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
    def full_address(self):
        """Returns the full address as a single string."""
        parts = [self.street_address, self.city, self.state, self.zip_code, self.country.name if self.country else '']
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
        if self.locations.exists():
            latest_location = self.locations.latest('created_at')
            location_data = {
                'latitude': latest_location.latitude,
                'longitude': latest_location.longitude,
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
            'address': {'full': self.full_address},
            'requester_name': self.requester_full_name,
        }

    class Meta:
        verbose_name = 'Aid Request'
        verbose_name_plural = 'Aid Requests'

    def __str__(self):
        return str(self.id)

    def save(self, *args, **kwargs):
        """
        Custom save method to trigger CoT updates and log changes.
        """
        # If requester_full_name is provided and first/last are blank, parse it.
        # This should happen before the first save.
        if self.requester_full_name and not self.requester_first_name and not self.requester_last_name:
            parts = self.requester_full_name.split()
            self.requester_first_name = parts[0]
            if len(parts) > 1:
                self.requester_last_name = ' '.join(parts[1:])

        note = kwargs.pop('note', None)
        note_markdown = kwargs.pop('note_markdown', False)
        source_ip = kwargs.pop('source_ip', None)

        is_new = self._state.adding
        if is_new:
            # For new requests, we don't have an original state to compare
            super(AidRequest, self).save(*args, **kwargs)
            # The auditlog will now capture the creation event.
            # We also create a user-visible ActionLog.

            excluded_fields = ['id', 'created_at', 'updated_at', 'field_op']
            data_dict = model_to_dict(self, exclude=excluded_fields)
            if source_ip:
                data_dict['source_ip'] = source_ip

            log_text = json.dumps(data_dict, indent=4, default=str)


            ActionLog.objects.create(
                aid_request=self,
                log_type='system',
                event_name="Request Created",
                event_text=log_text,
                text_markdown=False,
                created_by=self.created_by,
                agent_name=self.created_by.username if self.created_by else "System"
            )
            # Do not return early, allow auditlog to process.

        # For existing requests, get the original state from the database
        if not is_new:
            try:
                original = AidRequest.objects.get(pk=self.pk)
            except AidRequest.DoesNotExist:
                # This should not happen in a save on an existing object, but handle it gracefully.
                super(AidRequest, self).save(*args, **kwargs)
                return

            status_changed = original.status != self.status
            priority_changed = original.priority != self.priority

            # Now, save the changes to the database
            super(AidRequest, self).save(*args, **kwargs)

            # After saving, create logs for what changed
            if status_changed:
                ActionLog.objects.create(
                    aid_request=self,
                    log_type='system',
                    event_name="Status Changed",
                    event_text=f"Status changed from '{original.get_status_display()}' to '{self.get_status_display()}'.",
                    created_by=getattr(self, 'updated_by', None),
                    agent_name=self.updated_by.username if getattr(self, 'updated_by', None) else "System",
                    note=note,
                    note_markdown=note_markdown
                )
            if priority_changed:
                ActionLog.objects.create(
                    aid_request=self,
                    log_type='system',
                    event_name="Priority Changed",
                    event_text=f"Priority changed from '{original.get_priority_display()}' to '{self.get_priority_display()}'.",
                    created_by=getattr(self, 'updated_by', None),
                    agent_name=self.updated_by.username if getattr(self, 'updated_by', None) else "System",
                    note=note,
                    note_markdown=note_markdown
                )

            # Trigger CoT update if ANY field on an existing request was updated.
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
            create_static_map(self, synchronous=True)
            self.refresh_from_db() # Refresh to get the map_filename

            log_text = render_to_string(
                'aidrequests/logs/location_created_log.md',
                {'location': self}
            )
            ActionLog.objects.create(
                aid_request=self.aid_request,
                log_type='location',
                event_name=f"Location #{self.pk} Created",
                event_text=log_text,
                text_markdown=True,
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
                'aidrequests/logs/location_status_change_log.md',
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
                text_markdown=True,
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
    ]

    aid_request = models.ForeignKey(AidRequest, on_delete=models.CASCADE, related_name='action_logs')
    log_type = models.CharField(max_length=10, choices=LOG_TYPE_CHOICES, default='user')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    # New structured fields
    event_name = models.CharField(max_length=255, blank=True)
    event_text = models.TextField(blank=True)
    note = models.TextField(blank=True)
    text_markdown = models.BooleanField(default=False, help_text="Flag for event_text markdown")
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
