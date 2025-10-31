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
import json

from ..models import AidLocation, AidRequest, ActionLog
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

    try:
        data = json.loads(request.body)
        action = data.get('action')
        note = data.get('note', '')
        note_is_markdown = data.get('note_markdown', False)

        if action == 'confirm':
            location.status = 'confirmed'
            location.save(note=note, note_markdown=note_is_markdown)
            aid_request.locations.exclude(pk=location.pk).filter(status='confirmed').update(status='new')
            event_name = "Location Confirmed"
            event_text = f"Location #{location.pk} confirmed."

        elif action == 'reject':
            location.status = 'rejected'
            location.save(note=note, note_markdown=note_is_markdown)
            event_name = "Location Rejected"
            event_text = f"Location #{location.pk} rejected."

        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid action.'}, status=400)

        aid_request.refresh_from_db()
        # Prepare context for rendering partials
        locations = aid_request.locations.all().order_by('-created_at')

        context = {
            'object': aid_request,
            'aid_request': aid_request,
            'location': location,
            'locations': locations,
            'confirmed': aid_request.location_status == 'confirmed'
        }

        card_html = render_to_string('aidrequests/partials/_aid_location_card.html', context, request=request)
        header_html = render_to_string('aidrequests/partials/aid_request_header.html', context, request=request)

        return JsonResponse({
            'status': 'success',
            'location_pk': location.pk,
            'card_html': card_html,
            'header_html': header_html,
        })

    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
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
