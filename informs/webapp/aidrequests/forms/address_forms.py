from django import forms
from django_countries.fields import CountryField
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Row, Column
from ..models import AidRequest

class AddressForm(forms.ModelForm):

    class Meta:
        model = AidRequest
        fields = ['street_address', 'city', 'state', 'zip_code']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_tag = False  # We are rendering our own <form> tag in the template
        self.helper.form_method = 'post'
        self.helper.layout = Layout(
            'street_address',
            Row(
                Column('city', css_class='form-group col-md-6 mb-0'),
                Column('state', css_class='form-group col-md-6 mb-0'),
            ),
            Row(
                Column('zip_code', css_class='form-group col-md-6 mb-0'),
            )
        )
