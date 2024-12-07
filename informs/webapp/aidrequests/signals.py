from django.db.models.signals import post_save
from django.dispatch import receiver

from azure.communication.email import EmailClient

from .models import AidRequest
from .email_creator import email_connectstring, email_creator_html
from .views.getAzureGeocode import getAddressGeocode
from .views.maps import staticmap_aid, calculate_zoom

from icecream import ic
from datetime import datetime


@receiver(post_save, sender=AidRequest)
def send_aid_request_email(sender, instance, created, **kwargs):
    aid_request = instance
    # note Geocoded results are made available to the notifications
    # but are not saved as an Aid Location here.
    if not created:
        return

    geocode_results = getAddressGeocode(instance)

    zoom = calculate_zoom(geocode_results['distance'])

    staticmap_data = staticmap_aid(
        width=600, height=600, zoom=zoom,
        fieldop_lat=aid_request.field_op.latitude,
        fieldop_lon=aid_request.field_op.longitude,
        aid1_lat=geocode_results['latitude'],
        aid1_lon=geocode_results['longitude'],
        )
    if staticmap_data:
        timestamp = datetime.now().strftime("%y%m%d%H%M%S")
        map_file = f"media/maps/AR{aid_request.pk}-map_{timestamp}.png"
        with open(map_file, 'wb') as file:
            file.write(staticmap_data)

        notify_emails = instance.field_op.notify.filter(type__startswith='email')
        for notify in notify_emails:
            message = email_creator_html(instance, geocode_results, notify, map_file)
            results = ""
            try:
                connect_string = email_connectstring()
                client = EmailClient.from_connection_string(connect_string)
                poller = client.begin_send(message)
                result = poller.result()
                results += f"Email {notify.name}: Status: {result['status']}, {result['error']}"

            except Exception as e:
                ic(f"Error sending email: {e}")

        try:
            instance.logs.create(
                log_entry=f'{results}\n'
            )
        except Exception as e:
            ic(f"Log Error: {e}")
