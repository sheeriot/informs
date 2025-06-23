"""
Forms
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Row, Column, Div, HTML, Fieldset, Field
from crispy_forms.bootstrap import FormActions, InlineCheckboxes
from icecream import ic
from django.urls import reverse
from django.utils.html import format_html
from django.contrib import admin
from django.conf import settings

from ..models import AidRequest, AidRequestLog, FieldOp, AidLocation
from ..context_processors import get_field_op_for_form

# from icecream import ic


class FieldOpForm(forms.ModelForm):
    """ meta """
    class Meta:
        """ meta """
        model = FieldOp
        fields = ('name', 'slug', 'latitude', 'longitude', 'ring_size', 'tak_server', 'disable_cot', 'aid_types')

        widgets = {
            'latitude': forms.NumberInput(attrs={
                'min': -90, 'max': 90, 'step': 0.000001, 'class': 'form-control'
            }),
            'longitude': forms.NumberInput(attrs={
                'min': -180, 'max': 180, 'step': 0.000001, 'class': 'form-control'
            }),
        }

    def clean_latitude(self):
        """Validate latitude."""
        latitude = self.cleaned_data['latitude']
        if not -90 <= latitude <= 90:
            raise forms.ValidationError('Latitude must be between -90 and 90.')
        return latitude

    def clean_longitude(self):
        """Validate longitude."""
        longitude = self.cleaned_data['longitude']
        if not -180 <= longitude <= 180:
            raise forms.ValidationError('Longitude must be between -180 and 180.')
        return longitude

    def clean_ring_size(self):
        """Validate ring_size."""
        ring_size = self.cleaned_data['ring_size']
        if ring_size <= 0:
            raise forms.ValidationError('Ring size must be a positive number.')
        return ring_size

    def __init__(self, *args, action='create', **kwargs):
        ic("FieldOpForm init - kwargs:", kwargs)
        super(FieldOpForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        # self.helper.form_action = reverse('field_op_create')
        if self.action == 'update':
            button_text = 'Update'
        else:
            button_text = 'Create'

        ic("Form next value:", self.initial.get('next'))

        # Modern layout with clear row organization
        self.helper.layout = Layout(
            Div(
                Row(
                    Column('name', css_class='form-group col-md-6'),
                    Column('slug', css_class='form-group col-md-6')
                ),
                Fieldset(
                    'Geospatial Information',
                    Row(
                        Column('latitude', css_class='form-group col-md-4'),
                        Column('longitude', css_class='form-group col-md-4'),
                        Column('ring_size', css_class='form-group col-md-4')
                    ),
                    css_class="fieldset-box p-3 border rounded"
                ),
                Fieldset(
                    'TAK Server Integration',
                    Row(
                        Column('tak_server', css_class='form-group col-md-6'),
                        Column(
                            Div(
                                Field('disable_cot', css_class='form-check-input'),
                                css_class='form-check form-switch',
                            ),
                            css_class='form-group col-md-6 d-flex align-items-center'
                        )
                    ),
                    css_class="fieldset-box p-3 border rounded"
                ),
                Fieldset(
                    'Operational Details',
                    Row(
                        Column('aid_types', css_class='form-group col-md-12')
                    ),
                    css_class="fieldset-box p-3 border rounded"
                ),
                FormActions(
                    Submit('submit', button_text, css_class="btn btn-primary")
                ),
                css_class='container-fluid'
            )
        )


class RequestorInformationForm(forms.ModelForm):
    class Meta:
        model = AidRequest
        fields = ['requestor_first_name', 'requestor_last_name', 'requestor_phone', 'requestor_email', 'use_whatsapp']
        labels = {
            'use_whatsapp': 'Requestor phone can be contacted via WhatsApp'
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['requestor_last_name'].required = False
        self.fields['requestor_phone'].widget.attrs['placeholder'] = 'Phone'
        self.fields['requestor_email'].widget.attrs['placeholder'] = 'Email'
        self.helper = FormHelper()
        self.helper.layout = Layout(
            'requestor_first_name',
            'requestor_last_name',
            'requestor_phone',
            'requestor_email',
            Field('use_whatsapp', css_class="custom-checkbox-column"),
        )


class AidContactInformationForm(forms.ModelForm):
    class Meta:
        model = AidRequest
        fields = ['aid_first_name', 'aid_last_name', 'aid_phone', 'aid_email', 'use_whatsapp_aid']
        labels = {
            'use_whatsapp_aid': 'Aid phone can be contacted via WhatsApp'
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            'aid_first_name',
            'aid_last_name',
            'aid_phone',
            'aid_email',
            Field('use_whatsapp_aid', css_class="custom-checkbox-column"),
        )


class LocationInformationForm(forms.ModelForm):
    latitude = forms.DecimalField(max_digits=9, decimal_places=6, required=False, widget=forms.HiddenInput())
    longitude = forms.DecimalField(max_digits=9, decimal_places=6, required=False, widget=forms.HiddenInput())
    location_note = forms.CharField(required=False, widget=forms.HiddenInput())

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


class RequestStatusForm(forms.ModelForm):
    class Meta:
        model = AidRequest
        fields = ['status', 'priority']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['status'].required = False
        self.fields['priority'].required = False


class AidRequestLogForm(forms.ModelForm):
    """ Activity Log Form """

    class Meta:
        """ meta """
        model = AidRequestLog
        fields = ('log_entry', 'aid_request')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['log_entry'].widget = forms.Textarea(
            attrs={'rows': 2, 'placeholder': 'Log an update or note...'}
        )
        self.fields['log_entry'].label = ""
        self.fields['aid_request'].widget = forms.HiddenInput()

        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_class = 'd-flex align-items-start'

        self.helper.layout = Layout(
            Field('log_entry', css_class='me-2 flex-grow-1'),
            Submit('submit', 'Add Log', css_class='btn btn-primary btn-sm')
        )


class AidRequestInline(admin.TabularInline):
    model = AidRequest
    extra = 0
    readonly_fields = ('requestor_first_name', 'requestor_last_name', 'street_address')
    fields = ('status', 'priority', 'requestor_first_name', 'requestor_last_name', 'street_address')


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

        self.helper.layout = Layout(
            Hidden('field_op', self.field_op.id),
            'location_modified',
            'latitude',
            'longitude',
            'location_note',
            Fieldset(
                format_html('<i class="bi bi-life-preserver"></i> 1. Select Type of Aid'),
                Row(
                    Column('aid_type', css_class='col-md-4 mb-1')
                ),
                css_class="fieldset-box p-2 border rounded mb-2 mx-2"
            ),
            Fieldset(
                format_html('<i class="bi bi-person-raised-hand"></i> 2. Requestor Details'),
                Row(
                    Column(Field('requestor_first_name', css_class='mb-2'), css_class='col-md-6'),
                    Column(Field('requestor_last_name', css_class='mb-2'), css_class='col-md-6'),
                ),
                HTML('<small class="form-text text-muted">Phone or Email required</small>'),
                Row(
                    Column(Field('requestor_phone', css_class='mt-1'), css_class='col-md-6'),
                    Column(Field('requestor_email', css_class='mt-1'), css_class='col-md-6'),
                ),
                Field('different_contact', css_class="form-check-input mt-2", id="different_contact"),
                Div(
                    Fieldset(
                        "",
                        Row(
                            Column('aid_first_name', css_class='col-md-6 mb-1'),
                            Column('aid_last_name', css_class='col-md-6 mb-1'),
                        ),
                        Row(
                            Column('aid_phone', css_class='col-md-6 mb-1'),
                            Column('aid_email', css_class='col-md-6 mb-1'),
                        ),
                        css_class="fieldset-box p-2 border rounded"
                    ),
                    css_id="different_contact_fieldset",
                    css_class="d-none mb-2"
                ),
                css_class="fieldset-box p-2 border rounded mb-2 mx-2"
            ),
            Fieldset(
                format_html('<i class="bi bi-geo-alt"></i> Location Details'),
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
                HTML(f"""
                    <div class="row g-0 mt-2">
                        <div class="form-group col-md-12 p-1">
                            <div id="aid-request-location-picker-map"
                                 style="height: 450px; border: 1px solid #ced4da; border-radius: .25rem;"
                                 data-azure-maps-key="{azure_maps_key}"
                                 data-geocode-url="{geocode_url}"
                                 data-initial-lat="{initial_lat}"
                                 data-initial-lon="{initial_lon}"
                                 data-fieldop-lat="{field_op_lat}"
                                 data-fieldop-lon="{field_op_lon}"
                                 data-fieldop-ringsize="{field_op_ring_size}"></div>
                        </div>
                    </div>
                """),
                css_class="fieldset-box p-2 border rounded mb-2 mx-2"
            ),
            Fieldset(
                format_html('<i class="bi bi-card-list"></i> 4. Aid Request Details'),
                Row(
                    Column('group_size', css_class='col-2 mb-1'),
                ),
                'aid_description',
                HTML('<hr class="my-2">'),
                Field('show_additional_info', css_class="form-check-input", id="show_additional_info"),
                Div(
                    Fieldset(
                        "",
                        'contact_methods',
                        'medical_needs',
                        'supplies_needed',
                        'welfare_check_info',
                        'additional_info',
                        css_class="fieldset-box p-2 border rounded mt-2"
                    ),
                    css_id="additional_info_fieldset",
                    css_class="d-none"
                ),
                css_class="fieldset-box p-2 border rounded mb-2 mx-2"
            ),
            Div(
                Submit('submit', f'Create Aid Request for {self.field_op.name}', css_class='btn btn-primary mt-2'),
                css_class="mx-4"
            )
        )

    def clean(self):
        cleaned_data = super().clean()

        phone = cleaned_data.get('requestor_phone')
        email = cleaned_data.get('requestor_email')

        if not phone and not email:
            self.add_error('requestor_phone', "At least one of phone or email is required.")
            self.add_error('requestor_email', "")

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
