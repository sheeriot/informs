"""
Forms
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Row, Column, Div, HTML, Fieldset, Field
from crispy_forms.bootstrap import FormActions, InlineCheckboxes
from icecream import ic

from ..models import FieldOp

# from icecream import ic


class FieldOpForm(forms.ModelForm):
    """ FieldOp Form """
    next = forms.CharField(widget=forms.HiddenInput(), required=False)

    class Meta:
        """ meta """
        model = FieldOp
        fields = ('name', 'slug', 'latitude', 'longitude', 'ring_size', 'tak_server', 'disable_cot', 'aid_types')

        widgets = {
            'latitude': forms.NumberInput(attrs={
                'max': '90',    # For maximum number
                'min': '-90',    # For minimum number
                'oninput': """
                    let val = this.value;
                    if (val.includes('.')) {
                        const [intPart, decPart] = val.split('.');
                        this.value = `${intPart}.${decPart.slice(0, 5)}`;  // Truncate decimals
                    }
                """
            }),
            'longitude': forms.NumberInput(attrs={
                'max': '180',    # For maximum number
                'min': '-180',    # For minimum number
                'oninput': """
                    let val = this.value;
                    if (val.includes('.')) {
                        const [intPart, decPart] = val.split('.');
                        this.value = `${intPart}.${decPart.slice(0, 5)}`;  // Truncate decimals
                    }
                """
            }),
            'ring_size': forms.NumberInput(attrs={
                'min': '1'    # Minimum ring size
            }),
            'disable_cot': forms.CheckboxInput(attrs={
                'class': 'form-check-input'
            }),
            'aid_types': forms.CheckboxSelectMultiple(attrs={
                'class': 'form-check-input'
            }),
        }

    def clean_latitude(self):
        """Validate latitude is within -90 to 90 degrees"""
        latitude = self.cleaned_data.get('latitude')
        if latitude is not None and (latitude < -90 or latitude > 90):
            raise forms.ValidationError('Latitude must be between -90 and 90 degrees')
        return latitude

    def clean_longitude(self):
        """Validate longitude is within -180 to 180 degrees"""
        longitude = self.cleaned_data.get('longitude')
        if longitude is not None and (longitude < -180 or longitude > 180):
            raise forms.ValidationError('Longitude must be between -180 and 180 degrees')
        return longitude

    def clean_ring_size(self):
        """Validate ring_size is positive if provided"""
        ring_size = self.cleaned_data.get('ring_size')
        if ring_size is not None and ring_size < 1:
            raise forms.ValidationError('Ring size must be 1 or greater')
        return ring_size

    def __init__(self, *args, action='create', **kwargs):
        ic("FieldOpForm init - kwargs:", kwargs)
        super(FieldOpForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_class = 'p-2'
        self.helper.attrs = {'style': 'max-width: 800px;'}

        # Field help texts
        self.fields['latitude'].help_text = "max 5 decimal points"
        self.fields['longitude'].help_text = "max 5 decimal points"
        self.fields['ring_size'].help_text = "kilometers"
        self.fields['tak_server'].help_text = "Select TAK server for COT updates"
        self.fields['disable_cot'].help_text = "check to disable TAK Server Updates"
        self.fields['disable_cot'].label = "Disable COT"
        self.fields['aid_types'].help_text = "Select applicable Aid Types for this Field Operation"
        self.fields['aid_types'].label = "Aid Types"

        # Set readonly fields for update
        if self.action == 'update':
            self.fields['name'].widget.attrs['readonly'] = True
            self.fields['slug'].widget.attrs['readonly'] = True
            button_text = 'Update'
        else:
            button_text = 'Create'

        ic("Form next value:", self.initial.get('next'))

        # Modern layout with clear row organization
        self.helper.layout = Layout(
            Div(
                # Hidden next field
                Field('next', type='hidden'),
                # Fieldset 1: Basic Information
                Fieldset(
                    'Basic Information',
                    Row(
                        Column('name', css_class='form-group col-md-6 p-1'),
                        Column('slug', css_class='form-group col-md-6 p-1'),
                        css_class='row g-0 mb-2'
                    ),
                    css_class='fieldset-box p-3 border rounded mb-3'
                ),
                # Fieldset 2: Location Details
                Fieldset(
                    'Location Details',
                    Row(
                        Column('latitude', css_class='form-group col-md-5 p-1'),
                        Column('longitude', css_class='form-group col-md-5 p-1'),
                        Column('ring_size', css_class='form-group col-md-2 p-1'),
                        css_class='row g-0 mb-2'
                    ),
                    css_class='fieldset-box p-3 border rounded mb-3'
                ),
                # Fieldset 3: Settings
                Fieldset(
                    'Settings',
                    Row(
                        Column('tak_server', css_class='form-group col-md-8 p-1'),
                        Column('disable_cot', css_class='form-group col-md-4 p-1'),
                        css_class='row g-0 mb-2'
                    ),
                    Row(
                        Column(
                            InlineCheckboxes('aid_types'),
                            css_class='form-group col-md-12 p-1'
                        ),
                        css_class='row g-0 mb-2'
                    ),
                    css_class='fieldset-box p-3 border rounded mb-3'
                ),
                # Form Actions
                FormActions(
                    Row(
                        Column(
                            Submit('submit', button_text, css_class='btn btn-warning me-2'),
                            HTML("""
                                {% if form.next.value %}
                                    <a href="{{ form.next.value }}" class="btn btn-secondary">
                                        <i class="bi bi-x-circle"></i> Cancel
                                    </a>
                                {% else %}
                                    {% if object %}
                                        <a href="{% url 'field_op_detail' slug=object.slug %}" class="btn btn-secondary">
                                            <i class="bi bi-x-circle"></i> Cancel
                                        </a>
                                    {% else %}
                                        <a href="{% url 'field_op_list' %}" class="btn btn-secondary">
                                            <i class="bi bi-x-circle"></i> Cancel
                                        </a>
                                    {% endif %}
                                {% endif %}
                            """),
                            css_class='d-flex p-1'
                        ),
                        css_class='row g-0'
                    )
                ),
                css_class='mx-auto'
            )
        )
