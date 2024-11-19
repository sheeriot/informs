"""
Location Form
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Row, Column, HTML, Div

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
        self.fields['latitude'].widget = forms.HiddenInput()
        self.fields['longitude'].widget = forms.HiddenInput()
        self.fields['source'].widget = forms.HiddenInput()
        self.fields['status'].widget = forms.HiddenInput()
        self.fields['notes'].widget = forms.HiddenInput()
        kwargs_initial = kwargs['initial']

        self.helper.layout = Layout(
            Row(
                Column(
                    Div(
                        HTML(
                            f"latitude,longitude<br><strong>{kwargs_initial['latitude']},"
                            f"{kwargs_initial['longitude']}</strong>"
                        ),
                    ),
                    Div(
                        HTML(
                            f"<a href='https://google.com/maps/place/{kwargs_initial['latitude']},"
                            f"{kwargs_initial['longitude']}/@{kwargs_initial['latitude']},"
                            f"{kwargs_initial['longitude']},13z' target='_blank' "
                            f"class='btn btn-success btn-sm'>gMap</a>"
                        ),
                        css_class="ms-2"
                    ),
                    css_class="d-flex col col-auto border rounded align-items-center ms-2"
                ),
                Column(
                    Submit('submit', 'Confirm', css_class='btn btn-warning'),
                ),
                css_class="d-flex align-items-center"
            ),
            Row(
                Column(
                    Div(
                        HTML(
                            f"<h4>Geocode Notes</h4>"
                            f"<hr>"
                            f"<pre>{kwargs_initial['notes']}</pre>"
                        ),
                    ),
                    css_class="d-flex col col-auto border rounded align-items-center m-2"
                ),
            ),
        )
