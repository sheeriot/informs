"""
Forms
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Row, Column, Submit, Hidden, HTML, Div, Field
from crispy_forms.bootstrap import FormActions, InlineCheckboxes
from icecream import ic
from django.urls import reverse
from django.utils.html import format_html
from django.contrib import admin
from django.conf import settings
from django.core.exceptions import ValidationError
from django.template.loader import render_to_string
from django_countries import countries

from ..models import AidRequest, ActionLog, FieldOp, AidLocation
from ..context_processors import get_field_op_for_form
from .crispy_map_layout import MapLayoutObject
from .aidrequest_update_forms import (
    RequesterInformationForm,
    LocationInformationForm,
    RequestDetailsForm,
    RequestStatusForm
)
from .fieldop_forms import FieldOpForm

# from icecream import ic


class ActionLogForm(forms.ModelForm):
    """ Action Log Form """
    enable_markdown = forms.BooleanField(
        required=False,
        label="Markdown"
    )

    class Meta:
        """ meta """
        model = ActionLog
        fields = ('note', 'aid_request', 'log_type')

    def __init__(self, *args, **kwargs):
        field_op_slug = kwargs.pop('field_op_slug', None)
        aid_request_pk = kwargs.pop('aid_request_pk', None)
        super().__init__(*args, **kwargs)
        self.fields['note'].widget = forms.Textarea(
            attrs={'rows': 2, 'placeholder': 'Log an update or note...'}
        )
        self.fields['note'].label = ""
        self.fields['aid_request'].widget = forms.HiddenInput()
        self.fields['log_type'].widget = forms.HiddenInput()
        self.fields['log_type'].initial = 'user'

        self.helper = FormHelper()
        if field_op_slug and aid_request_pk:
            self.helper.form_action = reverse(
                'aid_request_addlog',
                kwargs={'field_op': field_op_slug, 'pk': aid_request_pk}
            )
        self.helper.form_method = 'post'
        self.helper.attrs = {
            'hx-post': self.helper.form_action,
            'hx-target': '#action-logs-tbody',
            'hx-swap': 'afterbegin',
            'hx-vals': 'js:{"enable_markdown": document.getElementById("id_enable_markdown").checked}',
            'hx-on::after-request': 'this.reset()'
        }

        self.helper.layout = Layout(
            'note',
            'aid_request',
            'log_type',
            Div(
                Field('enable_markdown', wrapper_class="form-check form-switch"),
                Submit('submit', 'Add Log', css_class='btn btn-primary btn-sm'),
                css_class='d-flex justify-content-between align-items-center mt-2'
            )
        )


class AidRequestInline(admin.TabularInline):
    model = AidRequest
    extra = 0
    readonly_fields = ('requester_first_name', 'requester_last_name', 'street_address')
    fields = ('status', 'priority', 'requester_first_name', 'requester_last_name', 'street_address')


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


class AidRequestCreateFormA(forms.ModelForm):
    """ Aid Request Form """

    class Meta:
        """ meta """
        model = AidRequest
        fields = [
            'field_op',
            'requester_first_name',
            'requester_last_name',
            'requester_email',
            'requester_phone',
            'aid_first_name',
            'aid_last_name',
            'aid_email',
            'aid_phone',
            'street_address',
            'city',
            'state',
            'zip_code',
            'country',
            'aid_type',
            'aid_description',
            'group_size',
            'contact_methods',
            'medical_needs',
            'supplies_needed',
            'welfare_check_info',
            'additional_info'
        ]

        widgets = {
            'latitude': forms.HiddenInput(),
            'longitude': forms.HiddenInput(),
            'location_note': forms.HiddenInput(),
            'location_modified': forms.HiddenInput(),
        }

    latitude = forms.DecimalField(
        max_digits=8, decimal_places=5,
        widget=forms.HiddenInput(),
        required=False
    )
    longitude = forms.DecimalField(
        max_digits=9, decimal_places=5,
        widget=forms.HiddenInput(),
        required=False
    )
    coordinates = forms.CharField(
        label="Coordinates",
        required=False,
        widget=forms.TextInput(attrs={'class': 'form-control text-dark font-monospace w-auto'})
    )
    location_modified = forms.BooleanField(widget=forms.HiddenInput(), required=False, initial=False)
    location_note = forms.CharField(widget=forms.HiddenInput(), required=False)
    different_contact = forms.BooleanField(
        required=False,
        label="Add a different Aid contact"
    )
    show_additional_info = forms.BooleanField(
        required=False,
        label="Add additional details"
    )

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        super(AidRequestCreateFormA, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_method = 'post'

        # Get field_op using our utility function
        self.field_op, self.fieldop_slug = get_field_op_for_form(kwargs['initial'])

        azure_maps_key = settings.AZURE_MAPS_KEY or ""
        geocode_url = reverse('geocode_address', kwargs={'field_op': self.fieldop_slug})

        field_op_lat = f'{self.field_op.latitude:.5f}' if self.field_op.latitude is not None else ""
        field_op_lon = f'{self.field_op.longitude:.5f}' if self.field_op.longitude is not None else ""

        initial_lat = field_op_lat
        initial_lon = field_op_lon

        if self.is_bound:
            submitted_lat = self.data.get('latitude')
            submitted_lon = self.data.get('longitude')
            if submitted_lat and submitted_lon:
                initial_lat = submitted_lat
                initial_lon = submitted_lon
        else:
            if self.field_op.latitude is not None and self.field_op.longitude is not None:
                self.initial['coordinates'] = f"{field_op_lat},{field_op_lon}"

        field_op_ring_size = self.field_op.ring_size or ""

        self.fields['aid_type'].choices = [(aid_type.id, aid_type.name) for aid_type in self.field_op.aid_types.all().order_by('weight', 'name')]

        self.fields['aid_description'].widget.attrs['rows'] = 2
        self.fields['contact_methods'].widget.attrs['rows'] = 2
        self.fields['medical_needs'].widget.attrs['rows'] = 2
        self.fields['supplies_needed'].widget.attrs['rows'] = 2
        self.fields['welfare_check_info'].widget.attrs['rows'] = 2
        self.fields['additional_info'].widget.attrs['rows'] = 2

        map_context = {
            'azure_maps_key': azure_maps_key,
            'geocode_url': geocode_url,
            'initial_lat': initial_lat,
            'initial_lon': initial_lon,
            'field_op_lat': field_op_lat,
            'field_op_lon': field_op_lon,
            'field_op_ring_size': field_op_ring_size,
            'lat_input_id': 'id_latitude',
            'lon_input_id': 'id_longitude',
            'coordinates_input_id': 'id_coordinates',
            'source_input_id': 'id_source',
            'note_input_id': 'id_location_note'
        }

        self.helper.layout = Layout(
            Hidden('field_op', self.field_op.id),
            'location_modified',
            'latitude',
            'longitude',
            'source',
            'coordinates',
            'location_note',
            Fieldset(
                format_html('<i class="bi bi-life-preserver"></i> 1. Select Type of Aid'),
                Row(
                    Column('aid_type', css_class='col-md-4 mb-1')
                ),
                css_class="fieldset-box p-2 border rounded mb-2 mx-2"
            ),
            Fieldset(
                format_html('<i class="bi bi-person-raised-hand"></i> 2. Requester Details'),
                Row(
                    Column(Field('requester_first_name', css_class='mb-2'), css_class='col-md-6'),
                    Column(Field('requester_last_name', css_class='mb-2'), css_class='col-md-6'),
                ),
                Row(
                    Column(Field('use_whatsapp', css_class='mt-1'), css_class='col-md-12'),
                ),
                Row(
                    Column(Field('requester_phone', css_class='mt-1'), css_class='col-md-6'),
                    Column(Field('requester_email', css_class='mt-1'), css_class='col-md-6'),
                )
            ),
            Fieldset(
                format_html('<i class="bi bi-geo-alt"></i> 3. Location Details'),
                Row(
                    Column(Field('street_address', css_class='mb-2'), css_class='col-12'),
                ),
                Row(
                    Column(Field('city', css_class='mb-2'), css_class='col-md-4'),
                    Column(Field('state', css_class='mb-2'), css_class='col-md-3'),
                    Column(Field('zip_code', css_class='mb-2'), css_class='col-md-3'),
                    Column(Field('country', css_class='mb-2'), css_class='col-md-2'),
                ),
                HTML('<hr class="my-2">'),
                Row(
                    Column(
                        HTML("""
                            <button type="button" id="get-location" class="btn btn-danger btn-sm text-nowrap">
                                <i class="bi bi-bullseye"></i> Get Location
                            </button>
                        """),
                        css_class='col-auto'
                    ),
                    Column(
                        HTML("""
                            <div class="d-flex align-items-center">
                                <div class="input-group">
                                    {{ form.coordinates }}
                                    <button class="btn btn-outline-secondary" type="button" onclick="copyToClipboard(event, 'id_coordinates')">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                </div>
                                <button type="button" id="confirm-location" class="btn btn-success btn-sm ms-2 d-none text-nowrap">
                                    <i class="bi bi-check-circle"></i> Confirm Location
                                </button>
                            </div>
                        """),
                        css_class='col-md-auto'
                    ),
                    css_class='row g-2 mb-2 align-items-center'
                ),
                MapLayoutObject(map_id='aid-request-location-picker-map', **map_context),
                css_class="fieldset-box p-2 border rounded mb-2 mx-2"
            ),
            Fieldset(
                format_html('<i class="bi bi-info-circle"></i> 4. Request Details'),
                'aid_type',
                'aid_description',
                HTML('<hr class="my-2">'),
                Row(
                    Column('group_size', css_class='col-2 mb-1'),
                ),
                'welfare_check_info',
                'additional_info',
                'internal_notes',
                css_class="fieldset-box p-2 border rounded mb-2 mx-2"
            ),
            FormActions(
                Submit('submit', 'Submit', css_class='btn-lg'),
                css_class="mt-3"
            )
        )

    def clean(self):
        cleaned_data = super().clean()

        phone = cleaned_data.get('requester_phone')
        email = cleaned_data.get('requester_email')

        if not phone and not email:
            self.add_error('requester_phone', "At least one of phone or email is required.")
            self.add_error('requester_email', "")

        coordinates = cleaned_data.get("coordinates")
        if coordinates:
            try:
                lat_str, lon_str = coordinates.split(',')
                cleaned_data['latitude'] = float(lat_str.strip())
                cleaned_data['longitude'] = float(lon_str.strip())
            except (ValueError, TypeError):
                # Fail silently, as this is a fallback for non-JS.
                # The hidden fields will be populated by JS if available.
                pass

        # Validate field_op if fieldop_slug was provided
        if hasattr(self, 'fieldop_slug') and self.fieldop_slug:
            field_op_from_form = cleaned_data.get('field_op')
            try:
                expected_field_op = FieldOp.objects.get(slug=self.fieldop_slug)
                if field_op_from_form and field_op_from_form != expected_field_op:
                    self.add_error('field_op', "Field operation does not match the URL parameter")
            except FieldOp.DoesNotExist:
                self.add_error('field_op', "Invalid field operation specified in URL")
        return cleaned_data
