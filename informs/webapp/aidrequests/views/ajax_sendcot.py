import json
from django.http import JsonResponse
from django_q.tasks import async_task, fetch
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required, permission_required

from ..tasks import aidrequest_takcot
from ..models import AidRequest, FieldOp

from icecream import ic
from datetime import datetime


@login_required
@permission_required('aidrequests.view_aidrequest')
@require_http_methods(["POST"])
def sendcot_aidrequest(request, field_op=None):
    """ Starts the async_task and returns task ID

    If no aidrequests array is provided, sends all aid requests for the field_op
    """
    try:
        data = json.loads(request.body)  # Parse JSON request body
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

    message_type = data.get('message_type', 'update')
    if message_type not in ['update', 'remove', 'test']:
        return JsonResponse({"status": "error", "message": "Invalid message_type provided."})

    mark_type = data.get('mark_type', 'AidRequest')  # Default to AidRequest for backward compatibility
    if mark_type not in ['FieldOp', 'AidRequest']:
        return JsonResponse({"status": "error", "message": "Invalid mark_type provided."})

    timestamp_now = datetime.now().strftime('%Y%m%d-%H%M%S')

    # Set task title based on message type and mark type
    task_title = f"TAK{message_type.capitalize()}-{mark_type}-OnDemand_{timestamp_now}"

    try:
        if mark_type == 'FieldOp':
            # Send only field op marker
            sendcot_id = async_task(
                'aidrequests.tasks.send_fieldop_cot',
                field_op_slug=field_operation.slug,
                message_type=message_type,
                task_name=task_title
            )
        else:
            # Handle AidRequest marking (existing functionality)
            aidrequest_id = data.get('aidrequest_id')
            aidrequests = data.get('aidrequests', [])

            if aidrequest_id:
                # Single aid request case
                aid_request = get_object_or_404(AidRequest, id=aidrequest_id, field_op=field_operation)
                sendcot_id = async_task(
                    aidrequest_takcot,
                    aidrequest_id=aidrequest_id,
                    message_type=message_type,
                    task_name=task_title
                )
            elif aidrequests:
                # Multiple specific aid requests case
                aidrequest_list = [int(aid) for aid in aidrequests]
                # Verify all requests belong to this field_op
                valid_requests = AidRequest.objects.filter(
                    id__in=aidrequest_list,
                    field_op=field_operation
                ).values_list('id', flat=True)

                if len(valid_requests) != len(aidrequest_list):
                    return JsonResponse({
                        "status": "error",
                        "message": "Some aid requests do not belong to this field operation."
                    })

                sendcot_id = async_task(
                    aidrequest_takcot,
                    aidrequest_list=list(valid_requests),
                    message_type=message_type,
                    task_name=task_title
                )
            else:
                # Send all aid requests for this field_op case
                all_requests = AidRequest.objects.filter(
                    field_op=field_operation
                ).values_list('id', flat=True)

                if not all_requests.exists():
                    return JsonResponse({
                        "status": "error",
                        "message": "No aid requests found for this field operation."
                    })

                sendcot_id = async_task(
                    aidrequest_takcot,
                    aidrequest_list=list(all_requests),
                    message_type=message_type,
                    task_name=task_title
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
        if task_result is None:
            return JsonResponse({
                "status": "PENDING",
                "message": "Task is still processing"
            })

        if isinstance(task_result.result, Exception):
            return JsonResponse({
                "status": "FAILURE",
                "result": str(task_result.result)
            })

        if task_result.success:
            return JsonResponse({
                "status": "SUCCESS",
                "result": str(task_result.result)
            })
        else:
            return JsonResponse({
                "status": "FAILURE",
                "result": "Task failed without an error message"
            })

    except Exception as e:
        return JsonResponse({
            "status": "error",
            "message": f"Error checking task status: {str(e)}"
        })
