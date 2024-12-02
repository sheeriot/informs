"""
Location Form
"""

from django import forms
from django.urls import reverse

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Row, Column, HTML, Div, Hidden

from ..models import AidLocation

# from icecream import ic


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
        super().__init__(*args, **kwargs)
        initial = kwargs['initial']
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_action = reverse(
            'aidrequest_geocode',
            kwargs={
                'field_op': initial['field_op'],
                'pk': initial['aid_request']
                }
            )

        self.helper.layout = Layout(
            Hidden('aid_request', initial['aid_request']),
            Hidden('latitude', initial['latitude']),
            Hidden('longitude', initial['longitude']),
            Hidden('source', initial['source']),
            Hidden('status', initial['status']),
            Hidden('note', initial['note']),
            Row(
                Column(
                    Div(
                        HTML(
                            f"latitude,longitude<br><strong>{initial['latitude']},"
                            f"{initial['longitude']}</strong>"
                        ),
                    ),
                    Div(
                        HTML(
                            f"<a href='https://google.com/maps/place/{initial['latitude']},"
                            f"{initial['longitude']}/@{initial['latitude']},"
                            f"{initial['longitude']},13z' target='_blank' "
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
                            f"<pre>{initial['note']}</pre>"
                        ),
                    ),
                    css_class="d-flex col col-auto border rounded align-items-center m-2"
                ),
            ),
        )
