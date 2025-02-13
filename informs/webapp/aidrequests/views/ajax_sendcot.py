# import json
from django.http import JsonResponse
from django_q.tasks import async_task, fetch

from ..tasks import aidrequest_takcot
from ..models import AidRequest

from icecream import ic


def sendcot_aidrequest(request):
    """ Starts the async_task and returns task ID """
    if request.method == "POST":
        aidrequest_id = request.POST.get("aidrequest_id", None)
        if not aidrequest_id:
            return JsonResponse({"status": "error", "message": "No aidrequest_id provided."})
        try:
            aid_request = AidRequest.objects.get(pk=aidrequest_id)
        except AidRequest.DoesNotExist:
            return JsonResponse({"status": "error", "message": "AidRequest not found."})
        message_type = request.POST.get("message_type", "update")
        timestamp_lastupdate = aid_request.updated_at.strftime('%Y%m%d%H%M')
        if message_type == "update":
            task_title = f"AidRequest{aid_request.pk}-OnDemand-CotSend_Updated-{timestamp_lastupdate}"
        elif message_type == "remove":
            task_title = f"AidRequest{aid_request.pk}-OnDemand-COTRemove"
        else:
            return JsonResponse({"status": "error", "message": "Invalid message_type provided."})

        sendcot_id = async_task(aidrequest_takcot, aid_request, message_type=message_type,
                                task_name=task_title)
        return JsonResponse({"sendcot_id": sendcot_id})


def sendcot_checkstatus(request):
    """ Checks the status of the task """
    sendcot_id = request.GET.get("sendcot_id", None)
    if not sendcot_id:
        return JsonResponse({"status": "error", "message": "No sendcot_id provided."})
    task_result = fetch(sendcot_id)
    if task_result:
        ic(vars(task_result))
        return JsonResponse({"status": "done", "result": task_result.result})
    return JsonResponse({"status": "pending"})
