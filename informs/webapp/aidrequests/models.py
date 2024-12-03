"""
This module  for AidRequests and FieldOps
"""

from django.db import models
from .timestamped_model import TimeStampedModel
# from django.conf import settings
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from auditlog.registry import auditlog


class FieldOp(TimeStampedModel):
    """Field Ops"""
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=50)
    latitude = models.DecimalField(max_digits=4, decimal_places=2)
    longitude = models.DecimalField(max_digits=5, decimal_places=2)

    created_by = models.ForeignKey(
        User, related_name='field_ops_created', on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_by = models.ForeignKey(
        User, related_name='field_ops_updated', on_delete=models.SET_NULL, null=True, blank=True
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
    # 1. Requestor details
    requestor_first_name = models.CharField(max_length=20)
    requestor_last_name = models.CharField(max_length=30)

    requestor_email = models.EmailField(blank=True)
    requestor_phone = models.CharField(blank=True, max_length=12)  # Format: 555-555-5555

    # 2. Contact details for party needing assistance
    assistance_first_name = models.CharField(max_length=20, blank=True)
    assistance_last_name = models.CharField(max_length=30, blank=True)
    assistance_email = models.EmailField(blank=True)
    assistance_phone = models.CharField(max_length=12, blank=True)

    # 3. Location of assistance request
    street_address = models.CharField(max_length=50)
    city = models.CharField(max_length=25)
    state = models.CharField(max_length=20)
    zip_code = models.CharField(max_length=10, blank=True)
    country = models.CharField(max_length=30, blank=True)

    # 4. Type of assistance requested
    ASSISTANCE_CHOICES = [
        ('evacuation', 'Evacuation'),
        ('re_supply', 'Re-supply'),
        ('welfare_check', 'Welfare check'),
        ('other', 'Other (please describe)'),
    ]
    assistance_type = models.CharField(max_length=20, choices=ASSISTANCE_CHOICES)
    assistance_description = models.TextField(blank=True, null=True)

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
        (None, 'None'),
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
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

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='new',
    )

    class Meta:
        verbose_name = 'Aid Request'
        verbose_name_plural = 'Aid Requests'

    def __str__(self):
        return f"""AidRequest-{self.pk}: {self.requestor_first_name} {self.requestor_last_name}
               - {self.assistance_type}"""


class AidLocation(TimeStampedModel):
    """Location details for AidRequest"""
    aid_request = models.ForeignKey(AidRequest, on_delete=models.CASCADE, related_name='locations')

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
        ('other', 'Other'),
    ]
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    note = models.TextField(blank=True, null=True)

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
        return f"Location ({self.latitude}, {self.longitude}) - {self.status} - {self.source}"


class AidRequestLog(TimeStampedModel):
    aid_request = models.ForeignKey(
        'AidRequest',
        on_delete=models.CASCADE,
        related_name='logs'
    )
    log_entry = models.TextField()
    created_by = models.ForeignKey(
        User, related_name='aid_request_logs_created', on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_by = models.ForeignKey(
        User, related_name='aid_request_logs_updated', on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        verbose_name = 'Aid Request Log'
        verbose_name_plural = 'Aid Request Logs'

    def __str__(self):
        return f"{self.updated_at}({self.updated_by}): {self.log_entry}"


class FieldOpNotify(TimeStampedModel):
    """Notification details for FieldOp"""
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
        if self.type.startswith('email') and not self.sms:
            raise ValidationError('SMS address must be provided for sms notifications')


auditlog.register(FieldOp,
                  exclude_fields=['updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
auditlog.register(AidRequest,
                  exclude_fields=['updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
auditlog.register(AidLocation,
                  exclude_fields=['updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
auditlog.register(AidRequestLog,
                  exclude_fields=['updated_by', 'updated_at'],
                  serialize_data=True,
                  serialize_auditlog_fields_only=True
                  )
