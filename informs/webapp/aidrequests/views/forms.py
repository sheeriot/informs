"""
Forms
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Submit, Row, Column

from ..models import FieldOp

# from icecream import ic


class FieldOpForm(forms.ModelForm):
    """ FieldOp Form """

    class Meta:
        """ meta """
        model = FieldOp
        fields = ('name', 'slug', 'latitude', 'longitude')

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
        }

    def __init__(self, *args, action='create', **kwargs):
        super(FieldOpForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.fields['latitude'].help_text = "max 5 decimal points"
        self.fields['longitude'].help_text = "max 5 decimal points"
        if self.action == 'update':
            self.fields['name'].widget.attrs['readonly'] = True
            self.fields['slug'].widget.attrs['readonly'] = True
            button_text = 'Update'
        elif self.action == 'create':
            button_text = 'Create'
        self.helper.layout = Layout(
            Fieldset(
                'Field Op Details',
                Row(
                    Column('name', css_class='col-auto'),
                    Column('slug', css_class='col-auto'),
                ),
                Row(
                    Column('latitude', css_class='col-auto'),
                    Column('longitude', css_class='col-auto'),
                ),
            ),
            Submit('submit', button_text, css_class='btn-warning')
        )
