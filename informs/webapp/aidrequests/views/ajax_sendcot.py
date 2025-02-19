import json
from django.http import JsonResponse
from django_q.tasks import async_task, fetch

from ..tasks import aidrequest_takcot
# from ..models import AidRequest

from icecream import ic
from datetime import datetime


def sendcot_aidrequest(request):
    """ Starts the async_task and returns task ID """
    ic('ajax - sendcot_aidrequest')

    if request.method == "POST":
        ic(request.body)
        try:
            data = json.loads(request.body)  # Parse JSON request body
        except Exception as e:
            ic(e)
            return e
        ic(data)
        aidrequests = data.get('aidrequests', [])
        aidrequest_id = data.get('aidrequest_id', None)
        message_type = data.get('message_type', 'update')
        ic(message_type)

        if not aidrequest_id and not aidrequests:
            ic('not aidrequest_id and not aidrequests')
            return JsonResponse({"status": "error", "message": "No aidrequest id or list provided."})

        timestamp_now = datetime.now().strftime('%Y%m%d-%H%M%S')
        # ic(timestamp_now)
        if message_type == "update":
            task_title = f"TAKAlert-FO-OnDemand_{timestamp_now}"
        elif message_type == "remove":
            task_title = f"TAKClear-FO-OnDemand_{timestamp_now}"
        else:
            return JsonResponse({"status": "error", "message": "Invalid message_type provided."})

        if aidrequests:
            aidrequest_list = [int(aid) for aid in aidrequests]
            # ic(aidrequest_list)
            # ic(type(aidrequest_list))
            sendcot_id = async_task(aidrequest_takcot, aidrequest_list=aidrequest_list, message_type=message_type,
                                    task_name=task_title)
        elif aidrequest_id:
            ic(aidrequest_id)
            sendcot_id = async_task(aidrequest_takcot, aidrequest_id=aidrequest_id, message_type=message_type,
                                    task_name=task_title)

        return JsonResponse({"sendcot_id": sendcot_id})


def sendcot_checkstatus(request):
    """ Checks the status of the task """
    sendcot_id = request.GET.get("sendcot_id", None)
    if not sendcot_id:
        return JsonResponse({"status": "error", "message": "No sendcot_id provided."})
    task_result = fetch(sendcot_id)
    if task_result:
        # ic(vars(task_result))
        return JsonResponse({"status": "done", "result": task_result.result})
    return JsonResponse({"status": "pending"})
