from django import forms
from django.urls import reverse

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
        success_url = 'aid_request_detail'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        data = kwargs.get('data', None)
        if data:
            field_vals = data
        else:
            initial = kwargs.get('initial', False)
            if initial:
                field_vals = initial
        # ic(field_vals)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.form_action = reverse(
            'aid_request_geocode',
            kwargs={
                'field_op': field_vals.get('field_op', None),
                'pk': field_vals.get('aid_request', None)
                }
            )
        self.fields["field_op"] = forms.CharField()

        self.helper.layout = Layout(
            Hidden('field_op', field_vals.get('field_op', False)),
            Hidden('aid_request', field_vals.get('aid_request', False)),
            Hidden('latitude', field_vals.get('latitude', False)),
            Hidden('longitude', field_vals.get('longitude', False)),
            Hidden('source', field_vals.get('source', False)),
            Hidden('status', field_vals.get('status', False)),
            Hidden('note', field_vals.get('note', False)),
            Row(
                Column(
                    Div(
                        HTML(
                            f"latitude,longitude<br><strong>{field_vals.get('latitude', None)},"
                            f"{field_vals.get('longitude', None)}</strong>"
                        ),
                    ),
                    Div(
                        HTML(
                            f"<a href='https://google.com/maps/place/{field_vals.get('latitude', None)},"
                            f"{field_vals.get('longitude', None)}/@{field_vals.get('latitude', None)},"
                            f"{field_vals.get('longitude', None)},13z' target='_blank' "
                            f"class='btn btn-success btn-sm'>gMap</a>"
                        ),
                        css_class="ms-2"
                    ),
                    css_class="d-flex col col-auto border rounded bg-light align-items-center ms-2"
                ),
                css_class="d-flex align-items-center"
            ),
            Row(
                Column(
                    Div(
                        HTML(
                            f"Match"
                            f"<hr class='m-0'>"
                            f"<pre>{field_vals.get('note', None)}</pre>"
                        ),
                    ),
                    css_class="d-flex col col-auto border rounded align-items-center m-2"
                ),
            ),
            Row(
                Column(
                    Submit('submit', 'Confirm', css_class='btn btn-warning'),
                ),
                css_class="d-flex align-items-center"
            )
        )
