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

from .timestamped_model import TimeStampedModel
from takserver.models import TakServer
from auditlog.registry import auditlog

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
    requester_first_name = models.CharField(max_length=20, blank=True)
    requester_last_name = models.CharField(max_length=30, blank=True)

    @property
    def requester_full_name(self):
        return f"{self.requester_first_name} {self.requester_last_name}".strip()

    requester_email = models.EmailField(blank=True)
    requester_phone = models.CharField(blank=True, max_length=25)
    use_whatsapp = models.BooleanField(default=False)

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
        ic('Checking location_status for AidRequest:', self.pk)
        is_confirmed = self.locations.filter(status='confirmed').exists()
        ic(f"AidRequest #{self.pk}: any confirmed? ->", is_confirmed)
        if is_confirmed:
            return 'confirmed'

        is_new = self.locations.filter(status='new').exists()
        ic(f"AidRequest #{self.pk}: any new? ->", is_new)
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
    country = models.CharField(max_length=30, blank=True)

    @property
    def full_address(self):
        """Returns the full address as a single string."""
        parts = [self.street_address, self.city, self.state, self.zip_code, self.country]
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
        Custom save method to trigger CoT updates on status or priority change.
        """
        is_update = self.pk is not None
        if is_update:
            original = AidRequest.objects.get(pk=self.pk)
            status_changed = original.status != self.status
            priority_changed = original.priority != self.priority

            if (status_changed or priority_changed) and not self.field_op.disable_cot:
                async_task(
                    'aidrequests.tasks.send_cot_task',
                    field_op_slug=self.field_op.slug,
                    mark_type='aid',
                    aidrequest=self.pk,
                    task_name=f"Update_CoT_AR_{self.pk}"
                )

        super(AidRequest, self).save(*args, **kwargs)


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

    def save(self, *args, **kwargs):
        """ override save to send CoT """
        is_new = self._state.adding
        status_changed = False
        old_status = None

        if not is_new:
            try:
                original = AidLocation.objects.get(pk=self.pk)
                old_status = original.status
                if original.status != self.status:
                    status_changed = True
            except AidLocation.DoesNotExist:
                # This case should ideally not happen in an update
                pass

        if self.latitude and self.longitude and self.aid_request.field_op:
            op_coords = (self.aid_request.field_op.latitude, self.aid_request.field_op.longitude)
            loc_coords = (self.latitude, self.longitude)
            self.distance = round(geodesic(op_coords, loc_coords).km, 2)

        super(AidLocation, self).save(*args, **kwargs)

        if is_new:
            message_data = {
                "event_name": "Location Created",
                "event_text": f"New location added: {self.latitude}, {self.longitude} with status '{self.get_status_display()}' and source '{self.get_source_display()}'.",
                "agent": self.created_by.username if self.created_by else "System"
            }
            ActionLog.objects.create(
                aid_request=self.aid_request,
                log_type='location',
                message=json.dumps(message_data),
                created_by=self.created_by
            )
        elif status_changed:
            message_data = {
                "event_name": "Location Updated",
                "event_text": f"Location status changed from '{old_status}' to '{self.get_status_display()}'.",
                "agent": self.updated_by.username if self.updated_by else "System"
            }
            ActionLog.objects.create(
                aid_request=self.aid_request,
                log_type='location',
                message=json.dumps(message_data),
                created_by=self.updated_by
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
    is_markdown = models.BooleanField(default=False)
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
