from django import forms
from .models import TakServer, MQTTGateway


class TakServerForm(forms.ModelForm):
    """Form for creating and updating TAK Servers."""

    class Meta:
        model = TakServer
        fields = ['name', 'dns_name', 'cert_trust', 'cert_private', 'notes']
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'e.g., tak-server-1'
            }),
            'dns_name': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'e.g., tak.example.com'
            }),
            'cert_trust': forms.ClearableFileInput(attrs={
                'class': 'form-control',
                'accept': '.pem,.crt,.cer'
            }),
            'cert_private': forms.ClearableFileInput(attrs={
                'class': 'form-control',
                'accept': '.pem,.key'
            }),
            'notes': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Optional notes about this TAK server...'
            }),
        }


class MQTTGatewayForm(forms.ModelForm):
    """Form for creating and updating MQTT Gateways."""

    # Password field with toggle visibility
    mqtt_password = forms.CharField(
        required=False,
        widget=forms.PasswordInput(attrs={
            'class': 'form-control font-monospace',
            'placeholder': 'MQTT password (optional)',
            'autocomplete': 'new-password'
        })
    )

    class Meta:
        model = MQTTGateway
        fields = [
            'name', 'takserver',
            'mqtt_host', 'mqtt_port', 'mqtt_username', 'mqtt_password',
            'mqtt_subscribe_topic', 'mesh_channel', 'gateway_uid', 'gateway_callsign',
            'is_enabled', 'notes'
        ]
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'e.g., mesh-gateway-1'
            }),
            'takserver': forms.Select(attrs={
                'class': 'form-select'
            }),
            'mqtt_host': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'e.g., mosquitto or mqtt.example.com'
            }),
            'mqtt_port': forms.NumberInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': '1883'
            }),
            'mqtt_username': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'MQTT username (optional)',
                'autocomplete': 'off'
            }),
            'mqtt_subscribe_topic': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'msh/US/SOA/2/json/takmesh/#'
            }),
            'mesh_channel': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'takmesh'
            }),
            'gateway_uid': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'takmesh-gateway'
            }),
            'gateway_callsign': forms.TextInput(attrs={
                'class': 'form-control font-monospace',
                'placeholder': 'TAKMESH'
            }),
            'is_enabled': forms.CheckboxInput(attrs={
                'class': 'form-check-input'
            }),
            'notes': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 2,
                'placeholder': 'Optional notes about this gateway...'
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Don't show existing password in edit mode
        if self.instance and self.instance.pk:
            self.fields['mqtt_password'].widget.attrs['placeholder'] = '••••••••'
