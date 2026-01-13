from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.core.exceptions import PermissionDenied
from django.views.decorators.http import require_POST
import json
import logging
from decimal import Decimal
from django.template.loader import render_to_string

from ..models import AidRequest, FieldOp
from ..forms import RequesterInformationForm, LocationInformationForm, RequestDetailsForm


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
    Update the status or priority of an aid request.
    """
    field_op_obj = get_object_or_404(FieldOp, slug=field_op)
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op=field_op_obj)

    try:
        data = json.loads(request.body)

        updated = False
        if 'status' in data:
            aid_request.status = data['status']
            updated = True
        if 'priority' in data:
            aid_request.priority = data['priority']
            if aid_request.priority == 'none':
                aid_request.priority = None
            updated = True

        if updated:
            note = data.get('note', '')
            note_markdown = data.get('note_markdown', False)

            # Correctly pass update_fields to save()
            update_fields = []
            if 'status' in data:
                update_fields.append('status')
            if 'priority' in data:
                update_fields.append('priority')

            # Always include updated_at and updated_by
            update_fields.extend(['updated_at', 'updated_by'])

            aid_request.save(
                note=note,
                note_markdown=note_markdown,
                update_fields=update_fields
            )
            return JsonResponse(aid_request.to_dict(), status=200, encoder=DecimalEncoder)
        else:
            # If nothing was updated, just return the current state
            return JsonResponse(aid_request.to_dict(), status=200, encoder=DecimalEncoder)

    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
