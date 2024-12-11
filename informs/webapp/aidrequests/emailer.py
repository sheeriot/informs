# from django.db.models.signals import post_save
# from django.dispatch import receiver

from azure.communication.email import EmailClient

# import asyncio
# from time import perf_counter as timer

# from .models import AidRequest
from .email_creator import email_connectstring, email_creator_html
# from .views.getAzureGeocode import getAddressGeocode
from .azure_geocode import get_azure_geocode
from .views.maps import staticmap_aid, calculate_zoom

from icecream import ic
from datetime import datetime


# @receiver(post_save, sender=AidRequest)
# def aid_request_new_email(sender, instance, created, **kwargs):

def aid_request_new_email(aid_request, **kwargs):
    # email_start = timer()
    geocode_results = get_azure_geocode(aid_request)
    zoom = calculate_zoom(geocode_results['distance'])

    # another background task? await?
    staticmap_data = staticmap_aid(
        width=600, height=600, zoom=zoom,
        fieldop_lat=aid_request.field_op.latitude,
        fieldop_lon=aid_request.field_op.longitude,
        aid1_lat=geocode_results['latitude'],
        aid1_lon=geocode_results['longitude'],
        )

    # save the map for viewing on email. Embedded gets blocked by Gmail.
    if staticmap_data:
        timestamp = datetime.now().strftime("%y%m%d%H%M%S")
        # should cache or stash this somewhere. For now it is the file system.
        map_file = f"media/maps/AR{aid_request.pk}-map_{timestamp}.png"
        with open(map_file, 'wb') as file:
            file.write(staticmap_data)

    notify_emails = aid_request.field_op.notify.filter(type__startswith='email')
    results = ""
    # ic(f'email_begins @ {round((timer() - email_start), 5)}s')
    for notify in notify_emails:
        message = email_creator_html(aid_request, geocode_results, notify, map_file)
        try:
            result = send_email(message)
            # ic(f'Email Result: {result}')
            results += f"Email: {notify.name}: Status: {result['status']}, ID: {result['id']}, Error: {result['error']}\n"
        except Exception as e:
            ic(f"Error sending email: {e}")
            results += f"Email Error: {e}\n"

    if results.endswith('\n'):
        results = results[:-1]
    try:
        ic(results)
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
