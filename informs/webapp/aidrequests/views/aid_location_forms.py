from django.contrib import admin
from django import forms
from django.urls import reverse

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Submit, Layout, Hidden

from ..models import AidLocation

from icecream import ic


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
