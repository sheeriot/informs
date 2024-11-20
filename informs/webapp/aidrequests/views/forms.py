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


class AidRequestForm(forms.ModelForm):
    """ Aid Request Form """

    class Meta:
        """ meta """
        model = AidRequest
        exclude = ["field_op"]
        # fields = "__all__"

    different_contact = forms.BooleanField(
        required=False,
        label="Add a different contact person",
        widget=forms.CheckboxInput(attrs={"onclick": "differentContact()"})
    )

    def __init__(self, *args, action='create', **kwargs):
        super(AidRequestForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        button_text = 'Update' if action == 'update' else 'Create'
        self.fields['contact_methods'].widget.attrs['rows'] = 4
        self.fields['medical_needs'].widget.attrs['rows'] = 4
        self.fields['supplies_needed'].widget.attrs['rows'] = 4
        self.fields['welfare_check_info'].widget.attrs['rows'] = 4
        self.fields['additional_info'].widget.attrs['rows'] = 4
        self.helper.layout = Layout(
            Fieldset(
                'Requestor Details',
                Row(
                    Column('requestor_first_name', css_class='col-md-6 mb-2'),
                    Column('requestor_last_name', css_class='col-md-6 mb-2'),
                ),
                Row(
                    Column('requestor_phone', css_class='col-md-6 mb-2'),
                    Column('requestor_email', css_class='col-md-6 mb-2'),
                ),
                css_class="fieldset-box p-3 border rounded"
            ),
            Field('different_contact', css_class="form-check-input", id="different_contact"),
            Div(
                Fieldset(
                    'Contact Details for Party Needing Assistance (if different)',
                    Row(
                        Column('assistance_first_name', css_class='col-md-6 mb-2'),
                        Column('assistance_last_name', css_class='col-md-6 mb-2'),
                    ),
                    Row(
                        Column('assistance_phone', css_class='col-md-6 mb-2'),
                        Column('assistance_email', css_class='col-md-6 mb-2'),
                    ),
                    css_class="fieldset-box p-3 border rounded"
                ),
                css_id="different_contact_fieldset",
                css_class="d-none"
            ),
            Fieldset(
                "Contact Preferences",
                Row(
                    Column('contact_methods', css_class='col-md-8 mb-2')
                ),
                css_class="col-md-8 fieldset-box p-3 border rounded"
            ),
            Fieldset(
                'Type of Assistance Requested',
                Row(
                    Column('assistance_type', css_class='col-md-4 mb-2'),
                    Column('group_size', css_class='col-md-2 mb-2'),
                ),
                'assistance_description',
                css_class="fieldset-box p-3 border rounded"
            ),
            Fieldset(
                'Location of Assistance Request',
                Row('street_address', css_class='col-12 mb-2'),
                Row(
                    Column('city', css_class='col-md-4 mb-2'),
                    Column('state', css_class='col-md-3 mb-2'),
                    Column('zip_code', css_class='col-md-3 mb-2'),
                    Column('country', css_class='col-md-2 mb-2'),
                ),
                css_class="fieldset-box p-3 border rounded"
            ),
            Fieldset(
                'Additional Information',
                Row('medical_needs'),
                'supplies_needed',
                'welfare_check_info',
                'additional_info',
                css_class="fieldset-box p-3 border rounded"
            ),
            Submit('submit', button_text, css_class='btn btn-primary')
        )
