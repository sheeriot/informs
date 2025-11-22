from django.contrib import admin
from django import forms
from django.urls import reverse
from django.utils.html import format_html
from django.conf import settings
from django.template.loader import render_to_string
from icecream import ic

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Submit, Layout, Fieldset, Hidden, Row, Column, Div, HTML, Field
from ..forms.crispy_map_layout import MapLayoutObject

from ..models import AidLocation
# from crispy_forms.layout import Layout, Submit,  Hidden

# from icecream import ic


class AidLocationCreateForm(forms.ModelForm):
    """ AidLocation Form """
    # These fields are for the UI and map interaction, not for saving to the AidLocation model.
    street_address = forms.CharField(label="Street Address", required=False)
    city = forms.CharField(required=False)
    state = forms.CharField(label="State", required=False)

    latitude = forms.DecimalField(
        max_digits=9,
        decimal_places=5,
        required=False,
        widget=forms.TextInput(attrs={'class': 'form-control form-control-sm font-monospace seamless-start'})
    )
    longitude = forms.DecimalField(
        max_digits=9,
        decimal_places=5,
        required=False,
        widget=forms.TextInput(attrs={'class': 'form-control form-control-sm font-monospace seamless-end'})
    )

    class Meta:
        """ meta """
        model = AidLocation
        # Only include fields that actually exist on the AidLocation model.
        fields = ['latitude', 'longitude', 'note', 'source', 'geocode_json', 'free_form_address']
        widgets = {
            'source': forms.HiddenInput(),
            'geocode_json': forms.HiddenInput(),
            'note': forms.Textarea(attrs={'rows': 2, 'placeholder': 'Add any notes about this location...'}),
            'free_form_address': forms.TextInput(attrs={'readonly': True, 'class': 'form-control-plaintext bg-light border shadow-sm rounded-0 font-monospace p-2'})
        }

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        self.field_op_obj = kwargs.pop('field_op_obj', None)
        aid_request_obj = kwargs.pop('aid_request_obj', None)
        super(AidLocationCreateForm, self).__init__(*args, **kwargs)

        if aid_request_obj:
            self.fields['street_address'].initial = aid_request_obj.street_address
            self.fields['city'].initial = aid_request_obj.city
            self.fields['state'].initial = aid_request_obj.state

        self.fields['street_address'].widget.attrs.update({'id': 'id_street_address_modal'})
        self.fields['city'].widget.attrs.update({'id': 'id_city_modal'})
        self.fields['state'].widget.attrs.update({'id': 'id_state_modal'})

        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_tag = True
        self.helper.form_id = 'addLocationForm'
        self.helper.form_class = 'needs-validation'
        self.helper.attrs = {'novalidate': ''}

        # This form now posts and swaps the locations list directly.
        self.helper.attrs['hx-post'] = reverse(
            'add_location',
            kwargs={'field_op': self.field_op_obj.slug, 'pk': aid_request_obj.pk}
        )
        self.helper.attrs['hx-target'] = '#locations-list-container'
        self.helper.attrs['hx-swap'] = 'innerHTML'

        if self.field_op_obj and aid_request_obj:
            self.helper.form_action = reverse(
                'add_location',
                kwargs={'field_op': self.field_op_obj.slug, 'pk': aid_request_obj.pk}
            )

        azure_maps_key = settings.AZURE_MAPS_KEY or ""
        geocode_url = reverse('geocode_address', kwargs={'field_op': self.field_op_obj.slug})

        field_op_lat = f'{self.field_op_obj.latitude:.5f}' if self.field_op_obj.latitude is not None else ""
        field_op_lon = f'{self.field_op_obj.longitude:.5f}' if self.field_op_obj.longitude is not None else ""
        field_op_ring_size = self.field_op_obj.ring_size or ""
        country_name = self.field_op_obj.country.name or 'USA'

        self.map_context = {
            'azure_maps_key': azure_maps_key,
            'geocode_url': geocode_url,
            'initial_lat': self.initial.get('latitude', field_op_lat),
            'initial_lon': self.initial.get('longitude', field_op_lon),
            'field_op_lat': field_op_lat,
            'field_op_lon': field_op_lon,
            'field_op_ring_size': field_op_ring_size,
            'country_code': self.field_op_obj.country.code if self.field_op_obj.country else '',
            'latInputId': 'id_latitude_modal',
            'lonInputId': 'id_longitude_modal',
            'sourceInputId': 'id_source_modal',
            'noteInputId': self.auto_id % 'note',
            'freeformAddressInputId': self.auto_id % 'free_form_address',
            'streetInputId': 'id_street_address_modal',
            'cityInputId': 'id_city_modal',
            'stateInputId': 'id_state_modal',
            'confirmBtnId': 'submit-location-form',
            'geocodeJsonPreId': 'geocode-json-pre-modal',
            'formContainerId': 'addLocationModal',
            'geocodeDetailsContainerId': 'geocode-details-container-modal',
            'distanceContainerId': 'distance-from-fieldop-modal',
            'geocodeJsonInputId': 'id_geocode_json_modal',
            'getLocationButtonId': 'get-location-modal',
            'resetLocationButtonId': 'reset-location-modal',
            'map_id': 'add-location-map'
        }

        self.helper.layout = Layout(
            'source',
            'geocode_json',

            Fieldset(
                "", # Empty legend
                HTML(f"<h5 class='mb-3'>Aid Location ({country_name})</h5>"),
                Row(
                    Column(
                            HTML("<p class='form-text text-muted mb-0 px-2'>Add location details and confirm location.</p>"),
                            css_class="col"
                    ),
                    Column(
                        HTML("""
                            <button type="button" id="get-location-modal" class="btn btn-warning btn-sm text-start">
                                <span class="d-block text-nowrap"><i class="bi bi-phone"></i> Device</span>
                                <span class="d-block text-nowrap"><i class="bi bi-geo-alt"></i> Location</span>
                            </button>
                        """),
                        css_class="col-auto"
                    ),
                    Column(
                        HTML("""
                            <button type="button" id="reset-location-modal" class="btn btn-sm btn-outline-danger text-start">
                                <span class="d-block text-nowrap"><i class="bi bi-x-circle"></i> Reset</span>
                                <span class="d-block text-nowrap"><i class="bi bi-geo-alt"></i> Location</span>
                            </button>
                        """),
                        css_class="col-auto"
                    ),
                    css_class="mb-3 align-items-center"
                ),
                HTML("<div id='location-error-msg-modal' class='text-danger fw-bold'></div>"),
                Row(
                    Column(Field('city', css_class='mb-2'), css_class='col-md-6'),
                    Column(Field('state', css_class='mb-2'), css_class='col-md-6'),
                ),
                Row(
                    Column(Field('street_address', css_class='mb-2'), css_class='col-12'),
                ),
                'note',
                Div(
                    Row(
                        Column(HTML('<label for="id_free_form_address" class="form-label h6 mb-0">Geocoded Address</label><span id="geocode-spinner-modal" class="spinner-border spinner-border-sm text-primary ms-2 d-none" role="status" aria-hidden="true"></span>'), css_class="col-auto"),
                        Column(
                            HTML("""
                                <button class="btn btn-sm btn-light" type="button" data-bs-toggle="collapse" data-bs-target="#geocode-details-container-modal" aria-expanded="false" aria-controls="geocode-details-container-modal">
                                    <span class="text-nowrap"><i class="bi bi-card-text"></i> Details</span>
                                </button>
                            """),
                            css_class="col-auto"
                        ),
                        css_class="align-items-center"
                    ),
                    Field('free_form_address'),
                    HTML("""
                        <div class="collapse" id="geocode-details-container-modal">
                            <div class="card card-body p-1 mt-1">
                                <pre id="geocode-json-pre-modal" class="p-2 pre-geocode-json"></pre>
                            </div>
                        </div>
                    """),
                    HTML("""
                        <div class="mt-2">
                            <small class="text-muted">Distance from FieldOp:</small>
                            <span id="distance-from-fieldop-modal" class="fw-bold ms-2"></span>
                        </div>
                    """),
                    css_id="geocode-details-container",
                    css_class="mt-2"
                ),
                HTML("<p class='text-muted text-center small mb-1'>Click on the Map to select a Location</p>"),
                MapLayoutObject(
                    'add-location-map',
                    map_context_name='map_context',
                    latitude_field='latitude',
                    longitude_field='longitude'
                ),
            ),
            Div(
                HTML('<button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="bi bi-x-circle"></i> Cancel</button>'),
                HTML('<button type="submit" class="btn btn-primary" id="submit-location-form"><i class="bi bi-geo-alt"></i> Confirm Location</button>'),
                css_class="modal-footer"
            )
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
