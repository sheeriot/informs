from crispy_forms.layout import LayoutObject
from django.template.loader import render_to_string

class MapLayoutObject(LayoutObject):
    template = "aidrequests/partials/_location_picker_map.html"

    def __init__(self, map_id, map_context_name='map_context', **kwargs):
        self.map_id = map_id
        self.map_context_name = map_context_name
        self.latitude_field = kwargs.pop('latitude_field', None)
        self.longitude_field = kwargs.pop('longitude_field', None)
        super().__init__()

    def render(self, form, context, template_pack=None, **kwargs):
        # Pull the map context dictionary from the form instance
        map_context = getattr(form, self.map_context_name, {})

        if self.latitude_field:
            lat_field = form[self.latitude_field]
            lat_field.field.widget.attrs['aria-label'] = 'latitude'
            map_context['latitude_field'] = lat_field

        if self.longitude_field:
            lon_field = form[self.longitude_field]
            lon_field.field.widget.attrs['aria-label'] = 'longitude'
            map_context['longitude_field'] = lon_field

        map_context['map_id'] = self.map_id
        # It's better to pass the context dictionary into the template
        # under a specific key to avoid polluting the main context.
        return render_to_string(self.template, {'map_data': map_context})
