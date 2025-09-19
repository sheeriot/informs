from crispy_forms.layout import LayoutObject
from django.template.loader import render_to_string

class MapLayoutObject(LayoutObject):
    template = "aidrequests/partials/_location_picker_map.html"

    def __init__(self, map_id, map_context, **kwargs):
        self.map_id = map_id
        self.map_context = map_context
        self.latitude_field = kwargs.pop('latitude_field', None)
        self.longitude_field = kwargs.pop('longitude_field', None)
        super().__init__(**kwargs)

    def render(self, form, context, template_pack=None, **kwargs):
        if self.latitude_field:
            lat_field = form[self.latitude_field]
            lat_field.field.widget.attrs['aria-label'] = 'latitude'
            self.map_context['latitude_field'] = lat_field

        if self.longitude_field:
            lon_field = form[self.longitude_field]
            lon_field.field.widget.attrs['aria-label'] = 'longitude'
            self.map_context['longitude_field'] = lon_field

        self.map_context['map_id'] = self.map_id
        context.update(self.map_context)
        return render_to_string(self.template, context.flatten())
