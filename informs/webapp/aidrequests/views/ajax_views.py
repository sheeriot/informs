from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_POST
import json
import logging

from ..models import AidRequest
from ..forms import (
    RequestorInformationForm,
    AidContactInformationForm,
    LocationInformationForm,
    RequestDetailsForm,
    RequestStatusForm,
)

logger = logging.getLogger(__name__)

@require_POST
@login_required
def update_aid_request(request, field_op, pk):
    try:
        aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
        data = json.loads(request.body)
        form_name = data.get('form_name')

        FORM_MAP = {
            'requestor': RequestorInformationForm,
            'aid_contact': AidContactInformationForm,
            'location': LocationInformationForm,
            'details': RequestDetailsForm,
            'status': RequestStatusForm,
        }

        if form_name in FORM_MAP:
            form_class = FORM_MAP[form_name]
            form = form_class(data, instance=aid_request)
            if form.is_valid():
                form.save()
                return JsonResponse({'success': True})
            else:
                return JsonResponse({'success': False, 'errors': form.errors}, status=400)

        updated = False
        if 'status' in data:
            aid_request.status = data['status']
            updated = True

        if 'priority' in data:
            aid_request.priority = data['priority']
            updated = True

        if updated:
            aid_request.save()
            response_data = {
                'success': True,
                'id': aid_request.id,
                'status': aid_request.status,
                'status_display': aid_request.get_status_display(),
                'priority': aid_request.priority,
                'priority_display': aid_request.get_priority_display(),
            }
            return JsonResponse(response_data)

        return JsonResponse({'success': False, 'error': 'Invalid data provided'}, status=400)

    except AidRequest.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'AidRequest not found'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error updating aid request {pk}: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
