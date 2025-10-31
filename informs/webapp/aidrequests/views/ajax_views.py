from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.core.exceptions import PermissionDenied
from django.views.decorators.http import require_POST
import json
import logging
from decimal import Decimal

from ..models import AidRequest, FieldOp

logger = logging.getLogger(__name__)

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

@login_required
def get_aid_requests_json(request, field_op):
    """
    API endpoint to get all aid requests for a field operation as JSON.
    """
    field_op = get_object_or_404(FieldOp, slug=field_op)
    aid_requests = field_op.aid_requests.all().select_related('aid_type').prefetch_related('locations')
    all_aid_requests_data = [req.to_dict() for req in aid_requests]
    return JsonResponse(all_aid_requests_data, safe=False, encoder=DecimalEncoder)

@require_POST
@login_required
def update_aid_request(request, field_op, pk):
    """
    Updates an AidRequest's status and/or priority.
    This view now handles all field updates for the main aid request card.
    """
    try:
        aid_request = get_object_or_404(AidRequest, pk=pk)
        if aid_request.field_op.slug != field_op:
            raise PermissionDenied("You do not have permission for this field operation.")

        data = json.loads(request.body)
        note = data.get('note', '')
        note_markdown = data.get('note_markdown', False)

        updated = False
        update_fields = ['updated_by']

        if 'status' in data:
            new_status = data.get('status')
            if new_status not in [choice[0] for choice in AidRequest.STATUS_CHOICES]:
                return JsonResponse({'status': 'error', 'message': 'Invalid status value.'}, status=400)
            if aid_request.status != new_status:
                aid_request.status = new_status
                update_fields.append('status')
                updated = True

        if 'priority' in data:
            new_priority = data.get('priority')
            if new_priority not in [choice[0] for choice in AidRequest.PRIORITY_CHOICES if choice[0] is not None] + ['']:
                 return JsonResponse({'status': 'error', 'message': 'Invalid priority value.'}, status=400)
            new_priority = new_priority if new_priority else None
            if aid_request.priority != new_priority:
                aid_request.priority = new_priority
                update_fields.append('priority')
                updated = True

        if updated:
            aid_request.updated_by = request.user
            aid_request.save(
                update_fields=update_fields,
                note=note,
                note_markdown=note_markdown
            )

        return JsonResponse({
            'status': 'success',
            'new_status_display': aid_request.get_status_display(),
            'new_priority_display': aid_request.get_priority_display(),
        })

    except AidRequest.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'AidRequest not found.'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
    except Exception as e:
        logger.error(f"Error updating aid request {pk}: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
