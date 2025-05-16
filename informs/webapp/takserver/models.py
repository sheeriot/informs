from django.db import models


class TakServer(models.Model):
    name = models.SlugField(max_length=200, unique=True, help_text="A unique identifier for the certificate")
    dns_name = models.CharField(
        max_length=30,
        unique=True,
        help_text="DNS name for the server",
        blank=False,
        null=False
    )
    cert_trust = models.FileField(
        upload_to='certificates/certtrust/',
        help_text="Upload the trusted certificate file - PEM Format"
    )
    cert_private = models.FileField(
        upload_to='certificates/certprivate/',
        help_text="Upload the private certificate file - PEM Format"
    )
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name
