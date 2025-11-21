from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy, reverse
from django.views.generic import CreateView, UpdateView, DeleteView
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.template.loader import render_to_string
import logging
import json
from django.http import HttpResponse
from icecream import ic
from django.conf import settings
from django.http import HttpResponseBadRequest

from ..models import AidLocation, AidRequest, ActionLog
from .aid_location_forms import AidLocationCreateForm
from .maps import create_static_map

logger = logging.getLogger(__name__)

class AidLocationCreateView(LoginRequiredMixin, CreateView):
    model = AidLocation
    form_class = AidLocationCreateForm
    template_name = 'aidrequests/aid_location_form.html'

    def get_success_url(self):
        return reverse('aid_request_detail', kwargs={'pk': self.object.aid_request.pk, 'field_op': self.object.aid_request.field_op.slug})

    def form_valid(self, form):
        response = super().form_valid(form)
        create_static_map(self.object)
        if self.request.htmx:
            headers = {
                'HX-Trigger': json.dumps({
                    'locationListUpdated': {
                        'new': self.object.pk
                    }
                })
            }
            return HttpResponse(status=204, headers=headers)
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
def aid_location_status_update(request, field_op, pk):
    """
    Update the status of an AidLocation (e.g., confirm, reject).
    This view is called via HTMX from a modal confirmation.
    """
    ic("In aid_location_status_update")
    try:
        data = json.loads(request.body)
        ic(data)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON")

    location = get_object_or_404(AidLocation, pk=pk)
    aid_request = location.aid_request
    action = data.get('action')
    note = data.get('note')
    note_markdown = data.get('note_markdown', False)

    if action not in ['confirm', 'reject', 'reset']:
        return HttpResponseBadRequest("Invalid action")

    if action == 'confirm':
        location.status = 'confirmed'
        # The ActionLog is now created inside the AidLocation.save() method
        # for better consistency and to handle auto-rejection logging.
    elif action == 'reject':
        location.status = 'rejected'
        # The ActionLog is now created inside the AidLocation.save() method.
    elif action == 'reset':
        location.status = 'new'
        # The ActionLog is now created inside the AidLocation.save() method.

    location.updated_by = request.user
    # Pass the note and user to the save method so it can create the correct log
    location.save(note=note, note_markdown=note_markdown)

    # Instead of rendering a partial, return the updated AidRequest as JSON
    # The frontend will dispatch 'aidRequestUpdated' and 'detailFieldUpdated'
    # which will cause HTMX to refresh the necessary parts of the page.
    return JsonResponse(aid_request.to_dict(), status=200)

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
