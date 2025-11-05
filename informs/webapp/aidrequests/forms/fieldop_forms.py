from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Row, Column, Submit, Div, Field, HTML
from crispy_forms.bootstrap import FormActions
from icecream import ic

from ..models import FieldOp


class FieldOpForm(forms.ModelForm):
    """ meta """
    next = forms.CharField(widget=forms.HiddenInput(), required=False)

    class Meta:
        """ meta """
        model = FieldOp
        fields = ('name', 'slug', 'country', 'latitude', 'longitude', 'ring_size', 'tak_server', 'disable_cot', 'aid_types')

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
        self.helper.form_tag = False

        next_url = self.initial.get('next')
        ic("Form received next_url:", next_url)

        if next_url:
            self.fields['next'].initial = next_url

        # Button definitions
        buttons = []
        if self.action == 'update':
            if next_url:
                ic("Rendering Cancel button, next_url is available.")
                buttons.append(HTML(f'<a href="{next_url}" class="btn btn-secondary"><i class="bi bi-x-circle"></i> Cancel</a>'))
            else:
                ic("NOT rendering Cancel button, next_url is MISSING.")

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

        ic("Form next value from initial:", self.initial.get('next'))

        # Modern layout with clear row organization
        self.helper.layout = Layout(
            'next',
            Div(
                Row(
                    Column('name', css_class='form-group col-md-4'),
                    Column('slug', css_class='form-group col-md-4'),
                    Column('country', css_class='form-group col-md-4')
                ),
                Fieldset(
                    'Geospatial Information',
                    Row(
                        Column('latitude', css_class='form-group col-md-4'),
                        Column('longitude', css_class='form-goup col-md-4'),
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
                actions,
                css_class='container-fluid'
            )
        )
