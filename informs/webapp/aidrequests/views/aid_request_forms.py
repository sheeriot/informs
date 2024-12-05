from django import forms
from django.contrib import admin
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Fieldset, Field, Submit, Row, Column, Div, Hidden
from django.urls import reverse

from ..models import AidRequest, AidRequestLog

# from icecream import ic


class AidRequestCreateForm(forms.ModelForm):
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
            'assistance_first_name',
            'assistance_last_name',
            'assistance_email',
            'assistance_phone',
            'street_address',
            'city',
            'state',
            'zip_code',
            'country',
            'assistance_type',
            'assistance_description',
            'group_size',
            'contact_methods',
            'medical_needs',
            'supplies_needed',
            'welfare_check_info',
            'additional_info'
        ]

    different_contact = forms.BooleanField(
        required=False,
        label="Add a different contact person",
        widget=forms.CheckboxInput(attrs={"onclick": "differentContact()"})
    )

    def __init__(self, *args, action='create', field_op_pk=None, **kwargs):
        super(AidRequestCreateForm, self).__init__(*args, **kwargs)
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
            Hidden('field_op', field_op_pk),
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


class AidRequestUpdateForm(forms.ModelForm):
    """ Aid Request Form """

    class Meta:
        """ meta """
        model = AidRequest
        fields = [
            'status',
            'priority',
            'requestor_first_name',
            'requestor_last_name',
            'requestor_email',
            'requestor_phone',
            'assistance_first_name',
            'assistance_last_name',
            'assistance_email',
            'assistance_phone',
            'street_address',
            'city',
            'state',
            'zip_code',
            'country',
            'assistance_type',
            'assistance_description',
            'group_size',
            'contact_methods',
            'medical_needs',
            'supplies_needed',
            'welfare_check_info',
            'additional_info'
        ]

    different_contact = forms.BooleanField(
        required=False,
        label="Add a different contact person",
        widget=forms.CheckboxInput(attrs={"onclick": "differentContact()"})
    )

    def __init__(self, *args, action='create', **kwargs):
        super(AidRequestUpdateForm, self).__init__(*args, **kwargs)
        self.action = action
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        button_text = 'Update'
        self.fields['contact_methods'].widget.attrs['rows'] = 4
        self.fields['medical_needs'].widget.attrs['rows'] = 4
        self.fields['supplies_needed'].widget.attrs['rows'] = 4
        self.fields['welfare_check_info'].widget.attrs['rows'] = 4
        self.fields['additional_info'].widget.attrs['rows'] = 4
        self.helper.layout = Layout(
            Fieldset(
                'Ticket Status',
                Row(
                    Column('priority', css_class='col mb-2'),
                    Column('status', css_class='col mb-2'),
                ),
                css_class="fieldset-box p-3 border rounded"
            ),
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


class AidRequestLogForm(forms.ModelForm):
    """ Activity Log Form """

    class Meta:
        """ meta """
        model = AidRequestLog
        fields = ('log_entry', 'aid_request')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        initial = kwargs['initial']
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_action = reverse(
            'aidrequest_addlog',
            kwargs={
                'field_op': initial['field_op'],
                'pk': initial['aid_request']
                }
            )
        self.fields['log_entry'].widget.attrs['rows'] = 4
        button_text = 'Add Log'
        self.helper.layout = Layout(
            Hidden('aid_request', initial['aid_request']),
            Fieldset(
                'Add an Activity Log',
                'log_entry',
                css_class="fieldset-box p-3 border rounded"
            ),
            Submit('submit', button_text, css_class='btn btn-primary')
        )


class AidRequestInline(admin.TabularInline):
    model = AidRequest
    extra = 0
    readonly_fields = ('requestor_first_name', 'requestor_last_name', 'street_address')
    fields = ('status', 'priority', 'requestor_first_name', 'requestor_last_name', 'street_address')
