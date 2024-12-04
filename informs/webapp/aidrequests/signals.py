# signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from azure.communication.email import EmailClient

from .models import AidRequest
from icecream import ic


@receiver(post_save, sender=AidRequest)
def send_aid_request_email(sender, instance, created, **kwargs):
    if created:
        # ic('handle email on Created Aid Request')
        notify_email = instance.field_op.notify.filter(type__startswith='email')
        for notify in notify_email:
            # ic(f'Notify: {notify}')
            message = email_creator(instance, notify)
            ic(message)
            # ic(message)
            try:
                connect_string = email_connect_string()
                ic(connect_string)
                client = EmailClient.from_connection_string(connect_string)
                poller = client.begin_send(message)
                result = poller.result()
                ic(f'Email Result: {result}')

            except Exception as e:
                ic(f"Error sending email: {e}")


def email_creator(instance, notify):
    subject = (
        f"New Aid Request #{instance.pk} Created: "
        f"{instance.requestor_first_name} {instance.requestor_last_name}"
    )
    message_body = (
        f"A new aid request has been created with the following details:\n\n"
        f"Requestor: {instance.requestor_first_name} {instance.requestor_last_name}\n"
        f"Email: {instance.requestor_email}\n"
        f"Phone: {instance.requestor_phone}\n"
        f"Assistance Type: {instance.assistance_type}\n"
        f"Description: {instance.assistance_description}\n"
        f"Location:\n"
        f"{instance.street_address}\n"
        f"{instance.city}, {instance.state}, {instance.zip_code}, {instance.country}\n"
    )
    message = {
        "senderAddress": settings.MAIL_FROM,
        "recipients": {
            "to": [{"address": notify.email}]
        },
        'content': {
            "subject": subject,
            "plainText": message_body
        }
    }
    return message


def email_connect_string():
    connect_string = f"endpoint=https://{settings.MAIL_ENDPOINT}/;accesskey={settings.MAIL_FROM_KEY}"
    # ic(connect_string)
    return connect_string
