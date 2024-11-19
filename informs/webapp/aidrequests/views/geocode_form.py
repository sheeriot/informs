"""
Location Form
"""

from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Row, Column, HTML, Div, Hidden

from ..models import AidLocation

from icecream import ic


class AidLocationForm(forms.ModelForm):
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
        success_url = 'aidrequest_detail'

    def __init__(self, *args, **kwargs):
        super(AidLocationForm, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        kwargs_initial = kwargs['initial']

        self.helper.layout = Layout(
            Hidden('aid_request', kwargs_initial.get('aid_request', '')),
            Hidden('latitude', kwargs_initial.get('latitude', '')),
            Hidden('longitude', kwargs_initial.get('longitude', '')),
            Hidden('source', kwargs_initial.get('source', '')),
            Hidden('status', kwargs_initial.get('status', '')),
            Hidden('note', kwargs_initial.get('note', '')),
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
                    css_class="d-flex col col-auto border rounded bg-light align-items-center ms-2"
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
                            f"Match"
                            f"<hr class='m-0'>"
                            f"<pre>{kwargs_initial['note']}</pre>"
                        ),
                    ),
                    css_class="d-flex col col-auto border rounded align-items-center m-2"
                ),
            ),
        )
