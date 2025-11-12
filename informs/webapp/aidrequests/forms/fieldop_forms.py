from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Row, Column, Submit, Div, Field, HTML
from crispy_forms.bootstrap import FormActions
from icecream import ic
from decimal import Decimal, ROUND_HALF_UP

from ..models import FieldOp, FieldOpNotify, AidType


class FieldOpForm(forms.ModelForm):
    """ meta """
    next = forms.CharField(widget=forms.HiddenInput(), required=False)
    latitude = forms.FloatField(
        help_text="Maximum 5 decimal places.",
        widget=forms.NumberInput(attrs={'min': -90, 'max': 90, 'class': 'form-control'})
    )
    longitude = forms.FloatField(
        help_text="Maximum 5 decimal places.",
        widget=forms.NumberInput(attrs={'min': -180, 'max': 180, 'class': 'form-control'})
    )
    aid_types = forms.ModelMultipleChoiceField(
        queryset=AidType.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        required=True
    )
    notify = forms.ModelMultipleChoiceField(
        queryset=FieldOpNotify.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        required=False,
        label="Notification Destinations"
    )

    class Meta:
        """ meta """
        model = FieldOp
        fields = ('name', 'slug', 'country', 'latitude', 'longitude', 'ring_size', 'tak_server', 'disable_cot', 'aid_types', 'notify')

    def clean_latitude(self):
        """Validate latitude by rounding to 5 decimal places."""
        latitude = self.cleaned_data.get('latitude')
        # ic(f"Original latitude (float): {latitude}")

        if latitude is None:
            raise forms.ValidationError('This field is required.')

        if not -90 <= latitude <= 90:
            raise forms.ValidationError('Latitude must be between -90 and 90.')

        # Convert to Decimal for accurate rounding, avoiding float inaccuracy
        latitude_decimal = Decimal(str(latitude))
        # ic(f"Converted to Decimal: {latitude_decimal}")

        # Quantize (round) to 5 decimal places
        rounded_latitude = latitude_decimal.quantize(Decimal('0.00001'), rounding=ROUND_HALF_UP)
        # ic(f"Rounded to 5 places: {rounded_latitude}")

        return rounded_latitude

    def clean_longitude(self):
        """Validate longitude by rounding to 5 decimal places."""
        longitude = self.cleaned_data.get('longitude')
        # ic(f"Original longitude (float): {longitude}")

        if longitude is None:
            raise forms.ValidationError('This field is required.')

        if not -180 <= longitude <= 180:
            raise forms.ValidationError('Longitude must be between -180 and 180.')

        # Convert to Decimal for accurate rounding
        longitude_decimal = Decimal(str(longitude))
        # ic(f"Converted to Decimal: {longitude_decimal}")

        # Quantize (round) to 5 decimal places
        rounded_longitude = longitude_decimal.quantize(Decimal('0.00001'), rounding=ROUND_HALF_UP)
        # ic(f"Rounded to 5 places: {rounded_longitude}")

        return rounded_longitude

    def clean_ring_size(self):
        """Validate ring_size."""
        ring_size = self.cleaned_data.get('ring_size')
        if ring_size is not None and ring_size <= 0:
            raise forms.ValidationError('Ring size must be a positive number.')
        return ring_size

    def __init__(self, *args, action='create', **kwargs):
        # ic("FieldOpForm init - kwargs:", kwargs)
        super(FieldOpForm, self).__init__(*args, **kwargs)
        self.action = action

        # Remove the default label so we can use a custom one with an icon in the layout
        for field_name in self.fields:
            if field_name != 'next':
                self.fields[field_name].label = False

        if self.action == 'create':
            try:
                welfare_check = AidType.objects.get(slug='welfare-check')
                self.fields['aid_types'].initial = [welfare_check.pk]
            except AidType.DoesNotExist:
                # Handle case where 'welfare-check' aid type doesn't exist
                pass

        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_tag = False

        next_url = self.initial.get('next')
        # ic("Form received next_url:", next_url)

        if next_url:
            self.fields['next'].initial = next_url

        # Button definitions
        buttons = []
        if self.action == 'update':
            if next_url:
                ic("Rendering Cancel button, next_url is available.")
                buttons.append(HTML(f'<a href="{next_url}" class="btn btn-secondary"><i class="bi bi-x-circle"></i> Cancel</a>'))
            else:
                # ic("NOT rendering Cancel button, next_url is MISSING.")
                pass

            # Add margin to submit if cancel button is present
            submit_css_class = "btn btn-primary"
            if next_url:
                submit_css_class += " ms-2"

            buttons.append(HTML(f'<button type="submit" name="submit" class="{submit_css_class}"><i class="bi bi-truck"></i> Update Field Op</button>'))

            actions = FormActions(
                HTML("<!-- CANCEL BUTTON SHOULD BE HERE -->"),
                *buttons,
                css_class="d-flex justify-content-end"
            )
        else:  # Create
            actions = FormActions(
                Submit('submit', 'Create', css_class="btn btn-primary"),
                css_class="d-flex justify-content-end"
            )

        # ic("Form next value from initial:", self.initial.get('next'))

        # Modern layout with clear row organization
        self.helper.layout = Layout(
            'next',
            # Row 1: Name, Slug
            Row(
                Column(HTML('<label class="form-label">Name</label>'), Field('name'), css_class='col-md-6'),
                Column(HTML('<label class="form-label">Slug</label>'), Field('slug'), css_class='col-md-6'),
                css_class='mb-3'
            ),
            # Row 2: Country
            Row(
                Column(HTML('<label class="form-label">Country</label>'), Field('country'), css_class='col-md-12'),
                css_class='mb-3'
            ),
            HTML('<hr class="mt-4 mb-4">'),
            # Row 3: Coords, Ring Size
            Row(
                Column(
                    HTML('<label class="form-label"><i class="bi bi-geo-alt me-2"></i>Coordinates</label>'),
                    Row(
                        Column(Field('latitude', placeholder="Latitude"), css_class='col-6'),
                        Column(Field('longitude', placeholder="Longitude"), css_class='col-6')
                    ),
                    css_class='col-md-6'
                ),
                Column(
                    HTML('<label class="form-label"><i class="bi bi-life-preserver me-2"></i>Ring Size (km)</label>'),
                    Field('ring_size', placeholder="km"),
                    css_class='col-md-6'
                ),
                css_class='mb-3'
            ),
            # Row 4: Map
            Row(
                Column(HTML('<div id="map-placeholder" class="mt-3"></div>'), css_class='col-12'),
                css_class='mb-3'
            ),
            HTML('<hr class="mt-4 mb-4">'),
            # Row 5: TAK Server, COT Disabled
            Row(
                Column(HTML('<label class="form-label">TAK Server</label>'), Field('tak_server'), css_class='col-md-6'),
                Column(HTML('<label class="form-label">COT Status</label>'), Field('disable_cot'), css_class='col-md-6 d-flex align-items-center'),
                css_class='mb-3'
            ),

            # Aid Types (Full Width)
            HTML('<hr class="mt-4 mb-4">'),
            HTML("<h6><i class='bi bi-card-checklist text-danger me-2'></i>Aid Types</h6>"),
            Field('aid_types', css_class='checkbox-grid'),

            # Notify (Full Width)
            HTML('<hr class="mt-4 mb-4">'),
            HTML("<h6><i class='bi bi-bell text-info me-2'></i>Notify</h6>"),
            Field('notify', css_class='checkbox-grid checkbox-grid-2col'),

            HTML('<hr class="mt-4 mb-4">'),
            actions,
        )
