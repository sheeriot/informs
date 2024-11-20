"""
Forms
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Field, Submit, Row, Column, Div

from ..models import AidRequest, FieldOp

# from icecream import ic


class FieldOpForm(forms.ModelForm):
    """ FieldOp Form """

    class Meta:
        """ meta """
        model = FieldOp
        fields = "__all__"

    def __init__(self, *args, action='create', **kwargs):
        super(FieldOpForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.fields['latitude'].help_text = "max 2 decimal points"
        self.fields['longitude'].help_text = "max 2 decimal points"
        if self.action == 'update':
            self.fields['name'].widget.attrs['readonly'] = True
            self.fields['slug'].widget.attrs['readonly'] = True

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
            Submit('submit', 'Update', css_class='btn-warning')
        )


