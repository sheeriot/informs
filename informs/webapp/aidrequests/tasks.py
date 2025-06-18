from django.conf import settings

from azure.communication.email import EmailClient
from datetime import datetime
from geopy.distance import geodesic

from .email_creator import email_connectstring, email_creator_html
from .geocoder import get_azure_geocode, geocode_save
from .views.maps import staticmap_aid, calculate_zoom
from .models import FieldOpNotify, AidRequest, FieldOp, AidLocation
from takserver.cot import CotSender, pytak_send_cot

import asyncio
import pytak

from django.core.management import call_command
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django_q.tasks import async_task

import logging

# Get the main application logger
logger = logging.getLogger(__name__)

# Get a dedicated COT logger
cot_logger = logging.getLogger('cot')

def aid_request_postsave(aid_request, **kwargs):
    logger.info(f"Staring aid_request_postsave for AR-{aid_request.pk} with kwargs: {kwargs}")
    is_new = kwargs.get('is_new')

    if not is_new:
        return "Not a new aid request, no post-save actions taken."

    latitude = kwargs.get('latitude')
    longitude = kwargs.get('longitude')
    location_note = kwargs.get('location_note')
    aid_location = None
    map_file = None

    if latitude and longitude:
        logger.info(f"AR-{aid_request.pk}: Coordinates provided, creating AidLocation directly.")
        aid_location = AidLocation.objects.create(
            aid_request=aid_request,
            latitude=latitude,
            longitude=longitude,
            source='user_picked',
            status='confirmed',
            note=location_note
        )

        logger.info(f"AR-{aid_request.pk}: Calculating distance from FieldOp.")
        distance = round(geodesic(
            (aid_request.field_op.latitude, aid_request.field_op.longitude),
            (latitude, longitude)
        ).km, 2)
        aid_location.distance = distance
        aid_location.save()

    else:
        logger.info(f"AR-{aid_request.pk}: No coordinates provided, falling back to address geocoding.")
        geocode_results = get_azure_geocode(aid_request)
        if geocode_results.get('status') == 'Success':
            aid_location = geocode_save(aid_request, geocode_results)
        else:
            logger.error(f"AR-{aid_request.pk}: Address geocoding failed, no location will be created.")

    if aid_location:
        logger.info(f"AR-{aid_request.pk}: AidLocation created/found: {aid_location.pk}, distance: {aid_location.distance}km.")

        zoom = calculate_zoom(aid_location.distance) if aid_location.distance is not None else 10
        logger.info(f"AR-{aid_request.pk}: Calculated zoom: {zoom}")

        staticmap_data = staticmap_aid(
            width=600, height=600, zoom=zoom,
            fieldop_lat=aid_request.field_op.latitude,
            fieldop_lon=aid_request.field_op.longitude,
            aid1_lat=aid_location.latitude,
            aid1_lon=aid_location.longitude,
        )
        logger.info(f"AR-{aid_request.pk}: Static map API call prepared.")

        if staticmap_data:
            timestamp = datetime.now().strftime("%y%m%d%H%M%S")
            map_filename = f"AR{aid_request.pk}-map_{timestamp}.png"
            map_file = f"{settings.MAPS_PATH}/{map_filename}"
            with open(map_file, 'wb') as file:
                file.write(staticmap_data)
            logger.info(f"AR-{aid_request.pk}: Static map saved to {map_file}")

            try:
                aid_location.map_filename = map_filename
                aid_location.save()
            except Exception as e:
                logger.error(f"Error saving map filename to AidLocation: {e}")
        else:
            logger.warning(f"AR-{aid_request.pk}: staticmap_aid call did not return PNG data.")

        logger.info(f"AR-{aid_request.pk}: Preparing to send notification emails.")
        notify_emails = aid_request.field_op.notify.filter(type__startswith='email')
        email_results = ""
        for notify in notify_emails:
            message = email_creator_html(aid_request, aid_location, notify, map_file)
            try:
                task_name = f"AR{aid_request.pk}_SendEmail_New_{notify.pk}"
                async_task('aidrequests.tasks.send_email', message, task_name=task_name)
                email_results += f"Email task for {notify.name} enqueued.\\n"
            except Exception as e:
                logger.error(f"Error enqueuing email task for {notify.name}: {e}")
                email_results += f"Email Enqueue Error for {notify.name}: {e}\\n"

        if email_results.endswith('\\n'):
            email_results = email_results[:-2]

        try:
            aid_request.logs.create(log_entry=f'{email_results}')
        except Exception as e:
            logger.error(f"Error logging email results: {e}")

        return email_results

    else:
        logger.warning(f"AR-{aid_request.pk}: No AidLocation was created. Skipping map and notifications.")
        return "No location created, skipping post-save actions."


def aid_request_notify(aid_request, **kwargs):

    aid_location = aid_request.location
    map_file = f"{settings.MAPS_PATH}/{aid_location.map_filename}"

    results = ""
    if 'email_extra' in kwargs['kwargs']:
        email_extra = kwargs['kwargs']['email_extra']
        if email_extra:
            notify = FieldOpNotify(
                type='email-adhoc',
                name='Extra Email',
                email=email_extra
            )
            message = email_creator_html(aid_request, aid_location, notify, map_file)
            try:
                timestamp = datetime.now().strftime('%H%M%S')
                task_name = f"AR{aid_request.pk}_SendEmail_Manual_Adhoc_{timestamp}"
                async_task('aidrequests.tasks.send_email', message, task_name=task_name)
                results += f"Email task for {notify.email} enqueued.\n |"
            except Exception as e:
                logger.error(f"Error enqueuing email task for {notify.email}: {e}")
                results += f"Email Enqueue Error for {notify.email}: {e}\n"

    notifies = kwargs['kwargs']['notifies']
    notify_emails = notifies.filter(type__startswith='email')
    for notify in notify_emails:
        message = email_creator_html(aid_request, aid_location, notify, map_file)
        try:
            task_name = f"AR{aid_request.pk}_SendEmail_Manual_{notify.pk}"
            async_task('aidrequests.tasks.send_email', message, task_name=task_name)
            results += f"Email task for {notify.email} enqueued.\n"
        except Exception as e:
            logger.error(f"Error enqueuing email task for {notify.email}: {e}")
            results += f"Email Enqueue Error for {notify.email}: {e}\n"

    if results.endswith('\n'):
        results = results[:-1]

    try:
        aid_request.logs.create(
            log_entry=f'{results}'
        )
    except Exception as e:
        logger.error(f"Error logging notification results: {e}")

    return results


# def aidrequest_takcot(aidrequest_id=None, aidrequest_list=None, message_type='update'):
#     """Send COT messages for aid requests.

#     Args:
#         aidrequest_id (int, optional): Single aid request ID
#         aidrequest_list (list, optional): List of aid request IDs
#         message_type (str): Type of message ('update' by default)

#     Returns:
#         str: Status message indicating success or failure
#     """
#     ic(message_type)
#     if not aidrequest_list and aidrequest_id:
#         aidrequest_list = [aidrequest_id]
#     if aidrequest_list:
#         aidrequest_first = AidRequest.objects.get(pk=aidrequest_list[0])
#         field_op = aidrequest_first.field_op

#         # Skip if COT is disabled for this field operation
#         if field_op.disable_cot:
#             ic(f"COT disabled for field op: {field_op.slug}")
#             return 'COT disabled for field operation'

#         try:
#             # Run the async task in a new event loop
#             result = asyncio.run(send_cot_task(
#                 field_op_slug=field_op.slug,
#                 mark_type='aid',
#                 aidrequests=aidrequest_list
#             ))
#             return result
#         except Exception as e:
#             ic(e)
#             return str(e)
#     else:
#         return 'No AidRequest List'


def send_email(message):
    try:
        POLLER_WAIT_TIME = 5
        client = EmailClient.from_connection_string(email_connectstring())
        poller = client.begin_send(message)
        time_elapsed = 0

        while not poller.done():
            poller.wait(POLLER_WAIT_TIME)
            time_elapsed += POLLER_WAIT_TIME
            if time_elapsed > 5 * POLLER_WAIT_TIME:
                raise RuntimeError("Polling timed out.")

        if poller.result()["status"] == "Succeeded":
            # ic(f"Successfully sent the email (operation id: {poller.result()['id']})")
            result = poller.result()

    except Exception as e:
        logger.error(f"Error sending email: {e}")
        return e

    return result


def send_all_field_op_cot():
    """Send COT messages for all active field ops that have COT enabled.

    This is the function called by the hourly scheduler to send both
    field operation markers and aid request markers with a stale time
    of +1 day (86400 seconds).
    """
    try:
        # Get all field ops with TAK servers and COT enabled
        field_ops = FieldOp.objects.filter(tak_server__isnull=False, disable_cot=False)
        logger.info(f"Found {field_ops.count()} field ops with TAK servers and COT enabled")

        if field_ops.count() == 0:
            # If no field ops found, check what we have in the system
            all_field_ops = FieldOp.objects.all()
            logger.info(f"Total field ops in system: {all_field_ops.count()}")
            for fo in all_field_ops:
                logger.info(f"Field op {fo.slug} - TAK server: {fo.tak_server}, COT enabled: {not fo.disable_cot}")
            return "No COT messages were sent - no eligible field ops found"

        results = []
        for field_op in field_ops:
            try:
                logger.info(f"Sending hourly COT update for field op: {field_op.slug}")
                # Use the enhanced send_cot_task which handles both field and aid marks appropriately
                task_result = send_cot_task(
                    field_op_slug=field_op.slug,
                    mark_type='aid'  # This will send both field mark and all aid marks
                )
                results.append(task_result)
            except Exception as e:
                error_msg = f"Error sending COT for {field_op.slug}: {str(e)}"
                logger.error(error_msg)
                results.append(error_msg)
                # Add a flag to indicate an error occurred to fail the main task
                # This part will be handled by the logic below, by checking if any result contains "Error"

        if not results:
            return "No COT messages were sent - no eligible field ops found"

        # Log the completion
        final_report = "\n".join(results)
        any_errors_encountered = any("Error sending" in result or "Failed COT for" in result or "Error in send_cot_task" in result for result in results)

        if any_errors_encountered:
            logger.error(f"send_all_field_op_cot completed with one or more errors. Report:\n{final_report}")
            raise RuntimeError(f"send_all_field_op_cot completed with one or more errors. Report:\n{final_report}")
        else:
            logger.info(f"Hourly COT update completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            return final_report
    except Exception as e:
        logger.error(f"Main error in send_all_field_op_cot: {str(e)}")
        # Ensure this top-level exception also makes the task fail in Django Q
        raise RuntimeError(f"Critical error in send_all_field_op_cot: {str(e)}") from e


# def send_fieldop_cot_task(field_op_slug, message_type='update'):
#     """Send COT message for a single field op marker."""
#     try:
#         # Run the async task in a new event loop
#         result = asyncio.run(send_cot_task(
#             field_op_slug=field_op_slug,
#             mark_type='field'
#         ))
#         success_msg = f"Successfully sent {mark_type} mark for field op {field_op_slug}"
#         ic(success_msg)
#         return success_msg
#     except Exception as e:
#         error_msg = f"Error sending COT for field op {field_op_slug}: {str(e)}"
#         ic(error_msg)
#         return error_msg


def send_cot_task(field_op_slug, mark_type='field', aidrequest=None, aidrequests=None, **kwargs):
    """Django-Q2 task for sending COT messages for field ops and/or aid requests.

    This function is a synchronous interface for Django-Q2.
    All messages for a single task are sent through one pytak connection.

    Args:
        field_op_slug (str): The slug identifier for the field operation
        mark_type (str): Either 'field' for field op marker only or 'aid' for aid requests
        aidrequest (int): Single aid request ID when mark_type is 'aid'
        aidrequests (list): List of aid request IDs when mark_type is 'aid'

    If mark_type='aid' and neither aidrequest nor aidrequests is provided,
    all active aid requests for the field op will be sent.

    Returns:
        str: Status message indicating success or failure with mark counts
    """
    try:
        logger.info(f"send_cot_task called with kwargs: {kwargs}")
        # Get the field op
        from .models import FieldOp, AidRequest # Keep this import for model access
        try:
            field_op = FieldOp.objects.get(slug=field_op_slug)
        except FieldOp.DoesNotExist:
            error_msg = f"Field op not found: {field_op_slug}"
            logger.error(error_msg)
            return error_msg

        # Common validations first
        if field_op.disable_cot:
            logger.info(f"COT disabled for field op: {field_op.slug}")
            return 'COT disabled for field operation'

        if not field_op.tak_server:
            logger.info(f"No TAK server configured for field op: {field_op.slug}")
            return 'No TAK server configured for field operation'

        # Validate mark_type for CotMaker instruction
        if mark_type not in ['field', 'aid']:
            error_msg = f"Invalid mark_type: {mark_type}. Must be 'field' or 'aid'"
            logger.error(error_msg)
            return error_msg

        # Determine aid_request_ids and if the field_op_marker should be included
        final_aid_request_ids = None
        include_the_field_op_marker = False
        cot_maker_mark_type = 'field' # Default mark_type for CotMaker

        if mark_type == 'field':
            # Only send field op marker
            include_the_field_op_marker = True
            final_aid_request_ids = None
            cot_maker_mark_type = 'field'
            logger.info(f"Preparing to send FieldOp marker for {field_op_slug}")

        elif mark_type == 'aid':
            cot_maker_mark_type = 'aid' # Instruct CotMaker to process aid requests
            if aidrequest is not None: # Single aid request
                final_aid_request_ids = [aidrequest]
                # By default, sending a single aid request often implies its context (FieldOp) is known
                # or will be sent separately if it's a standalone update.
                # For this refactor, let's assume sending a single aid request implies also sending the field_op marker
                # unless explicitly designed otherwise in future tasks.
                include_the_field_op_marker = True
                logger.info(f"Preparing to send FieldOp marker and AidRequest ID {aidrequest} for {field_op_slug}")
            elif aidrequests is not None: # List of aid requests
                final_aid_request_ids = aidrequests if isinstance(aidrequests, list) else [aidrequests]
                include_the_field_op_marker = True # Always send field op with a list of aid requests
                logger.info(f"Preparing to send FieldOp marker and {len(final_aid_request_ids)} AidRequests for {field_op_slug}")
            else: # All active aid requests for the field op
                active_requests = AidRequest.objects.filter(
                    field_op=field_op,
                    status__in=['new', 'assigned', 'resolved']
                ).values_list('id', flat=True)

                if active_requests:
                    final_aid_request_ids = list(active_requests)
                    include_the_field_op_marker = True # Send field op with all its active aid requests
                    logger.info(f"Preparing to send FieldOp marker and {len(final_aid_request_ids)} active AidRequests for {field_op_slug}")
                else:
                    # No active aid requests, but task was called with mark_type='aid'
                    # This implies we should at least send the field_op marker if specified implicitly by calling context
                    # (e.g. hourly task for a field op)
                    include_the_field_op_marker = True
                    final_aid_request_ids = [] # Ensure it's an empty list, not None
                    logger.info(f"No active AidRequests for {field_op_slug}, preparing to send FieldOp marker.")

        # If we are not sending any aid requests, but also not explicitly sending the field op marker,
        # there's nothing to send. This can happen if mark_type='aid' but no aid requests are found/specified
        # and include_the_field_op_marker ended up false.
        if not include_the_field_op_marker and not final_aid_request_ids:
            logger.info(f"No markers to send for {field_op_slug} with current parameters.")
            return "No markers to send."

        # Log TAK server configuration (moved here as it's relevant if we proceed)
        logger.info("TAK Server Config for call:", {
            'server': field_op.tak_server.dns_name,
            'disable_cot': field_op.disable_cot,
            'field_op_slug': field_op_slug,
            'cot_maker_mark_type': cot_maker_mark_type,
            'include_field_op_marker_param': include_the_field_op_marker,
            'num_aid_requests': len(final_aid_request_ids) if final_aid_request_ids else 0
        })

        # Single call to pytak_send_cot
        result = pytak_send_cot(
            field_op_slug=field_op_slug,
            mark_type=cot_maker_mark_type, # This tells CotMaker what to look for in aid_request_ids
            aid_request_ids=final_aid_request_ids,
            include_field_op_marker=include_the_field_op_marker
        )

        if isinstance(result, Exception):
            error_msg = f"Error during pytak_send_cot for {field_op_slug}: {str(result)}"
            logger.error(error_msg)
            raise result # Re-raise the actual exception
        else:
            # Construct a more informative success message based on what was intended.
            # The actual count of messages sent is handled by CotSender/pytak internals.
            sent_parts = []
            if include_the_field_op_marker:
                sent_parts.append("FieldOp marker")
            if final_aid_request_ids:
                sent_parts.append(f"{len(final_aid_request_ids)} AidRequest(s)")

            if not sent_parts: # Should not happen if we passed the earlier check
                success_msg = f"CoT task completed for {field_op_slug}, but no specific markers were designated for sending in this call."
            else:
                success_msg = f"CoT task for {field_op_slug} initiated to send: {', '.join(sent_parts)}."

            logger.info(success_msg)
            return success_msg # Return the more generic success message from pytak_send_cot or this constructed one

    except Exception as e:
        error_msg = f"Error in send_cot_task for {field_op_slug}: {str(e)}"
        logger.exception(error_msg) # Use logger.exception to include stack trace
        raise # Re-raise the caught exception to ensure Django Q2 sees it as a failure
        # return error_msg # Old: return error string
