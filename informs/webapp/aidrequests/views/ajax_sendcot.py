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
        updated_at_stamp = aid_request.updated_at.strftime('%Y%m%d%H%M')
        sendcot_id = async_task(aidrequest_takcot, aid_request, kwargs={},
                                task_name=(
                                    f"AidRequest{aid_request.pk}-OnDemand-"
                                    f"SendCot_LastUpdated-{updated_at_stamp}"))
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
