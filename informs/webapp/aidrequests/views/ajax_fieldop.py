import json
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required, permission_required

from ..models import FieldOp
from ..tasks import send_fieldop_cot_task
from icecream import ic


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
            send_fieldop_cot_task(field_op)

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
        if fieldOpsConfig.debug:
            ic(e)
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@login_required
@permission_required('aidrequests.view_fieldop')
@require_http_methods(["POST"])
def send_cot(request, field_op):
    """Send COT message for a Field Op and/or its Aid Requests"""
    try:
        data = json.loads(request.body)
        mark_type = data.get('mark_type')

        if not mark_type:
            return JsonResponse({
                'status': 'error',
                'message': 'Missing required parameters'
            }, status=400)

        field_op_obj = get_object_or_404(FieldOp, slug=field_op)

        if field_op_obj.disable_cot:
            return JsonResponse({
                'status': 'error',
                'message': 'COT is disabled for this field operation'
            }, status=400)

        if not field_op_obj.tak_server:
            return JsonResponse({
                'status': 'error',
                'message': 'No TAK server configured for this field operation'
            }, status=400)

        if mark_type == 'FieldOp':
            result = send_fieldop_cot_task(field_op)
        elif mark_type == 'AidRequest':
            # Use existing aid request COT sending function
            from .ajax_sendcot import sendcot_aidrequest
            return sendcot_aidrequest(request, field_op=field_op)
        else:
            return JsonResponse({
                'status': 'error',
                'message': f'Invalid mark type: {mark_type}'
            }, status=400)

        return JsonResponse({
            'status': 'success',
            'message': f'Successfully sent {mark_type} COT message'
        })

    except json.JSONDecodeError:
        return JsonResponse({
            'status': 'error',
            'message': 'Invalid JSON data'
        }, status=400)
    except Exception as e:
        if fieldOpsConfig.debug:
            ic(e)
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)
