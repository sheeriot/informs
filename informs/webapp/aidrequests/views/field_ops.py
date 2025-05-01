from django.views.generic import ListView
from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin
from ..models import FieldOp

class FieldOpListView(LoginRequiredMixin, ListView):
    model = FieldOp
    template_name = 'aidrequests/field_op_list.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Add Azure Maps key
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY

        # Prepare field ops data for the map
        field_ops_data = []
        for field_op in self.get_queryset():
            field_ops_data.append({
                'id': field_op.pk,
                'name': field_op.name,
                'slug': field_op.slug,
                'latitude': float(field_op.latitude),
                'longitude': float(field_op.longitude),
                'ring_size': float(field_op.ring_size)
            })
        context['field_ops_data'] = field_ops_data

        return context
