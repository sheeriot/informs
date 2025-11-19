from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.core.exceptions import PermissionDenied
from django.views.decorators.http import require_POST
import json
import logging
from decimal import Decimal
from icecream import ic
from django.template.loader import render_to_string

# Configure icecream output
ic.configureOutput(prefix='[ic] | ', includeContext=True)

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
    ic.enable()
    field_op_obj = get_object_or_404(FieldOp, slug=field_op)
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op=field_op_obj)

    try:
        data = json.loads(request.body)
        ic('Received data for aid request update:', data)

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
            ic(f"Saving with note: '{note}' (Markdown: {note_markdown})")
            aid_request.save(
                note=note,
                note_markdown=note_markdown,
                update_fields=['status', 'priority', 'updated_at', 'updated_by']
            )
            return HttpResponse(status=204)
        else:
            return HttpResponse(status=204)

    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
    except Exception as e:
        ic('Error updating aid request:', e)
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
