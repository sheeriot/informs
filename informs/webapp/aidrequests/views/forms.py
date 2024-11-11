from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Submit, Row, Column

from ..models import AidRequest, FieldOp

# from icecream import ic


class FieldOpForm(forms.ModelForm):
    class Meta:
        model = FieldOp
        fields = "__all__"

    def __init__(self, action='create', *args, **kwargs):
        super(FieldOpForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.layout = Layout(
            Fieldset(
                'Field Op Details',
                'name',
                'slug',
                'latitude',
                'longitude',
            ),
            Submit('submit', 'Submit', css_class='btn-primary')
        )


class AidRequestForm(forms.ModelForm):
    class Meta:
        model = AidRequest
        exclude = ["field_op"]
        # fields = "__all__"

    def __init__(self, *args, action='create', **kwargs):
        super(AidRequestForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        button_text = 'Update' if action == 'update' else 'Create'
        self.helper.layout = Layout(
            Fieldset(
                'Requestor Details',
                Row(
                    Column('requestor_first_name', css_class='form-group col-md-6 mb-0'),
                    Column('requestor_last_name', css_class='form-group col-md-6 mb-0'),
                ),
                'requestor_email',
                'requestor_phone',
            ),
            Fieldset(
                'Contact Details for Party Needing Assistance (if different)',
                Row(
                    Column('assistance_first_name', css_class='form-group col-md-6 mb-0'),
                    Column('assistance_last_name', css_class='form-group col-md-6 mb-0'),
                ),
                'assistance_email',
                'assistance_phone',
                'contact_methods',
                'group_size',
            ),
            Fieldset(
                'Location of Assistance Request',
                'street_address',
                Row(
                    Column('city', css_class='form-group col-md-6 mb-0'),
                    Column('state', css_class='form-group col-md-3 mb-0'),
                    Column('zip_code', css_class='form-group col-md-3 mb-0'),
                ),
            ),
            Fieldset(
                'Type of Assistance Requested',
                'assistance_type',
                'assistance_description',
            ),
            Fieldset(
                'Additional Information',

                'medical_needs',
                'supplies_needed',
                'welfare_check_info',
                'additional_info',
            ),
            Submit('submit', button_text, css_class='btn-primary')
        )
