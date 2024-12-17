from django.contrib import admin
from django import forms
from django.urls import reverse

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Submit, Layout, Fieldset, Hidden, Row, Column, Div, HTML

from ..models import AidLocation
# from crispy_forms.layout import Layout, Submit,  Hidden

# from icecream import ic


class AidLocationCreateForm(forms.ModelForm):
    """ AidLocation Form """

    class Meta:
        """ meta """
        model = AidLocation
        fields = (
            'aid_request',
            'latitude',
            'longitude',
            'source',
            'status',
            'note',
        )
        # success_url = 'aid_request_detail'
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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['field_op'] = forms.CharField(widget=forms.HiddenInput())
        self.fields['note'].widget.attrs['rows'] = 1
        initial = kwargs.get('initial', False)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        if initial:
            action_url = reverse('aid_location_create',
                                 kwargs={'field_op': initial['field_op'],
                                         'aid_request': initial['aid_request']})
            self.helper.form_action = action_url

            self.helper.layout = Layout(
                Hidden('field_op', initial['field_op']),
                Hidden('aid_request', initial['aid_request']),
                Hidden('source', 'manual'),
                Hidden('status', 'new'),
                Div(
                    Fieldset('Add a Manual Location (coordinates)',
                             HTML("<hr class='my-0'>"),
                             Row(
                                 Column('latitude', css_class="col-auto"),
                                 Column('longitude', css_class="col-auto"),
                                 Column('note', css_class="col-auto"),
                                 Column(
                                        Submit('submit', 'Add Location',
                                               css_class='btn-warning'),
                                        css_class="col-auto align-self-end mb-3"),
                                 css_class=""
                                 ),
                             css_class=""
                             ),
                    css_class="col-auto aid-coords mb-0"
                )
            )
            self.fields['latitude'].widget.attrs['placeholder'] = 'deg.xxxxx'
            self.fields['longitude'].widget.attrs['placeholder'] = 'deg.yyyyy'
            self.fields['note'].widget.attrs['placeholder'] = 'Enter any notes'


class AidLocationInline(admin.TabularInline):
    model = AidLocation
    extra = 0
    readonly_fields = ('uid',)
    fields = ['status', 'latitude', 'longitude', 'source', 'note', 'uid']


class AidLocationStatusForm(forms.ModelForm):
    class Meta:
        model = AidLocation
        fields = ['aid_request']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        initial = kwargs.get('initial', False)
        self.fields['field_op'] = forms.CharField(widget=forms.HiddenInput())
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        if initial:
            form_url = reverse('aid_location_status_update',
                               kwargs={'field_op': initial['field_op'],
                                       'aid_request': initial['aid_request'],
                                       'pk': initial['pk']})
            self.helper.form_action = form_url

            self.helper.layout = Layout(
                Hidden('pk', initial['pk']),
                Hidden('field_op', initial['field_op']),
                Hidden('aid_request', initial['aid_request']),
                Submit('confirm', 'Confirm Location', css_class='btn btn-success'),
                Submit('reject', 'Reject Location', css_class='btn btn-danger')
            )


# class AidLocationManualForm(forms.ModelForm):
#     class Meta:
#         model = AidLocation
#         fields = ['aid_request', 'latitude', 'longitude', 'note']

#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         initial = kwargs.get('initial', False)
#         self.fields['field_op'] = forms.CharField(widget=forms.HiddenInput())

#         self.helper = FormHelper()
#         self.helper.form_method = 'post'
