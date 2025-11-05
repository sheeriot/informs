from django import forms

class GenericDetailFieldForm(forms.Form):
    value = forms.CharField(
        widget=forms.Textarea(attrs={'rows': 5}),
        required=False
    )

    def __init__(self, *args, **kwargs):
        field_label = kwargs.pop('field_label', 'Value')
        super().__init__(*args, **kwargs)
        self.fields['value'].label = field_label
