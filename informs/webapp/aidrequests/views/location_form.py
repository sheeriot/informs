"""
Location Form
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Submit, Row, Column, HTML

from ..models import AidLocation

# from icecream import ic


class AidLocationForm(forms.ModelForm):
    """ AidLocation Form """

    class Meta:
        """ meta """
        model = AidLocation
        exclude = ('aidrequest',)

    def __init__(self, *args, **kwargs):
        super(AidLocationForm, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.fields['latitude']
        self.fields['longitude']
        self.fields['latitude'].widget.attrs['readonly'] = True
        self.fields['longitude'].widget.attrs['readonly'] = True
        self.fields['source'].disabled = True
        self.fields['notes'].widget.attrs['readonly'] = True
        self.fields['notes'].widget.attrs['rows'] = 8
        self.fields['source'].widget = forms.HiddenInput()
        self.helper.layout = Layout(
            Fieldset(
                '',
                Row(
                    Column(
                        HTML(
                            '<div><strong>{{ field_op.name }}</strong></div>'
                        ),
                        HTML(
                            '<div><strong>Aid Request ID: {{ aid_request.id }}</strong><hr></div>'
                        ),
                        css_class="mb-2"
                    ),
                ),
                Row(
                    Column(
                        'status',
                    ),
                    Column(
                        Submit('submit', 'Save', css_class='btn-sm btn-warning'),
                    ),
                    css_class="d-flex"
                ),
                Row(
                    Column('latitude'),
                    Column('longitude'),
                ),
                Row(
                    Column('notes')
                ),
                css_class="fieldset-box p-3 border rounded font-monospace"
            ),
        )
