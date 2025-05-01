import json
from django.http import JsonResponse
from django_q.tasks import async_task, fetch
from django.shortcuts import get_object_or_404

from ..tasks import aidrequest_takcot
from ..models import AidRequest, FieldOp

from icecream import ic
from datetime import datetime


def sendcot_aidrequest(request, field_op=None):
    """ Starts the async_task and returns task ID

    If no aidrequests array is provided, sends all aid requests for the field_op
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Only POST method is allowed."})

    # Validate field_op exists
    if not field_op:
        return JsonResponse({"status": "error", "message": "Field operation slug is required."})

    field_operation = get_object_or_404(FieldOp, slug=field_op)

    try:
        data = json.loads(request.body)  # Parse JSON request body
    except Exception as e:
        ic(e)
        return JsonResponse({"status": "error", "message": "Could not parse JSON request body."})

    message_type = data.get('message_type', 'update')
    if message_type not in ['update', 'remove', 'test']:
        return JsonResponse({"status": "error", "message": "Invalid message_type provided."})

    timestamp_now = datetime.now().strftime('%Y%m%d-%H%M%S')

    # Set task title based on message type
    task_title = f"TAK{message_type.capitalize()}-ARList-OnDemand_{timestamp_now}"

    # Get aid request IDs
    aidrequests = data.get('aidrequests', [])
    aidrequest_id = data.get('aidrequest_id')

    try:
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
            "message": f"Task created successfully for {field_op}"
        })

    except Exception as e:
        ic(e)
        return JsonResponse({
            "status": "error",
            "message": f"Error processing request: {str(e)}"
        })


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
