from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.core.exceptions import PermissionDenied
from django.views.decorators.http import require_POST
import json
import logging
from decimal import Decimal
from icecream import ic

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
    Handles AJAX updates for an AidRequest's status and priority.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    data = json.loads(request.body)
    # ic(data)

    response_data = {}
    updated_fields = []
    form_name = data.get('form_name')

    # Map form_name to the actual form class
    FORM_MAP = {
        'requester': RequesterInformationForm,
        'location': LocationInformationForm,
        'details': RequestDetailsForm,
    }

    if form_name in FORM_MAP:
        form_class = FORM_MAP[form_name]

        # IMPORTANT: Get old values *before* the instance is updated by the form.
        old_values = {field: getattr(aid_request, field) for field in form_class.Meta.fields}

        # The form needs the instance to compare against, and the data to validate
        form = form_class(data, instance=aid_request)

        if form.is_valid():
            changes = {}
            for field_name, new_value in form.cleaned_data.items():
                old_value = old_values.get(field_name) # Use the saved old value

                # Special handling for different field types to ensure accurate comparison
                if isinstance(old_value, Decimal) and isinstance(new_value, float):
                    old_value = float(old_value)

                if old_value != new_value:
                    changes[field_name] = {'old': old_value, 'new': new_value}
                    # No longer need setattr here, form.save() will handle it.

            if changes:
                # Construct a detailed log message
                change_details = []
                for field, values in changes.items():
                    field_display = field.replace('_', ' ').title()
                    old_str = f"'{values['old']}'" if values['old'] not in [None, ''] else 'empty'
                    new_str = f"'{values['new']}'" if values['new'] not in [None, ''] else 'empty'
                    change_details.append(f"° {field_display}:\n    ° From {old_str} -> {new_str}")

                note_text = "\n".join(change_details)
                ic(note_text)

                # Save the form to get the updated instance, but don't commit to DB yet
                updated_instance = form.save(commit=False)
                updated_instance.updated_by = request.user
                updated_instance.save() # Now, save all fields to trigger auditlog and main model save logic

                # Create the detailed ActionLog
                updated_instance.action_logs.create(
                    log_type='user',
                    event_name=f"{form_name.title()} Info Updated",
                    event_text="",
                    note=note_text,
                    note_markdown=False,
                    created_by=request.user,
                    agent_name=request.user.username,
                )

            response = HttpResponse(status=204) # 204 No Content
            response['HX-Trigger'] = json.dumps({
                "closeModal": "#genericEditModal",
                "detailFieldUpdated": "", # This will trigger the header refresh
                "actionLogUpdated": "",
                "auditLogUpdated": "",
                "showActionAlert": {
                    "message": f"{form_name.title()} Info updated successfully.",
                    "level": "success"
                }
            })
            return response
        else:
            ic(form.errors)
            return JsonResponse({'status': 'error', 'errors': form.errors.as_json()}, status=400)


    # --- Keep the old logic for status/priority for now ---
    try:
        if aid_request.field_op.slug != field_op:
            raise PermissionDenied("You do not have permission for this field operation.")

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
                note_markdown=note_markdown,
            )

        # Instead of JSON, return an empty response with HTMX triggers
        # to let the client-side handle UI updates.
        response = HttpResponse(status=204) # 204 No Content
        response['HX-Trigger'] = json.dumps({
            "detailFieldUpdated": "", # This will trigger the header refresh
            "actionLogUpdated": "",
            "auditLogUpdated": "",
            "showActionAlert": {
                "message": "Request updated successfully.",
                "level": "success"
            }
        })
        return response

    except AidRequest.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'AidRequest not found.'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
    except Exception as e:
        logger.error(f"Error updating aid request {pk}: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
