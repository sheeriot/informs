"""
Forms for the AidRequest Update page, allowing partial updates.
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Field, Row, Column
from django.core.exceptions import ValidationError
from django_countries import countries

from ..models import AidRequest


class RequesterInformationForm(forms.ModelForm):
    class Meta:
        model = AidRequest
        fields = ['requester_first_name', 'requester_last_name', 'requester_phone', 'requester_email', 'requester_phone_is_whatsapp']
        labels = {
            'requester_phone_is_whatsapp': 'Requester phone can be contacted via WhatsApp'
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['requester_last_name'].required = False
        self.fields['requester_phone'].widget.attrs['placeholder'] = 'Phone'
        self.fields['requester_email'].widget.attrs['placeholder'] = 'Email'
        self.helper = FormHelper()
        self.helper.layout = Layout(
            'requester_first_name',
            'requester_last_name',
            'requester_phone',
            Field('requester_phone_is_whatsapp', css_class="custom-checkbox-column"),
            'requester_email',
        )

    def clean(self):
        cleaned_data = super().clean()
        if not cleaned_data.get('requester_phone') and not cleaned_data.get('requester_email'):
            raise ValidationError("At least one of phone or email is required.")
        return cleaned_data


class LocationInformationForm(forms.ModelForm):
    latitude = forms.DecimalField(max_digits=9, decimal_places=6, required=False, widget=forms.HiddenInput())
    longitude = forms.DecimalField(max_digits=9, decimal_places=6, required=False, widget=forms.HiddenInput())
    country = forms.ChoiceField(
        choices=[('', '---------')] + [(code, f"{name} ({code})") for code, name in list(countries)],
        required=False
    )

    class Meta:
        model = AidRequest
        fields = ['street_address', 'city', 'state', 'zip_code', 'country']


class RequestDetailsForm(forms.ModelForm):
    class Meta:
        model = AidRequest
        fields = [
            'group_size', 'supplies_needed', 'welfare_check_info',
            'medical_needs', 'additional_info'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['supplies_needed'].widget.attrs['rows'] = 2
        self.fields['welfare_check_info'].widget.attrs['rows'] = 2
        self.fields['medical_needs'].widget.attrs['rows'] = 2
        self.fields['additional_info'].widget.attrs['rows'] = 2


class RequesterAndGroupSizeForm(forms.ModelForm):
    class Meta:
        model = AidRequest
        fields = [
            'requester_first_name', 'requester_last_name', 'requester_phone',
            'requester_email', 'requester_phone_is_whatsapp', 'group_size'
        ]
        labels = {
            'requester_phone_is_whatsapp': 'Contact via WhatsApp'
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_tag = False  # Don't render <form> tags
        self.helper.disable_csrf = True
        self.helper.layout = Layout(
            Row(
                Column('requester_first_name', css_class='form-group col-md-6 mb-0'),
                Column('requester_last_name', css_class='form-group col-md-6 mb-0'),
                css_class='form-row'
            ),
            Row(
                Column('requester_phone', css_class='form-group col-md-4 mb-0'),
                Column(Field('requester_phone_is_whatsapp', css_class='mt-4'), css_class='form-group col-md-2 mb-0'),
                Column('requester_email', css_class='form-group col-md-6 mb-0'),
                css_class='form-row align-items-center'
            ),
            Row(
                Column('group_size', css_class='form-group col-md-3 mb-0')
            )
        )

    def clean(self):
        cleaned_data = super().clean()
        if not cleaned_data.get('requester_phone') and not cleaned_data.get('requester_email'):
            raise ValidationError("At least one of phone or email is required for the requester.")
        return cleaned_data


class RequestStatusForm(forms.ModelForm):
    """ simple form for changing the status and priority of a request """
    note = forms.CharField(widget=forms.Textarea(attrs={'rows': 2}), required=False)

    class Meta:
        model = AidRequest
        fields = ['status', 'priority']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['status'].required = False
        self.fields['priority'].required = False
