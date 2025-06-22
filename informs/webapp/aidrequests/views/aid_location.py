from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse_lazy, reverse
from django.views.generic import CreateView, UpdateView, DeleteView
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.template.loader import render_to_string
import logging

from ..models import AidLocation, AidRequest
from .aid_location_forms import AidLocationCreateForm
from .maps import create_static_map

logger = logging.getLogger(__name__)

class AidLocationCreateView(LoginRequiredMixin, CreateView):
    model = AidLocation
    form_class = AidLocationCreateForm
    template_name = 'aidrequests/aid_location_form.html'

    def get_success_url(self):
        return reverse('aid_request_detail', kwargs={'pk': self.object.aid_request.pk, 'fieldop_slug': self.object.aid_request.field_op.slug})

    def form_valid(self, form):
        response = super().form_valid(form)
        create_static_map(self.object)
        return response

class AidLocationUpdateView(LoginRequiredMixin, UpdateView):
    model = AidLocation
    fields = ['name', 'address', 'latitude', 'longitude', 'status']
    template_name = 'aidrequests/aid_location_form.html'
    success_url = reverse_lazy('aid_request_list')

class AidLocationDeleteView(LoginRequiredMixin, DeleteView):
    model = AidLocation
    template_name = 'aidrequests/aid_location_confirm_delete.html'
    success_url = reverse_lazy('aid_request_list')

@require_POST
@login_required
def aid_location_status_update(request, field_op, location_pk):
    location = get_object_or_404(AidLocation, pk=location_pk)
    aid_request = location.aid_request
    action = request.POST.get('action')

    try:
        # Use the existing location property to check for a confirmed location
        has_confirmed = aid_request.location and aid_request.location.status == 'confirmed'

        if action == 'confirm' and not has_confirmed:
            location.status = 'confirmed'
            location.save()
        elif action == 'reject' and location.status == 'confirmed':
            location.status = 'rejected'
            location.save()
        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid action or state.'}, status=400)

        # Refresh the request object to get the latest state
        aid_request.refresh_from_db()

        # Check the confirmed status again after the potential change
        has_confirmed_after_update = aid_request.location and aid_request.location.status == 'confirmed'

        return JsonResponse({
            'status': 'success',
            'location_pk': location.pk,
            'new_status': location.status,
            'new_status_display': location.get_status_display(),
            'aid_request_has_confirmed_location': has_confirmed_after_update
        })

    except Exception as e:
        logger.error(f"Error updating location status for pk {location_pk}: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@require_POST
@login_required
def regenerate_map_view(request, pk):
    location = get_object_or_404(AidLocation, pk=pk)
    try:
        create_static_map(location)
        messages.success(request, "Map image regenerated successfully.")
        return JsonResponse({'success': True})
    except Exception as e:
        logger.error(f"Error regenerating map for location {pk}: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
