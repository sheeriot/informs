from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.views.decorators.http import require_POST
import json
import logging
from decimal import Decimal

from ..models import AidRequest, FieldOp, ActionLog
from ..forms import (
    RequesterInformationForm,
    LocationInformationForm,
    RequestDetailsForm,
    RequestStatusForm,
)

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
    try:
        aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
        is_htmx = request.headers.get('HX-Request') == 'true'

        if is_htmx:
            data = request.POST
        else:
            data = json.loads(request.body)

        form_name = data.get('form_name')

        FORM_MAP = {
            'requester': ('Requester Information', RequesterInformationForm),
            'location': ('Location Information', LocationInformationForm),
            'details': ('Request Details', RequestDetailsForm),
            'status': ('Request Status', RequestStatusForm),
        }

        if form_name in FORM_MAP:
            form_title, form_class = FORM_MAP[form_name]
            form = form_class(data, instance=aid_request)
            if form.is_valid():
                form.save()

                note = form.cleaned_data.get('note')
                changed_fields = form.changed_data

                if changed_fields or note:
                    changes_list = []
                    for field_name in changed_fields:
                        field_label = form.fields[field_name].label or field_name
                        new_value = form.cleaned_data.get(field_name)

                        # For choice fields, get the display value
                        display_method = getattr(aid_request, f'get_{field_name}_display', None)
                        if callable(display_method):
                            new_value = display_method()

                        if isinstance(new_value, bool):
                            new_value = "Yes" if new_value else "No"
                        changes_list.append(f"'{field_label}' to '{new_value}'")

                    changes_str = ", ".join(changes_list)

                    if changes_str:
                        event_text = f"Changed {changes_str}"
                    else:
                        event_text = "Note added"

                    is_markdown = data.get('is_markdown') == 'true'

                    ActionLog.objects.create(
                        aid_request=aid_request,
                        created_by=request.user,
                        log_type='user',
                        event_name=f"Updated {form_title}",
                        event_text=event_text,
                        note=note if note else "",
                        is_markdown=is_markdown,
                        agent_name=request.user.username
                    )

                return JsonResponse({'success': True})
            else:
                return JsonResponse({'success': False, 'errors': form.errors}, status=400)

        # This part handles the HTMX status/priority updates from the new widget.
        changed_fields = []
        note = data.get('action_note', '')
        is_markdown = data.get('is_markdown') == 'on'

        # We process status and priority separately to avoid issues with missing data
        if 'status' in data and data['status'] != aid_request.status:
            old_status_display = aid_request.get_status_display()
            aid_request.status = data['status']
            new_status_display = aid_request.get_status_display()
            changed_fields.append(f"'Status' from '{old_status_display}' to '{new_status_display}'")

        if 'priority' in data and data['priority'] != aid_request.priority:
            old_priority_display = aid_request.get_priority_display()
            aid_request.priority = data['priority']
            new_priority_display = aid_request.get_priority_display()
            changed_fields.append(f"'Priority' from '{old_priority_display}' to '{new_priority_display}'")

        if changed_fields:
            ActionLog.objects.create(
                aid_request=aid_request,
                created_by=request.user,
                log_type='user',
                event_name="Request Status Update",
                event_text="Updated " + ", ".join(changed_fields),
                note=note,
                is_markdown=is_markdown,
                agent_name=request.user.username
            )

            aid_request.save()  # This now correctly triggers django-auditlog

            if is_htmx:
                status_form = RequestStatusForm(instance=aid_request)
                context = {'aid_request': aid_request, 'status_form': status_form}
                response = render(request, 'aidrequests/includes/aid_request_status.html', context)

                # Create the event detail payload
                event_detail = {
                    'status_display': aid_request.get_status_display(),
                    'priority_display': aid_request.get_priority_display(),
                }
                response['HX-Trigger'] = json.dumps({'actionLogUpdated': event_detail})
                return response

            # Fallback for non-HTMX requests if any
            response_data = {
                'success': True,
                'id': aid_request.id,
                'status': aid_request.status,
                'status_display': aid_request.get_status_display(),
                'priority': aid_request.priority,
                'priority_display': aid_request.get_priority_display(),
            }
            return JsonResponse(response_data)
        else:
            # Handle case where data was submitted but nothing changed
            if is_htmx:
                 # Re-render the same component to do nothing visually
                status_form = RequestStatusForm(instance=aid_request)
                context = {'aid_request': aid_request, 'status_form': status_form}
                return render(request, 'aidrequests/includes/aid_request_status.html', context)
            return JsonResponse({'success': False, 'error': 'No changes detected'}, status=400)


    except AidRequest.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'AidRequest not found'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error updating aid request {pk}: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
