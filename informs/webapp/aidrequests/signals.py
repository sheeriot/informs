from django.db.models.signals import post_save
from django.dispatch import receiver

from azure.communication.email import EmailClient

from .models import AidRequest
from .email_creator import email_connectstring, email_creator_html
from .views.getAzureGeocode import getAddressGeocode

from icecream import ic


@receiver(post_save, sender=AidRequest)
def send_aid_request_email(sender, instance, created, **kwargs):

    # note Geocoded results are made available to the notifications
    # but are not saved as an Aid Location here.
    geocode_results = getAddressGeocode(instance)

    if created:
        notify_email = instance.field_op.notify.filter(type__startswith='email')
        for notify in notify_email:
            ic('creating email')
            message = email_creator_html(instance, geocode_results, notify)
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
