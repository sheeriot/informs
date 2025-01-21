from django.conf import settings

from azure.communication.email import EmailClient

from .email_creator import email_connectstring, email_creator_html
from .geocoder import get_azure_geocode, geocode_save
from .views.maps import staticmap_aid, calculate_zoom

from datetime import datetime

from icecream import ic


def aid_request_postsave(aid_request, **kwargs):
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

    notify_emails = aid_request.field_op.notify.filter(type__startswith='email')

    results = ""

    for notify in notify_emails:
        message = email_creator_html(aid_request, aid_location, notify, map_file)
        try:
            result = send_email(message)
            results += f"Email: {notify.name}: Status: {result['status']}"
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


def aid_location_postsave(aid_location, **kwargs):
    aid_request = aid_location.aid_request

    zoom = calculate_zoom(aid_location.distance)

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

        # write the file to disk
        try:
            with open(map_file, 'wb') as file:
                file.write(staticmap_data)
        except Exception as e:
            ic(e)

        # save the filename to the aid location record
        try:
            aid_location.map_filename = map_filename
            aid_location.save()
        except Exception as e:
            ic(e)

    # notify_emails = aid_request.field_op.notify.filter(type__startswith='email')

    results = "New manual location"

    try:
        aid_request.logs.create(
            log_entry=f'{results}'
        )
    except Exception as e:
        ic(f"Log Error: {e}")

    return results


def send_email(message):
    try:
        POLLER_WAIT_TIME = 5
        client = EmailClient.from_connection_string(email_connectstring())
        poller = client.begin_send(message)
        time_elapsed = 0

        while not poller.done():
            # ic("Email send poller status: " + poller.status())

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
