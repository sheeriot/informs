from django import forms
from django.urls import reverse
from django.utils.html import format_html
from django.conf import settings
from django.core.validators import EmailValidator
from django.core.exceptions import ValidationError
from django.utils.safestring import mark_safe
from django.shortcuts import get_object_or_404

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Field, Submit, Row, Column, Div, Hidden, HTML
from crispy_forms.bootstrap import InlineRadios

from ..models import AidRequest, AidType, FieldOp
from ..forms.layout import MapLayoutObject
from ..context_processors import get_field_op_for_form
import re

class AidRequestCreateFormC(forms.ModelForm):
    """ Aid Request - Create Form C """

    class Meta:
        model = AidRequest
        fields = [
            'field_op',
            'street_address',
            'city',
            'state',
            'country',
            'geocode_json',
            'aid_type',
            'aid_description',
            'group_size',
            'medical_needs',
            'welfare_check_info',
            'supplies_needed',
            'additional_info',
            'use_whatsapp',
        ]
        widgets = {
            'aid_type': forms.RadioSelect,
            'medical_needs': forms.Textarea(attrs={'rows': 2}),
            'welfare_check_info': forms.Textarea(attrs={'rows': 2}),
            'supplies_needed': forms.Textarea(attrs={'rows': 2}),
            'additional_info': forms.Textarea(attrs={'rows': 2}),
        }

    full_name = forms.CharField(label="Name", max_length=100, required=True)
    contact_info = forms.CharField(label="Phone or Email", max_length=100, required=True)
    use_whatsapp = forms.BooleanField(
        label="This will be replaced",
        required=False
    )

    latitude = forms.DecimalField(
        max_digits=9,
        decimal_places=5,
        required=False,
        widget=forms.NumberInput(attrs={'class': 'form-control form-control-sm font-monospace seamless-start', 'step': 'any'})
    )
    longitude = forms.DecimalField(
        max_digits=9,
        decimal_places=5,
        required=False,
        widget=forms.NumberInput(attrs={'class': 'form-control form-control-sm font-monospace seamless-end', 'step': 'any'})
    )
    location_modified = forms.BooleanField(widget=forms.HiddenInput(), required=False, initial=False)
    geocode_json = forms.CharField(widget=forms.HiddenInput(), required=False)
    location_note = forms.CharField(widget=forms.HiddenInput(), required=False)
    location_source = forms.CharField(widget=forms.HiddenInput(), required=False)
    location_freeform_address = forms.CharField(
        label="", # Label is handled in the layout
        required=False,
        widget=forms.TextInput(attrs={
            'readonly': True,
            'class': 'form-control-plaintext bg-light border shadow-sm rounded-0 font-monospace p-2'
        })
    )

    has_medical_needs = forms.BooleanField(label="Medical Needs", required=False)
    has_welfare_check = forms.BooleanField(label="Welfare Check", required=False)
    has_supplies_needed = forms.BooleanField(label="Supplies Needed", required=False)
    has_contact_methods = forms.BooleanField(label="Contact Methods", required=False)
    has_additional_info = forms.BooleanField(label="Additional Info", required=False)

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        fieldop_slug = kwargs.get('initial', {}).get('fieldop_slug')

        self.field_op = None
        if fieldop_slug:
            self.field_op = get_object_or_404(FieldOp, slug=fieldop_slug)

        super().__init__(*args, **kwargs)

        self.fields['contact_info'].help_text = "A valid email (e.g., user@example.com) or<br>phone number (at least 10 digits)."
        self.fields['use_whatsapp'].label = mark_safe("Contact me by WhatsApp<br><small class='text-danger'>(requires phone number)</small>")

        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_class = 'needs-validation no-asterisk'
        self.helper.attrs = {'novalidate': ''}
        self.helper.required_css_class = ''
        self.helper.form_tag = False

        self.fieldop_slug = kwargs.get('initial', {}).get('fieldop_slug')

        geocode_url = reverse('geocode_address', kwargs={'field_op': self.fieldop_slug})
        field_op_lat = f'{self.field_op.latitude:.5f}' if self.field_op.latitude is not None else ""
        field_op_lon = f'{self.field_op.longitude:.5f}' if self.field_op.longitude is not None else ""
        initial_lat = ""
        initial_lon = ""
        if self.is_bound:
            submitted_lat = self.data.get('latitude')
            submitted_lon = self.data.get('longitude')
            if submitted_lat and submitted_lon:
                initial_lat = submitted_lat
                initial_lon = submitted_lon
        field_op_ring_size = self.field_op.ring_size or ""

        self.map_context = {
            'azure_maps_key': settings.AZURE_MAPS_KEY,
            'field_op': self.field_op,
            'geocode_url': geocode_url,
            'initial_lat': initial_lat,
            'initial_lon': initial_lon,
            'field_op_lat': field_op_lat,
            'field_op_lon': field_op_lon,
            'field_op_ring_size': field_op_ring_size,
            'country_code': self.field_op.country.code if self.field_op.country else None,
            'latInputId': self.auto_id % 'latitude',
            'lonInputId': self.auto_id % 'longitude',
            'sourceInputId': self.auto_id % 'location_source',
            'noteInputId': self.auto_id % 'location_note',
            'freeformAddressInputId': self.auto_id % 'location_freeform_address',
            'streetInputId': 'id_street_address',
            'cityInputId': 'id_city',
            'stateInputId': 'id_state',
            'confirmBtnId': 'confirm-and-next-btn',
            'geocodeJsonPreId': 'geocode-json-pre',
            'formContainerId': 'form-c-container',
            'geocodeDetailsContainerId': 'geocode-details-container',
            'distanceContainerId': 'distance-from-fieldop',
            'geocodeJsonInputId': 'id_geocode_json',
            'getLocationButtonId': 'get-location',
            'resetLocationButtonId': 'reset-location-btn'
        }

        # Set initial values for the form
        if self.field_op:
            self.fields['country'].initial = self.field_op.country

        if self.is_bound:
            country_name = self.data.get('country', 'USA')
        else:
            country_name = self.field_op.country.name or 'USA'
            self.initial['country'] = self.field_op.country or 'USA'

        self.fields['country'].widget = forms.HiddenInput()

        if self.is_bound:
            self.data = self.data.copy()
            if self.data.get('medical_needs'):
                self.data['has_medical_needs'] = 'on'
            if self.data.get('welfare_check_info'):
                self.data['has_welfare_check'] = 'on'
            if self.data.get('supplies_needed'):
                self.data['has_supplies_needed'] = 'on'
            if self.data.get('contact_methods'):
                self.data['has_contact_methods'] = 'on'
            if self.data.get('additional_info'):
                self.data['has_additional_info'] = 'on'

        self.fields['street_address'].widget.attrs.update({'id': 'id_street_address'})
        self.fields['city'].widget.attrs.update({'id': 'id_city'})
        self.fields['state'].widget.attrs.update({'id': 'id_state'})

        for field_name, field in self.fields.items():
            if field_name not in ['latitude', 'longitude', 'location_note', 'location_source', 'location_freeform_address', 'field_op', 'country', 'use_whatsapp']:
                field.widget.attrs['class'] = f"{field.widget.attrs.get('class', '')} form-control-multistep"

        # Aid Types
        if self.field_op:
            self.fields['aid_type'].queryset = self.field_op.aid_types.all().order_by('weight', 'name')
            self.fields['aid_type'].empty_label = None # No empty choice
            self.fields['aid_type'].to_field_name = 'slug'

            # Set initial/default value
            if not self.is_bound and self.fields['aid_type'].queryset.exists():
                default_aid_type = self.fields['aid_type'].queryset.first()
                self.initial['aid_type'] = default_aid_type.slug

        self.fields['aid_type'].label = False

        self.fields['country'].widget.attrs['readonly'] = True
        self.fields['country'].widget.attrs['class'] = 'form-control-plaintext'
        self.fields['aid_description'].widget.attrs['rows'] = 2
        self.initial['group_size'] = 1

        is_authenticated = self.request and self.request.user.is_authenticated

        if self.field_op:

            progress_dots_html = """
                <div class="progress-dots d-flex justify-content-center gap-4">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            """

            self.helper.layout = Layout(
                Hidden('field_op', self.field_op.id),
                'geocode_json', 'location_note', 'location_modified', 'country', 'location_source',

                # Step 1: Aid Type & Contact
                Div(
                    Fieldset(
                        "",
                        HTML("<h5 class='mb-3'>What kind of aid is needed?</h5>"),
                        InlineRadios('aid_type'),
                        Row(
                            Column(
                                HTML("<h5 class='mt-4 mb-3'>Who needs aid?</h5>"),
                                Row(
                                    Column('full_name', css_class="col-md-8"),
                                    css_class="mb-3"
                                ),
                                Row(
                                    Column('contact_info', css_class='col-md-7'),
                                    Column(
                                        Div(
                                            Field('use_whatsapp', wrapper_class='form-check'),
                                            css_class='pt-4'
                                        ),
                                        css_class='col-md-5 custom-checkbox-column'
                                    ),
                                ),
                                css_class="col-lg-8 offset-lg-2"
                            )
                        )
                    ),
                    Div(
                        Div(css_class="w-25"),
                        Div(HTML(progress_dots_html), css_class="w-50"),
                        Div(HTML('<button type="button" id="next-step-1" class="btn btn-primary btn-lg">Next</button>'), css_class="w-25 d-flex justify-content-end"),
                        css_class="d-flex justify-content-between align-items-center mt-3"
                    ),
                    css_id="step-1",
                    css_class="form-step card p-3 border-0"
                ),

                # Step 2: Location
                Div(
                    Fieldset(
                        "", # Empty legend, using HTML for layout
                        HTML(f"<h5 class='mb-3'>Aid Location ({country_name})</h5>"),
                        Row(
                            Column(
                                    HTML("<p class='form-text text-muted mb-0 px-2'>Add location details and confirm location.</p>"),
                                    css_class="col"
                            ),
                            Column(
                                HTML("""
                                    <button type="button" id="get-location" class="btn btn-warning btn-sm text-start">
                                        <span class="d-block text-nowrap"><i class="bi bi-phone"></i> Device</span>
                                        <span class="d-block text-nowrap"><i class="bi bi-geo-alt"></i> Location</span>
                                    </button>
                                """),
                                css_class="col-auto"
                            ),
                            Column(
                                HTML("""
                                    <button type="button" id="reset-location-btn" class="btn btn-sm btn-outline-danger text-start">
                                        <span class="d-block text-nowrap"><i class="bi bi-x-circle"></i> Reset</span>
                                        <span class="d-block text-nowrap"><i class="bi bi-geo-alt"></i> Location</span>
                                    </button>
                                """),
                                css_class="col-auto"
                            ),
                            css_class="mb-3 align-items-center"
                        ),
                        HTML("<div id='location-error-msg' class='text-danger fw-bold'></div>"),
                        Row(
                            Column(Field('city', css_class='mb-2'), css_class='col-md-6'),
                            Column(Field('state', css_class='mb-2'), css_class='col-md-6'),
                        ),
                        Row(
                            Column(Field('street_address', css_class='mb-2'), css_class='col-12'),
                        ),
                        Div(
                            Row(
                                Column(HTML('<label for="id_location_freeform_address" class="form-label h6 mb-0">Geocoded Address</label>'), css_class="col-auto"),
                                Column(
                                    HTML("""
                                        {% if request.user.is_authenticated %}
                                            <button class="btn btn-sm btn-light" type="button" data-bs-toggle="collapse" data-bs-target="#locationNoteCollapse" aria-expanded="false" aria-controls="locationNoteCollapse">
                                                <span class="text-nowrap"><i class="bi bi-card-text"></i> Details</span>
                                            </button>
                                        {% endif %}
                                    """),
                                    css_class="col-auto"
                                ),
                                css_class="align-items-center"
                            ),
                             Field('location_freeform_address'),
                             HTML("""
                                {% if request.user.is_authenticated %}
                                <div class="collapse" id="locationNoteCollapse">
                                    <div class="card card-body p-1 mt-1">
                                        <pre id="geocode-json-pre" class="p-2 pre-geocode-json"></pre>
                                    </div>
                                </div>
                                {% endif %}
                            """),
                             HTML("""
    <div class="mt-2">
        <small class="text-muted">Distance from FieldOp:</small>
        <span id="distance-from-fieldop" class="fw-bold ms-2"></span>
    </div>
"""),
                             css_id="geocode-details-container",
                             css_class="mt-2"
                        ),
                        Div(
                            Div(HTML('<button type="button" id="prev-step-2" class="btn btn-secondary btn-lg"><i class="bi bi-arrow-left-circle"></i> Back</button>'), css_class="w-25 d-flex justify-content-start"),
                            Div(HTML(progress_dots_html), css_class="w-50"),
                            Div(HTML("""
                                <button type="button" id="confirm-and-next-btn" class="btn btn-success btn-lg opacity-25 text-start" disabled>
                                    <span class="d-block text-nowrap"><i class="bi bi-check-lg"></i> Confirm</span>
                                    <span class="d-block text-nowrap"><i class="bi bi-geo-alt-fill"></i> Location</span>
                                </button>
                            """), css_class="w-25 d-flex justify-content-end"),
                            css_class="d-flex justify-content-between align-items-center my-3"
                        ),
                        HTML("<p class='text-muted text-center small mb-1'>Click on the Map to select a Location</p>"),
                        MapLayoutObject(
                            'aid-request-location-picker-map',
                            map_context_name='map_context',
                            latitude_field='latitude',
                            longitude_field='longitude'
                        ),
                    ),
                    css_id="step-2",
                    css_class="form-step card p-1 border-0 d-none"
                ),

                # Step 3: Details
                Div(
                    Fieldset(
                        "",
                        HTML("<h5 class='mb-3'>How can we help?</h5>"),
                        Row(Column('group_size', css_class='col-2 mb-1')),
                        'aid_description',
                        HTML('<p class="mt-4 mb-3">Check all that apply:</p>'),
                        Row(
                            Column('has_medical_needs', css_class='col-auto custom-checkbox-column'),
                            Column('has_welfare_check', css_class='col-auto custom-checkbox-column'),
                            Column('has_supplies_needed', css_class='col-auto custom-checkbox-column'),
                            Column('has_additional_info', css_class='col-auto custom-checkbox-column'),
                            css_class="mb-2 g-2"
                        ),
                        Div(Field('medical_needs'), css_class="d-none", css_id="div_id_medical_needs"),
                        Div(Field('welfare_check_info'), css_class="d-none", css_id="div_id_welfare_check_info"),
                        Div(Field('supplies_needed'), css_class="d-none", css_id="div_id_supplies_needed"),
                        Div(Field('additional_info'), css_class="d-none", css_id="div_id_additional_info"),
                    ),
                    Div(
                        Div(HTML('<button type="button" id="prev-step-3" class="btn btn-secondary btn-lg"><i class="bi bi-arrow-left-circle"></i> Back</button>'), css_class="w-25 d-flex justify-content-start"),
                        Div(HTML(progress_dots_html), css_class="w-50"),
                        Div(HTML(f"""<button type="submit" id="submit-button" class="btn btn-primary btn-lg">
                                Create Aid Request
                            </button>"""), css_class="w-25 d-flex justify-content-end"),
                        css_class="d-flex justify-content-between align-items-center mt-3"
                    ),
                    css_id="step-3",
                    css_class="form-step card p-3 border-0 d-none"
                ),
            )

    def clean_full_name(self):
        full_name = self.cleaned_data.get('full_name', '').strip()
        if full_name:
            parts = full_name.split()
            first_name = parts[0]
            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
            self.cleaned_data['requester_first_name'] = first_name
            self.cleaned_data['requester_last_name'] = last_name
            self.cleaned_data['aid_first_name'] = ''
            self.cleaned_data['aid_last_name'] = ''
        return full_name

    def clean_contact_info(self):
        contact_info = self.cleaned_data.get('contact_info', '').strip()
        is_email = False
        try:
            EmailValidator()(contact_info)
            is_email = True
        except ValidationError:
            pass

        if is_email:
            self.cleaned_data['requester_email'] = contact_info
            self.cleaned_data['requester_phone'] = ''
            self.cleaned_data['aid_email'] = ''
            self.cleaned_data['aid_phone'] = ''
            return contact_info

        # If not a valid email, treat as a potential phone number.
        # Remove all non-digit characters.
        cleaned_phone = re.sub(r'\D', '', contact_info)
        if len(cleaned_phone) >= 10:
            self.cleaned_data['requester_phone'] = cleaned_phone
            self.cleaned_data['requester_email'] = ''
            self.cleaned_data['aid_email'] = ''
            self.cleaned_data['aid_phone'] = ''
            return contact_info
        else:
            raise ValidationError(
                "Enter a valid email address or a phone number with at least 10 digits.",
                code='invalid_contact'
            )

    def save(self, commit=True):
        instance = super().save(commit=False)

        # Manually assign cleaned data to the instance
        instance.requester_first_name = self.cleaned_data.get('requester_first_name', '')
        instance.requester_last_name = self.cleaned_data.get('requester_last_name', '')
        instance.requester_email = self.cleaned_data.get('requester_email', '')
        instance.requester_phone = self.cleaned_data.get('requester_phone', '')

        # Ensure 'aid' fields are always blank
        instance.aid_first_name = ''
        instance.aid_last_name = ''
        instance.aid_email = ''
        instance.aid_phone = ''

        if commit:
            instance.save()

        return instance

    def clean(self):
        cleaned_data = super().clean()

        latitude = cleaned_data.get("latitude")
        longitude = cleaned_data.get("longitude")

        # If a location is provided via map, address is not required.
        if latitude and longitude:
            if 'street_address' in self._errors:
                del self._errors['street_address']
            if 'city' in self._errors:
                del self._errors['city']
            if 'state' in self._errors:
                del self._errors['state']

        return cleaned_data
