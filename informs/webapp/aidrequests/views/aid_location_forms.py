from django.contrib import admin
from django import forms
from django.urls import reverse
from django.utils.html import format_html
from django.conf import settings
# from icecream import ic

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Submit, Layout, Fieldset, Hidden, Row, Column, Div, HTML, Field

from ..models import AidLocation
# from crispy_forms.layout import Layout, Submit,  Hidden

# from icecream import ic


class AidLocationCreateForm(forms.ModelForm):
    """ AidLocation Form """
    # These fields are for the UI and map interaction, not for saving to the AidLocation model.
    address_line_1 = forms.CharField(label="Street Address", required=False)
    city = forms.CharField(required=False)
    state = forms.CharField(label="State", required=False)
    coordinates = forms.CharField(
        label="Coordinates",
        required=False,
        widget=forms.TextInput(attrs={'class': 'form-control text-dark font-monospace', 'readonly': 'readonly'})
    )

    class Meta:
        """ meta """
        model = AidLocation
        # Only include fields that actually exist on the AidLocation model.
        fields = ['latitude', 'longitude', 'note', 'source']
        widgets = {
            'latitude': forms.HiddenInput(attrs={'id': 'id_latitude_modal'}),
            'longitude': forms.HiddenInput(attrs={'id': 'id_longitude_modal'}),
            'source': forms.HiddenInput(attrs={'id': 'id_location_source_modal'}),
            'note': forms.Textarea(attrs={'id': 'id_note_modal', 'rows': 2, 'placeholder': 'Add any notes about this location...'}),
        }

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        self.field_op_obj = kwargs.pop('field_op_obj', None)
        aid_request_obj = kwargs.pop('aid_request_obj', None)
        super(AidLocationCreateForm, self).__init__(*args, **kwargs)
        # ic("FORM: __init__ called.")
        # ic("FORM: self.field_op_obj:", self.field_op_obj)
        # ic("FORM: self.initial data:", self.initial)

        if aid_request_obj:
            self.fields['address_line_1'].initial = aid_request_obj.street_address
            self.fields['city'].initial = aid_request_obj.city
            self.fields['state'].initial = aid_request_obj.state

        self.helper = FormHelper()
        self.helper.form_method = 'post'

        # Set address fields to read-only
        for field_name in ['address_line_1', 'city', 'state']:
            if field_name in self.fields:
                self.fields[field_name].widget.attrs['readonly'] = True

        self.helper.layout = Layout()

    def save(self, commit=True):
        instance = super().save(commit=False)
        if not instance.source:
            instance.source = 'geocoded_address'
        instance.status = 'new'
        if commit:
            instance.save()
        return instance


class AidLocationInline(admin.TabularInline):
    model = AidLocation
    extra = 0
    fields = ['pk', 'status', 'latitude', 'longitude', 'source', 'note', 'uid']
    readonly_fields = ('pk', 'uid',)

    def pk(self, obj):
        """Display the primary key of the related object."""

        url = reverse("admin:aidrequests_aidlocation_change", args=(obj.pk,))
        # return format_html(f'<a href="{ url }">{ obj.pk }</a>', url)
        # return obj.pk
        return format_html('<a href="{}">{}</a>', url, obj.pk)


class AidLocationStatusForm(forms.ModelForm):
    class Meta:
        model = AidLocation
        fields = ['aid_request']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        initial = kwargs.get('initial', False)
        self.fields['field_op'] = forms.CharField(widget=forms.HiddenInput())
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        if initial:
            form_url = reverse('aid_location_status_update',
                               kwargs={'field_op': initial['field_op'], 'location_pk': initial['location_pk']})
            self.helper.form_action = form_url

            self.helper.layout = Layout(
                Hidden('pk', initial['location_pk']),
                Hidden('field_op', initial['field_op']),
                Hidden('aid_request', initial['aid_request']),
                Submit('confirm', 'Confirm Location', css_class='btn btn-success'),
                Submit('reject', 'Reject Location', css_class='btn btn-danger')
            )


# class AidLocationManualForm(forms.ModelForm):
#     class Meta:
#         model = AidLocation
#         fields = ['aid_request', 'latitude', 'longitude', 'note']

#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         initial = kwargs.get('initial', False)
#         self.fields['field_op'] = forms.CharField(widget=forms.HiddenInput())

#         self.helper = FormHelper()
#         self.helper.form_method = 'post'
