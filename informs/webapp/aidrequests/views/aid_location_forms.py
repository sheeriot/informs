from django.contrib import admin
from django import forms
from django.urls import reverse
from django.utils.html import format_html
from django.conf import settings
from django.template.loader import render_to_string
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
    geocoded_address = forms.CharField(
        label="Geocoded Address",
        required=False,
        widget=forms.TextInput(attrs={'readonly': True, 'class': 'form-control-plaintext'})
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

        azure_maps_key = settings.AZURE_MAPS_KEY or ""
        geocode_url = reverse('geocode_address', kwargs={'field_op': self.field_op_obj.slug})

        field_op_lat = f'{self.field_op_obj.latitude:.5f}' if self.field_op_obj.latitude is not None else ""
        field_op_lon = f'{self.field_op_obj.longitude:.5f}' if self.field_op_obj.longitude is not None else ""
        field_op_ring_size = self.field_op_obj.ring_size or ""

        self.map_context = {
            'map_id': 'add-location-map',
            'azure_maps_key': azure_maps_key,
            'geocode_url': geocode_url,
            'initial_lat': self.initial.get('latitude', field_op_lat),
            'initial_lon': self.initial.get('longitude', field_op_lon),
            'field_op_lat': field_op_lat,
            'field_op_lon': field_op_lon,
            'field_op_ring_size': field_op_ring_size,
            'lat_input_id': 'id_latitude_modal',
            'lon_input_id': 'id_longitude_modal',
            'coordinates_input_id': 'id_coordinates',
            'source_input_id': 'id_location_source_modal',
            'note_input_id': 'id_note_modal',
            'street_input_id': 'id_address_line_1',
            'city_input_id': 'id_city',
            'state_input_id': 'id_state',
            'distance_container_id': 'distance-from-fieldop-modal',
            'confirm_btn_id': 'confirm-location-modal',
            'freeform_address_input_id': 'id_geocoded_address',
            'geocode_details_container_id': 'geocode-details-container-modal',
            'geocode_json_pre_id': 'geocode-json-pre-modal',
            'get_location_button_id': 'get-location-modal',
            'reset_location_button_id': 'reset-location-modal'
        }

        self.helper.layout = Layout(
            'latitude',
            'longitude',
            'source',
            Row(
                Column(
                    HTML("""
                        <p class="form-text text-muted">Add location details and confirm location.</p>
                    """),
                    css_class='col-md-6'
                ),
                Column(
                    Div(
                        HTML("""
                            <button type="button" id="get-location-modal" class="btn btn-warning btn-sm">
                                <i class="bi bi-geo-alt"></i> Device Location
                            </button>
                            <button type="button" id="reset-location-modal" class="btn btn-outline-danger btn-sm ms-2">
                                <i class="bi bi-x-circle"></i> Reset Location
                            </button>
                        """),
                        css_class='d-flex justify-content-end'
                    ),
                    css_class='col-md-6'
                ),
                css_class='align-items-center mb-3'
            ),
            HTML('<div id="coordinates-display-modal-container" class="mb-3"></div>'),
            Row(
                Column('city', css_class='col-md-6'),
                Column('state', css_class='col-md-6'),
                css_class='mb-2'
            ),
            Row(
                Column('address_line_1', css_class='col-12'),
                css_class='mb-3'
            ),
            Div(
                Row(
                    Column(HTML('<label for="id_geocoded_address" class="form-label mb-0">Geocoded Address</label>'), css_class="col-auto me-auto"),
                    Column(
                        HTML("""
                            <button class="btn btn-link p-0 text-decoration-none" type="button" data-bs-toggle="collapse" data-bs-target="#geocode-details-container-modal" aria-expanded="false" aria-controls="geocode-details-container-modal">
                                <i class="bi bi-card-list"></i>
                            </button>
                        """),
                        css_class="col-auto"
                    ),
                    css_class="align-items-center"
                ),
                Field('geocoded_address'),
                css_class="mb-2"
            ),
            Div(
                Div(
                    HTML('<small class="text-muted">Geocode Details</small>'),
                    HTML('<pre id="geocode-json-pre-modal" class="bg-light p-1 pre-geocode-json"></pre>'),
                    css_class="card card-body p-1"
                ),
                css_class="collapse",
                id="geocode-details-container-modal"
            ),
            'note',
            HTML("""
                <div class="mt-2">
                    <small class="text-muted">Distance from FieldOp:</small>
                    <span id="distance-from-fieldop-modal" class="fw-bold ms-2"></span>
                </div>
            """),
            HTML("""{% include 'aidrequests/partials/_location_picker_map.html' with map_data=add_location_form.map_context %}"""),
        )

    def save(self, commit=True):
        instance = super().save(commit=False)
        if not instance.source:
            instance.source = 'geocoded_address'
        instance.status = 'new'
        if commit:
            instance.save()
        return instance


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
