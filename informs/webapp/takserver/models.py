from django.db import models

from .storage import CertificateStorage


def get_trust_storage():
    """Callable for trust certificate storage - required for migrations."""
    return CertificateStorage('certtrust')


def get_private_storage():
    """Callable for private certificate storage - required for migrations."""
    return CertificateStorage('certprivate')


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
        storage=get_trust_storage,
        upload_to='',
        help_text="Upload the trusted certificate file - PEM Format"
    )
    cert_private = models.FileField(
        storage=get_private_storage,
        upload_to='',
        help_text="Upload the private certificate file - PEM Format"
    )
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class MQTTGateway(models.Model):
    """
    MQTT Gateway configuration linking an MQTT broker to a TAK Server.
    Each gateway represents one MQTT Broker + TAK Server pair for Meshtastic bridging.
    """
    name = models.SlugField(
        max_length=100,
        unique=True,
        help_text="Unique identifier for this gateway (e.g., 'mesh-gateway-1')"
    )
    takserver = models.ForeignKey(
        TakServer,
        on_delete=models.PROTECT,
        related_name='mqtt_gateways',
        help_text="TAK Server to bridge MQTT messages to"
    )

    # MQTT Broker Settings
    mqtt_host = models.CharField(
        max_length=255,
        help_text="MQTT broker hostname (e.g., 'mosquitto' or 'mqtt.example.com')"
    )
    mqtt_port = models.PositiveIntegerField(
        default=1883,
        help_text="MQTT broker port (default: 1883)"
    )
    mqtt_username = models.CharField(
        max_length=100,
        blank=True,
        help_text="MQTT username (optional)"
    )
    mqtt_password = models.CharField(
        max_length=100,
        blank=True,
        help_text="MQTT password (optional, stored encrypted)"
    )

    # Meshtastic Settings
    mesh_channel = models.CharField(
        max_length=50,
        default='takmesh',
        help_text="Meshtastic channel name to bridge (default: 'takmesh')"
    )
    mqtt_subscribe_topic = models.CharField(
        max_length=255,
        default='msh/US/SOA/2/json/takmesh/#',
        help_text="MQTT topic pattern to subscribe to (e.g., 'msh/US/SOA/2/json/takmesh/#')"
    )

    # Gateway Identity in TAK
    gateway_uid = models.CharField(
        max_length=100,
        default='takmesh-gateway',
        help_text="Unique ID for this gateway in TAK"
    )
    gateway_callsign = models.CharField(
        max_length=50,
        default='TAKMESH',
        help_text="Callsign displayed in TAK clients"
    )

    # Operational Settings
    is_enabled = models.BooleanField(
        default=True,
        help_text="Enable this gateway for bridging"
    )
    notes = models.TextField(
        blank=True,
        help_text="Optional notes about this gateway configuration"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "MQTT Gateway"
        verbose_name_plural = "MQTT Gateways"
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.mqtt_host}:{self.mqtt_port})"

    @property
    def mqtt_broker_display(self):
        """Display string for MQTT broker connection."""
        return f"{self.mqtt_host}:{self.mqtt_port}"

    @property
    def has_mqtt_auth(self):
        """Check if MQTT authentication is configured."""
        return bool(self.mqtt_username)
