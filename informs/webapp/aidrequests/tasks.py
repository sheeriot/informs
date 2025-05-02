from django.conf import settings

from azure.communication.email import EmailClient
from datetime import datetime
# import json
# from django.http import JsonResponse

from .email_creator import email_connectstring, email_creator_html
from .geocoder import get_azure_geocode, geocode_save
from .views.maps import staticmap_aid, calculate_zoom
from .models import FieldOpNotify, AidRequest, FieldOp
from takserver.cot import send_cots, send_fieldop_cot

# import asyncio

from icecream import ic

from django.core.management import call_command


def aid_request_postsave(aid_request, **kwargs):
    # ic(kwargs)
    savetype = kwargs['savetype']
    if savetype == 'new':
        geocode_results = get_azure_geocode(aid_request)
        aid_location = geocode_save(aid_request, geocode_results)
        zoom = calculate_zoom(aid_location.distance)
        # ic(zoom)

        staticmap_data = staticmap_aid(
            width=600, height=600, zoom=zoom,
            fieldop_lat=aid_request.field_op.latitude,
            fieldop_lon=aid_request.field_op.longitude,
            aid1_lat=aid_location.latitude,
            aid1_lon=aid_location.longitude,
        )

        if staticmap_data:
            timestamp = datetime.now().strftime("%y%m%d%H%M%S")
            map_filename = f"AR{aid_request.pk}-map_{timestamp}.png"
            map_file = f"{settings.MAPS_PATH}/{map_filename}"
            with open(map_file, 'wb') as file:
                file.write(staticmap_data)

                if file:
                    try:
                        aid_location.map_filename = map_filename
                        aid_location.save()
                    except Exception as e:
                        ic(e)

    if savetype == 'new':
        notify_emails = aid_request.field_op.notify.filter(type__startswith='email')
        email_results = ""
        for notify in notify_emails:
            message = email_creator_html(aid_request, aid_location, notify, map_file)
            try:
                result = send_email(message)
                email_results += f"Email: {notify.name}: Status: {result['status']}"
                email_results += f", ID: {result['id']}, Error: {result['error']}\n"
            except Exception as e:
                ic(f"Error sending email: {e}")
                email_results += f"Email Error: {e}\n"
        if email_results.endswith('\n'):
            email_results = email_results[:-1]
        try:
            aid_request.logs.create(
                log_entry=f'{email_results}'
            )
        except Exception as e:
            ic(f"Log Error: {e}")

    return email_results


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
                result = send_email(message)
                results += f"Email: {notify.email}: Status: {result['status']}"
                results += f", ID: {result['id']}, Error: {result['error']}\n |"
            except Exception as e:
                ic(f"Error sending email: {e}")
                results += f"Email Error: {e}\n"

    notifies = kwargs['kwargs']['notifies']
    notify_emails = notifies.filter(type__startswith='email')
    for notify in notify_emails:
        message = email_creator_html(aid_request, aid_location, notify, map_file)
        try:
            result = send_email(message)
            results += f"Email: {notify.email}: Status: {result['status']}"
            results += f", ID: {result['id']}, Error: {result['error']}\n"
        except Exception as e:
            ic(f"Error sending email: {e}")
            results += f"Email Error: {e}\n"

    if results.endswith('\n'):
        results = results[:-1]

    try:
        aid_request.logs.create(
            log_entry=f'{results}'
        )
    except Exception as e:
        ic(f"Log Error: {e}")

    return results


def aidrequest_takcot(aidrequest_id=None, aidrequest_list=None, message_type='update'):
    ic(message_type)
    if not aidrequest_list and aidrequest_id:
        aidrequest_list = [aidrequest_id]
    if aidrequest_list:
        aidrequest_first = AidRequest.objects.get(pk=aidrequest_list[0])
        field_op = aidrequest_first.field_op

        # Skip if COT is disabled for this field operation
        if field_op.disable_cot:
            ic(f"COT disabled for field op: {field_op.slug}")
            return 'COT disabled for field operation'

        try:
            results = send_cots(fieldop_id=field_op.pk, aidrequest_list=aidrequest_list, message_type=message_type)
        except Exception as e:
            ic(e)
            return e
    else:
        return 'No AidRequest List'

    return results


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
        ic(f"Error sending email: {e}")
        return e

    return result


def send_all_field_op_cot():
    """Send COT messages for all active field ops that have COT enabled."""
    try:
        # Get all field ops with TAK servers and COT enabled
        field_ops = FieldOp.objects.filter(tak_server__isnull=False, disable_cot=False)
        ic(f"Found {field_ops.count()} field ops with TAK servers and COT enabled")

        if field_ops.count() == 0:
            # If no field ops found, check what we have in the system
            all_field_ops = FieldOp.objects.all()
            ic(f"Total field ops in system: {all_field_ops.count()}")
            for fo in all_field_ops:
                ic(f"Field op {fo.slug} - TAK server: {fo.tak_server}, COT enabled: {not fo.disable_cot}")

        results = []
        for field_op in field_ops:
            try:
                ic(f"Sending COT for field op: {field_op.slug}")
                call_command('send_cot', field_op=field_op.slug)
                results.append(f"Successfully sent COT for {field_op.slug}")
            except Exception as e:
                ic(f"Error for {field_op.slug}: {str(e)}")
                results.append(f"Error sending COT for {field_op.slug}: {str(e)}")

        if not results:
            return "No COT messages were sent - no eligible field ops found"
        return "\n".join(results)
    except Exception as e:
        ic(f"Main error: {str(e)}")
        return f"Error in send_all_field_op_cot: {str(e)}"


def send_fieldop_cot_task(field_op_slug, message_type='update'):
    """Send COT message for a single field op marker."""
    try:
        field_op = FieldOp.objects.get(slug=field_op_slug)

        # Skip if COT is disabled for this field operation
        if field_op.disable_cot:
            ic(f"COT disabled for field op: {field_op.slug}")
            return 'COT disabled for field operation'

        # Skip if no TAK server configured
        if not field_op.tak_server:
            ic(f"No TAK server configured for field op: {field_op.slug}")
            return 'No TAK server configured for field operation'

        try:
            result = send_fieldop_cot(field_op.pk, message_type=message_type)
            success_msg = f"Successfully sent {message_type} COT for field op {field_op.slug}"
            ic(success_msg)
            return success_msg
        except Exception as e:
            error_msg = f"Error sending COT for field op {field_op.slug}: {str(e)}"
            ic(error_msg)
            return error_msg

    except FieldOp.DoesNotExist:
        error_msg = f"Field op not found: {field_op_slug}"
        ic(error_msg)
        return error_msg
    except Exception as e:
        error_msg = f"Error in send_fieldop_cot_task: {str(e)}"
        ic(error_msg)
        return error_msg
