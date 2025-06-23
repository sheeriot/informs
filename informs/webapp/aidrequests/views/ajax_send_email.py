from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required
from django.conf import settings
from django_q.tasks import async_task
from ..models import AidRequest
import json
import logging

logger = logging.getLogger(__name__)

@login_required
@require_POST
def send_email_view(request, pk, field_op):
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)

    try:
        data = json.loads(request.body)
        recipients = data.get('recipients')
        subject = data.get('subject')
        message_body = data.get('message')

        if not all([recipients, subject, message_body]):
            return JsonResponse({'status': 'error', 'message': 'Missing required email data.'}, status=400)

        message = {
            "senderAddress": settings.MAIL_FROM,
            "recipients": {
                "to": [{"address": email} for email in recipients]
            },
            'content': {
                "subject": subject,
                "plainText": message_body,
                "html": f"<html><body><p>{message_body}</p></body></html>"
            },
        }

        async_task(
            'aidrequests.tasks.send_email',
            message,
            task_name=f"Send Email for Aid Request {pk}"
        )

        return JsonResponse({'status': 'success', 'message': 'Email task has been queued.'})

    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
    except Exception as e:
        logger.error(f"Error in send_email_view for AR {pk}: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
