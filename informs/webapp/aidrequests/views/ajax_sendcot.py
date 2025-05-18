import json
from django.http import JsonResponse
from django_q.tasks import async_task, fetch
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required, permission_required

from ..models import AidRequest, FieldOp
from icecream import ic
from datetime import datetime


@login_required
@permission_required('aidrequests.view_aidrequest')
@require_http_methods(["POST"])
def send_cot(request, field_op=None):
    """
    Unified endpoint for sending COT messages for both field ops and aid requests.

    Expected POST data:
    - mark_type: 'field' for field op marker, 'aid' for aid requests (default: 'aid')
    - aidrequests: (optional) List of aid request IDs to send

    If mark_type='aid' and aidrequests is not provided,
    all active aid requests for the field op will be sent.
    """
    try:
        data = json.loads(request.body)
    except Exception as e:
        ic(e)
        return JsonResponse({"status": "error", "message": "Could not parse JSON request body."})

    # Validate field_op exists
    field_op_slug = field_op or data.get('field_op')
    if not field_op_slug:
        return JsonResponse({"status": "error", "message": "Field operation slug is required."})

    field_operation = get_object_or_404(FieldOp, slug=field_op_slug)

    # Check if COT is disabled
    if field_operation.disable_cot:
        return JsonResponse({
            "status": "error",
            "message": "COT is disabled for this field operation."
        })

    # Get mark_type parameter
    mark_type = data.get('mark_type', 'aid')
    if mark_type not in ['field', 'aid']:
        return JsonResponse({"status": "error", "message": "Invalid mark_type provided."})

    timestamp_now = datetime.now().strftime('%Y%m%d-%H%M%S')
    task_title = f"TAK-{mark_type}-OnDemand_{timestamp_now}"

    try:
        # Start the async task with appropriate parameters
        task_kwargs = {
            'field_op_slug': field_operation.slug,
            'mark_type': mark_type,
        }

        # Only add aidrequests if provided and non-empty for aid mark_type
        if mark_type == 'aid':
            aidrequests = data.get('aidrequests')
            if aidrequests:
                # Ensure aidrequests is a list
                if not isinstance(aidrequests, list):
                    aidrequests = [aidrequests]
                if aidrequests:  # Only add if we have actual IDs
                    task_kwargs['aidrequests'] = aidrequests

        sendcot_id = async_task(
            'aidrequests.tasks.send_cot_task',
            task_name=task_title,
            **task_kwargs
        )

        return JsonResponse({
            "status": "success",
            "sendcot_id": sendcot_id,
            "message": f"Task created successfully for {field_op_slug}"
        })

    except Exception as e:
        ic(e)
        return JsonResponse({
            "status": "error",
            "message": f"Error processing request: {str(e)}"
        })


@login_required
@permission_required('aidrequests.view_aidrequest')
def sendcot_checkstatus(request, field_op=None, task_id=None):
    """ Checks the status of the task """
    if request.method != "GET":
        return JsonResponse({"status": "error", "message": "Only GET method is allowed."})

    # Get task ID either from query params or URL
    task_id = task_id or request.GET.get("sendcot_id")
    if not task_id:
        return JsonResponse({"status": "error", "message": "No task ID provided."})

    try:
        task_result = fetch(task_id)

        # Add consistent logging for debug
        ic(f"Task status check for ID: {task_id}")

        # Task hasn't completed yet
        if task_result is None:
            response = {
                "status": "PENDING",
                "message": "Sending COT to TAK..."
            }
            ic("API Response (PENDING):", response)
            return JsonResponse(response)

        # Task completed but had an error
        if isinstance(task_result.result, Exception):
            response = {
                "status": "FAILURE",
                "result": str(task_result.result)
            }
            ic("API Response (FAILURE):", response)
            return JsonResponse(response)

        # Task completed successfully
        if task_result.success:
            # Get the raw result string
            result_str = str(task_result.result)
            ic("Raw task result string:", result_str)

            # Extract statistics from the result string
            import re

            # Look for field markers first
            field_count = 0
            field_match = re.search(r'(\d+) field marker', result_str)
            if field_match:
                field_count = int(field_match.group(1))
                ic("Extracted field count:", field_count)

            # Look for aid markers
            aid_count = 0
            aid_match = re.search(r'(\d+) aid marker', result_str)
            if aid_match:
                aid_count = int(aid_match.group(1))
                ic("Extracted aid count:", aid_count)

            # Format a clean, consistent message
            message_parts = []
            if field_count > 0:
                message_parts.append(f"{field_count} field marker{'' if field_count == 1 else 's'}")
            if aid_count > 0:
                message_parts.append(f"{aid_count} aid marker{'' if aid_count == 1 else 's'}")

            # Create the final message
            if message_parts:
                formatted_result = f"Sent: {', '.join(message_parts)}"
            else:
                formatted_result = "Sent: markers to TAK"

            ic("Formatted result:", formatted_result)

            response = {
                "status": "SUCCESS",
                "result": formatted_result
            }
            ic("API Response (SUCCESS):", response)
            return JsonResponse(response)

        # Task completed but marked as failed
        response = {
            "status": "FAILURE",
            "result": "Task failed without an error message"
        }
        ic("API Response (FAILURE - no message):", response)
        return JsonResponse(response)

    except Exception as e:
        ic(f"Error checking task status: {e}")
        response = {
            "status": "error",
            "message": f"Error checking task status: {str(e)}"
        }
        ic("API Response (ERROR):", response)
        return JsonResponse(response)
