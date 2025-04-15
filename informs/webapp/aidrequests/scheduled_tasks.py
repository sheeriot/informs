from django.utils import timezone
import logging
from datetime import datetime
from icecream import ic

from .models import AidRequest, FieldOp
from .tasks import aidrequest_takcot

# Get the COT logger
cot_logger = logging.getLogger('cot')


def refresh_all_cot_messages():
    """
    Periodic task to refresh all active COT messages.
    This ensures TAK clients have up-to-date information even if they missed some updates.
    """
    timestamp = timezone.now().strftime('%Y%m%d%H%M%S')

    # Get all field ops
    for field_op in FieldOp.objects.all():
        # Get all active aid requests for this field op
        active_requests = AidRequest.objects.filter(
            field_op=field_op,
            status__in=['new', 'assigned', 'resolved']  # Only send active requests
        )

        if active_requests.exists():
            aid_request_ids = list(active_requests.values_list('id', flat=True))
            aidrequest_takcot(
                aidrequest_list=aid_request_ids,
                message_type='update',
            )


def hourly_field_op_cot(field_op_slug=None):
    """
    Hourly task to send COT messages for each Field Op that has a TAK server configured.
    This includes the Field Op location and all active aid requests.

    Args:
        field_op_slug (str, optional): If provided, only process this specific Field Op.
                                      If None, process all Field Ops.
    """
    timestamp = timezone.now().strftime('%Y%m%d%H%M%S')
    ic(f"Starting COT task at {timestamp}")

    # Get field ops with TAK servers configured
    field_ops = FieldOp.objects.filter(tak_server__isnull=False)
    if field_op_slug:
        ic(f"Filtering for specific field op: {field_op_slug}")
        field_ops = field_ops.filter(slug=field_op_slug)
        if not field_ops.exists():
            msg = f"No Field Op found with slug '{field_op_slug}' or no TAK server configured"
            ic(msg)
            cot_logger.error(msg)
            raise ValueError(msg)

    ic(f"Processing {field_ops.count()} field ops with TAK servers")

    for field_op in field_ops:
        ic(f"Processing COT for Field Op: {field_op.name} (ID: {field_op.pk})")
        cot_logger.info(f"Processing COT for Field Op: {field_op.name}")

        # Get active aid requests for this field op
        active_requests = AidRequest.objects.filter(
            field_op=field_op,
            status__in=['new', 'assigned', 'resolved']  # Only active statuses
        )

        # Log the status breakdown
        status_counts = {
            status: active_requests.filter(status=status).count()
            for status in ['new', 'assigned', 'resolved']
        }
        ic(f"Status counts for {field_op.name}:", status_counts)

        if active_requests.exists():
            aid_request_ids = list(active_requests.values_list('id', flat=True))
            ic(f"Sending COT for {len(aid_request_ids)} aid requests:", aid_request_ids)

            try:
                result = aidrequest_takcot(
                    aidrequest_list=aid_request_ids,
                    message_type='update'
                )
                success_msg = f"Successfully sent COT messages for {field_op.name}"
                ic(success_msg)
                cot_logger.info(success_msg)
                if isinstance(result, Exception):
                    error_msg = f"Error in COT task: {str(result)}"
                    ic(error_msg)
                    cot_logger.error(error_msg)
                    if field_op_slug:  # If running manually for a specific field op, raise the error
                        raise Exception(error_msg)
            except Exception as e:
                error_msg = f"Failed to send COT messages for {field_op.name}: {str(e)}"
                ic(error_msg)
                cot_logger.error(error_msg)
                if field_op_slug:  # If running manually for a specific field op, raise the error
                    raise Exception(error_msg)
        else:
            msg = f"No active aid requests for {field_op.name}"
            ic(msg)
            cot_logger.info(msg)
            if field_op_slug:  # If running manually, this might be important to know
                raise ValueError(msg)
