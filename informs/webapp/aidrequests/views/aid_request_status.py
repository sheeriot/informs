from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.conf import settings

from ..models import AidRequest
from django_q.tasks import fetch

import logging

logger = logging.getLogger(__name__)

def get_task_status(task_name):
    """Fetches a task and returns its status."""
    task = fetch(task_name)
    if not task:
        return "Pending"
    if task.success:
        return "Success"
    if task.stopped:
        return "Failed"
    return "In Progress"

def get_aid_request_status(request, pk):
    """
    API endpoint to get the processing status of an AidRequest.
    Checks the status of Django-Q tasks and supplements with empirical data checks.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk)

    status_data = {
        'location_status': 'Pending',
        'map_status': 'Pending',
        'email_status': 'Pending',
        'cot_status': 'Pending',
        'map_url': None,
        'all_done': False
    }

    # 1. Check the main post-save task
    post_save_task_name = f"AR{pk}_postsave"
    post_save_task = fetch(post_save_task_name)

    if not post_save_task:
        return JsonResponse(status_data)

    if post_save_task.success:
        status_data['location_status'] = "Success"
        post_save_result = post_save_task.result()

        if post_save_result.get('map_generated'):
            status_data['map_status'] = "Success"
            map_filename = post_save_result.get('map_filename')
            if map_filename:
                status_data['map_url'] = f"{settings.MEDIA_URL}maps/{map_filename}"
        else:
            status_data['map_status'] = "Failed"

        # 2. Check email tasks based on the result of the first task
        email_tasks = post_save_result.get('email_tasks_queued', [])
        if not email_tasks:
            status_data['email_status'] = "Not Required"
        else:
            email_statuses = [get_task_status(name) for name in email_tasks]
            if all(s == "Success" for s in email_statuses):
                status_data['email_status'] = "Success"
            elif "Failed" in email_statuses:
                status_data['email_status'] = "Failed"
            elif "In Progress" in email_statuses:
                 status_data['email_status'] = "In Progress"
            else: # All are Pending or Success (but not all are success)
                status_data['email_status'] = "Queued"

    elif post_save_task.stopped:
        status_data['location_status'] = "Failed"
        status_data['map_status'] = "Failed"
        status_data['email_status'] = "Skipped"
    else:
        status_data['location_status'] = "In Progress"
        status_data['map_status'] = "In Progress"

    # Placeholder for CoT status check
    if aid_request.logs.filter(log_entry__icontains='COT sent').exists():
        status_data['cot_status'] = "Success"

    final_statuses = [status_data['location_status'], status_data['map_status'], status_data['email_status']]
    if all(s in ["Success", "Not Required", "Skipped"] for s in final_statuses):
        status_data['all_done'] = True

    return JsonResponse(status_data)
