from django import forms
from django.urls import reverse
from django.utils.html import format_html
from django.conf import settings
from django.core.validators import EmailValidator
from django.core.exceptions import ValidationError

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Field, Submit, Row, Column, Div, Hidden, HTML
from crispy_forms.bootstrap import InlineRadios

from ..models import AidRequest, AidType
from ..context_processors import get_field_op_for_form
import re
from icecream import ic

class AidRequestCreateFormC(forms.ModelForm):
    """ Multi-step Aid Request Form """

    class Meta:
        model = AidRequest
        fields = [
            'field_op',
            'requestor_first_name',
            'requestor_last_name',
            'requestor_email',
            'requestor_phone',
            'aid_first_name',
            'aid_last_name',
            'aid_email',
            'aid_phone',
            'street_address',
            'city',
            'state',
            'country',
            'aid_type',
            'aid_description',
            'group_size',
            'medical_needs',
            'welfare_check_info',
            'supplies_needed',
            'contact_methods',
            'additional_info',
        ]
        widgets = {
            'aid_type': forms.RadioSelect,
            'requestor_first_name': forms.HiddenInput(),
            'requestor_last_name': forms.HiddenInput(),
            'requestor_email': forms.HiddenInput(),
            'requestor_phone': forms.HiddenInput(),
            'aid_first_name': forms.HiddenInput(),
            'aid_last_name': forms.HiddenInput(),
            'aid_email': forms.HiddenInput(),
            'aid_phone': forms.HiddenInput(),
            'medical_needs': forms.Textarea(attrs={'rows': 2}),
            'welfare_check_info': forms.Textarea(attrs={'rows': 2}),
            'supplies_needed': forms.Textarea(attrs={'rows': 2}),
            'contact_methods': forms.Textarea(attrs={'rows': 2}),
            'additional_info': forms.Textarea(attrs={'rows': 2}),
        }

    full_name = forms.CharField(label="Name", max_length=100, required=True)
    contact_info = forms.CharField(label="Phone or Email", max_length=100, required=True)

    latitude = forms.DecimalField(max_digits=8, decimal_places=5, widget=forms.HiddenInput(), required=False)
    longitude = forms.DecimalField(max_digits=9, decimal_places=5, widget=forms.HiddenInput(), required=False)
    coordinates = forms.CharField(
        label="Coordinates",
        required=False,
        widget=forms.TextInput(attrs={'class': 'form-control text-dark font-monospace w-auto'})
    )
    location_modified = forms.BooleanField(widget=forms.HiddenInput(), required=False, initial=False)
    location_note = forms.CharField(widget=forms.HiddenInput(), required=False)
    location_source = forms.CharField(widget=forms.HiddenInput(), required=False)

    has_medical_needs = forms.BooleanField(label="Medical Needs", required=False)
    has_welfare_check = forms.BooleanField(label="Welfare Check", required=False)
    has_supplies_needed = forms.BooleanField(label="Supplies Needed", required=False)
    has_contact_methods = forms.BooleanField(label="Contact Methods", required=False)
    has_additional_info = forms.BooleanField(label="Additional Info", required=False)

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request', None)
        super(AidRequestCreateFormC, self).__init__(*args, **kwargs)

        self.fields['contact_info'].help_text = "A valid email (e.g., user@example.com) or<br>phone number (at least 10 digits)."
        self.fields['requestor_first_name'].required = False
        self.fields['requestor_last_name'].required = False
        self.fields['requestor_email'].required = False
        self.fields['requestor_phone'].required = False
        self.fields['aid_first_name'].required = False
        self.fields['aid_last_name'].required = False
        self.fields['aid_email'].required = False
        self.fields['aid_phone'].required = False

        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_class = 'needs-validation no-asterisk'
        self.helper.attrs = {'novalidate': ''}
        self.helper.required_css_class = ''

        self.field_op, self.fieldop_slug = get_field_op_for_form(kwargs['initial'])

        if self.is_bound:
            country_name = self.data.get('country', 'USA')
        else:
            country_name = self.field_op.country or 'USA'
            self.initial['country'] = country_name

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

        for field_name, field in self.fields.items():
            if field.required:
                if 'class' in field.widget.attrs:
                    field.widget.attrs['class'] += ' is-required'
                else:
                    field.widget.attrs['class'] = 'is-required'

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
            # Also restore the coordinates text field
            self.initial['coordinates'] = self.data.get('coordinates')
        else:
            if self.field_op.latitude is not None and self.field_op.longitude is not None:
                self.initial['coordinates'] = f"{field_op_lat},{field_op_lon}"

        field_op_ring_size = self.field_op.ring_size or ""

        aid_types = self.field_op.aid_types.all().order_by('weight', 'name')
        ic(f"Available aid types for {self.field_op.slug}: {[t.name for t in aid_types]}")

        self.fields['aid_type'].choices = [(aid_type.id, aid_type.name) for aid_type in aid_types]
        self.fields['aid_type'].label = False

        if not self.is_bound:
            if aid_types.exists():
                default_aid_type = aid_types.first()
                self.initial['aid_type'] = default_aid_type.pk
                ic(f"Defaulting to '{default_aid_type.name}' (Weight: {default_aid_type.weight}) with pk: {default_aid_type.pk}")

        self.fields['country'].widget.attrs['readonly'] = True
        self.fields['country'].widget.attrs['class'] = 'form-control-plaintext'
        self.fields['aid_description'].widget.attrs['rows'] = 2
        self.initial['group_size'] = 1

        is_authenticated = self.request and self.request.user.is_authenticated

        progress_dots_html = """
            <div class="progress-dots d-flex justify-content-center gap-4">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </div>
        """

        self.helper.layout = Layout(
            Hidden('field_op', self.field_op.id),
            'latitude', 'longitude', 'location_note', 'location_modified', 'country', 'location_source',

            # Step 1: Aid Type & Contact
            Div(
                Fieldset(
                    "",
                    HTML("<h5 class='mb-3'>What kind of aid is needed?</h5>"),
                    InlineRadios('aid_type'),
                    Row(
                        Column(
                            HTML("<h5 class='mt-4 mb-3'>Who needs aid?</h5>"),
                            'full_name',
                            'contact_info',
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
                css_class="form-step card shadow-sm p-3"
            ),

            # Step 2: Location
            Div(
                Fieldset(
                    "", # Empty legend, using HTML for layout
                    HTML(f"""
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0">Aid Location ({country_name})</h5>
                            <button type="button" id="get-location" class="btn btn-danger btn-sm text-nowrap">
                                <i class="bi bi-phone"></i> My Location
                            </button>
                        </div>
                    """),
                    HTML("<p class='form-text text-muted mb-3'>Provide a location to continue.<br>City and State are required for location lookup.</p>"),
                    HTML("<div id='location-error-msg' class='text-danger fw-bold'></div>"),
                    Row(
                        Column(Field('city', css_class='mb-2'), css_class='col-md-6'),
                        Column(Field('state', css_class='mb-2'), css_class='col-md-6'),
                    ),
                    Row(
                        Column(Field('street_address', css_class='mb-2'), css_class='col-12'),
                    ),
                    Div(
                        Div(HTML('<button type="button" id="prev-step-2" class="btn btn-secondary btn-lg">Back</button>'), css_class="w-25 d-flex justify-content-start"),
                        Div(HTML(progress_dots_html), css_class="w-50"),
                        Div(HTML('<button type="button" id="confirm-and-next-btn" class="btn btn-primary btn-lg opacity-25" disabled>Provide Location</button>'), css_class="w-25 d-flex justify-content-end"),
                        css_class="d-flex justify-content-between align-items-center my-3"
                    ),
                    HTML(f"""
                        <div class="row g-0 mt-2">
                            <div class="form-group col-md-12 p-1" style="position: relative;">
                                <div id="aid-request-location-picker-map"
                                     style="height: 300px; border: 1px solid #ced4da; border-radius: .25rem;"
                                     data-azure-maps-key="{azure_maps_key}"
                                     data-geocode-url="{geocode_url}"
                                     data-initial-lat="{initial_lat}"
                                     data-initial-lon="{initial_lon}"
                                     data-fieldop-lat="{field_op_lat}"
                                     data-fieldop-lon="{field_op_lon}"
                                     data-fieldop-ringsize="{field_op_ring_size}">
                                </div>
                                <div class="{'d-block' if is_authenticated else 'd-none'}" style="position: absolute; top: 10px; right: 10px; z-index: 10; background-color: rgba(255,255,255,0.7); padding: 5px; border-radius: 5px;">
                                    <div class="input-group">
                                        { self.fields['coordinates'].widget.render('coordinates', self.data.get('coordinates') if self.is_bound else self.initial.get('coordinates', ''), attrs={'id': 'id_coordinates', 'class': 'form-control text-dark font-monospace w-auto'}) }
                                        <button class="btn btn-outline-secondary" type="button" onclick="copyToClipboard(event, 'id_coordinates')">
                                            <i class="bi bi-clipboard"></i>
                                        </button>
                                    </div>
                                </div>
                                <div id="distance-display" class="mt-2 text-end"></div>
                            </div>
                        </div>
                    """),
                ),
                css_id="step-2",
                css_class="form-step card shadow-sm p-3 d-none"
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
                        Column('has_contact_methods', css_class='col-auto custom-checkbox-column'),
                        Column('has_additional_info', css_class='col-auto custom-checkbox-column'),
                        css_class="mb-2 g-2"
                    ),
                    Div(Field('medical_needs'), css_class="d-none", css_id="div_id_medical_needs"),
                    Div(Field('welfare_check_info'), css_class="d-none", css_id="div_id_welfare_check_info"),
                    Div(Field('supplies_needed'), css_class="d-none", css_id="div_id_supplies_needed"),
                    Div(Field('contact_methods'), css_class="d-none", css_id="div_id_contact_methods"),
                    Div(Field('additional_info'), css_class="d-none", css_id="div_id_additional_info"),
                ),
                Div(
                    Div(HTML('<button type="button" id="prev-step-3" class="btn btn-secondary btn-lg">Back</button>'), css_class="w-25 d-flex justify-content-start"),
                    Div(HTML(progress_dots_html), css_class="w-50"),
                    Div(HTML(f"""<button type="submit" id="submit-button" class="btn btn-primary btn-lg">
                            Create Aid Request
                        </button>"""), css_class="w-25 d-flex justify-content-end"),
                    css_class="d-flex justify-content-between align-items-center mt-3"
                ),
                css_id="step-3",
                css_class="form-step card shadow-sm p-3 d-none"
            ),
        )

    def clean_full_name(self):
        full_name = self.cleaned_data.get('full_name', '').strip()
        if ' ' in full_name:
            first_name, last_name = full_name.split(' ', 1)
        else:
            first_name, last_name = full_name, ''
        self.cleaned_data['requestor_first_name'] = first_name
        self.cleaned_data['requestor_last_name'] = last_name
        self.cleaned_data['aid_first_name'] = first_name
        self.cleaned_data['aid_last_name'] = last_name
        return full_name

    def clean_contact_info(self):
        contact_info = self.cleaned_data.get('contact_info', '').strip()

        try:
            EmailValidator()(contact_info)
            # If it's a valid email, we're good.
            self.cleaned_data['requestor_email'] = contact_info
            self.cleaned_data['aid_email'] = contact_info
            self.cleaned_data['requestor_phone'] = ''
            self.cleaned_data['aid_phone'] = ''
            return contact_info
        except ValidationError:
            # Not a valid email, check for phone.
            pass

        cleaned_phone = re.sub(r'\D', '', contact_info)
        if len(cleaned_phone) >= 10:
            self.cleaned_data['requestor_phone'] = cleaned_phone
            self.cleaned_data['aid_phone'] = cleaned_phone
            self.cleaned_data['requestor_email'] = ''
            self.cleaned_data['aid_email'] = ''
            return contact_info

        # It's neither
        raise forms.ValidationError(
            "Enter a valid email address or a phone number with at least 10 digits.",
            code='invalid_contact'
        )

    def clean(self):
        cleaned_data = super().clean()

        coordinates = cleaned_data.get("coordinates")
        latitude = cleaned_data.get("latitude")
        longitude = cleaned_data.get("longitude")

        if coordinates:
            try:
                lat_str, lon_str = coordinates.split(',')
                latitude = float(lat_str.strip())
                longitude = float(lon_str.strip())
                cleaned_data['latitude'] = latitude
                cleaned_data['longitude'] = longitude
            except (ValueError, TypeError):
                pass

        # If a location is provided via map, address is not required.
        if latitude and longitude:
            if 'street_address' in self._errors:
                del self._errors['street_address']
            if 'city' in self._errors:
                del self._errors['city']
            if 'state' in self._errors:
                del self._errors['state']

        return cleaned_data
