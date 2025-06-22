import json
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required, permission_required
from django_q.tasks import async_task
from datetime import datetime

from ..models import FieldOp
from ..tasks import send_cot_task
# from icecream import ic


@login_required
@permission_required('aidrequests.change_fieldop')
@require_http_methods(["POST"])
def toggle_cot(request, field_op):
    """Toggle COT status for a Field Op"""
    try:
        data = json.loads(request.body)
        disable_cot = data.get('disable_cot')

        if disable_cot is None:
            return JsonResponse({
                'status': 'error',
                'message': 'Missing required parameters'
            }, status=400)

        field_op_obj = get_object_or_404(FieldOp, slug=field_op)
        field_op_obj.disable_cot = disable_cot
        field_op_obj.save()

        # If enabling COT, send an initial marker
        if not disable_cot:
            timestamp_now = datetime.now().strftime('%Y%m%d-%H%M%S')
            task_title = f"TAK-field-OnEnable_{timestamp_now}"
            async_task(
                send_cot_task,
                field_op_slug=field_op,
                mark_type='field',
                task_name=task_title
            )

        return JsonResponse({
            'status': 'success',
            'message': f'COT {"disabled" if disable_cot else "enabled"} for {field_op_obj.name}'
        })

    except json.JSONDecodeError:
        return JsonResponse({
            'status': 'error',
            'message': 'Invalid JSON data'
        }, status=400)
    except Exception as e:
        # ic(e)
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)
