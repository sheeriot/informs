from django.contrib.auth.mixins import LoginRequiredMixin
# from django.urls import reverse_lazy
from django.db.models import Count
from django.views.generic import ListView   # , DetailView, CreateView, UpdateView

from ..models import FieldOp
from .maps import staticmap_fieldops
# from .forms import FieldOpForm

import base64
# from icecream import ic


# Map View for FieldOp
class FieldOpMapView(LoginRequiredMixin, ListView):
    model = FieldOp
    template_name = 'aidrequests/field_op_map.html'

    def get_queryset(self):
        # queryset = FieldOp.objects.annotate(aid_request_count=Count('aid_requests'))
        queryset = FieldOp.objects.annotate(aid_request_count=Count('aid_requests'))
        # ic(queryset)
        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        image_data = base64.b64encode(staticmap_fieldops()).decode('utf-8')
        context['map'] = f"data:image/png;base64,{image_data}"
        return context
