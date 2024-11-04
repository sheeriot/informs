from django.db import models

class AidRequest(models.Model):
    # 1. Requestor details
    requestor_first_name = models.CharField(max_length=100)
    requestor_last_name = models.CharField(max_length=100)
    requestor_email = models.EmailField()
    requestor_phone = models.CharField(max_length=12)  # Format: 555-555-5555

    # 2. Contact details for party needing assistance
    assistance_first_name = models.CharField(max_length=100)
    assistance_last_name = models.CharField(max_length=100)
    assistance_email = models.EmailField()
    assistance_phone = models.CharField(max_length=12)

    # 3. Location of assistance request
    street_address = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=2)  # Use two-letter state abbreviations
    zip_code = models.CharField(max_length=10)

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
    group_size = models.IntegerField()

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

    def __str__(self):
        return f"AidRequest by {self.requestor_first_name} {self.requestor_last_name} - {self.assistance_type}"
