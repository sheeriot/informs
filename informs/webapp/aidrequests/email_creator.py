from django.conf import settings
from django.urls import reverse
from django.contrib.sites.models import Site

# from icecream import ic


def email_connectstring():
    connect_string = f"endpoint=https://{settings.MAIL_ENDPOINT}/;accesskey={settings.MAIL_FROM_KEY}"
    return connect_string


def email_creator_html(aid_request, aid_location, notify, map_file):
    domain = Site.objects.get_current().domain
    protocol = 'https'
    field_op = aid_request.field_op

    subject = (
        f"SOA:{aid_request.field_op.slug}:"
        f"New Aid Request #{aid_request.pk}:"
        f"{aid_request.aid_type}:"
        f"{aid_request.requestor_first_name} {aid_request.requestor_last_name}"
    )

    html = f"""
    <h2>{field_op}: Aid Request #{aid_request.pk} - {aid_request.status}</h2>
    Informs:
    <a href="{protocol}://{domain}{reverse(
        'aid_request_detail',
        kwargs={
            'pk': aid_request.pk,
            'field_op': field_op.slug
        }
    )}">
        Aid Request {aid_request.pk}
    </a>

    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: auto; text-align: left">
        <caption style="text-align: left;"><strong>Aid Summary</strong></caption>
        <tr>
            <th style="font-weight: normal;">ID</th>
            <th style="font-weight: normal;">Aid Type</th>
            <th style="font-weight: normal;">Group Size</th>
            <th style="font-weight: normal;">Status</th>
            <th style="font-weight: normal;">Priority</th>
        </tr>
        <tr>
            <td style="font-weight: bold;">
                <a href="{protocol}://{domain}{reverse('aid_request_detail',
                                                       kwargs={
                                                            'pk': aid_request.pk,
                                                            'field_op': field_op.slug
                                                        }
                                                       )}">
                    {aid_request.pk}
                </a>
            </td>
            <td style="font-weight: bold;">{aid_request.aid_type}</td>
            <td style="font-weight: bold;">{aid_request.group_size}</td>
            <td style="font-weight: bold;">{aid_request.status}</td>
            <td style="font-weight: bold;">{aid_request.priority}</td>
        </tr>
        <tr><th colspan="5" style="font-weight: normal;">Address Provided</th></tr>
        <tr>
            <td colspan="5" style="font-weight: bold;">
                {aid_request.street_address}
                {aid_request.city}
                {aid_request.state}
                {aid_request.zip_code}
                {aid_request.country}
            </td>
        </tr>
        <tr>
            <th colspan="5" style="font-weight: normal;">Description</th>
        </tr>
        <tr>
            <td colspan="5" style="font-weight: bold;">{aid_request.aid_description}</td>
        </tr>
    </table>
    <br>
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: auto;">
        <caption style="text-align: left;"><strong>Contact Information</strong></caption>
        <tr>
            <th style="font-weight: normal;">Requestor Name</th>
            <th style="font-weight: normal;">Requestor Phone</th>
            <th style="font-weight: normal;">Requestor Email</th>
        </tr>
        <tr>
            <td style="font-weight: bold;">{aid_request.requestor_first_name} {aid_request.requestor_last_name}</td>
            <td style="font-weight: bold;">{aid_request.requestor_phone}</td>
            <td style="font-weight: bold;">{aid_request.requestor_email}</td>
        </tr>
        <tr>
            <th style="font-weight: normal;">Contact Name</th>
            <th style="font-weight: normal;">Contact Phone</th>
            <th style="font-weight: normal;">Contact Email</th>
        </tr>
        <tr>
            <td style="font-weight: bold;">{aid_request.aid_first_name} {aid_request.aid_last_name}</td>
            <td style="font-weight: bold;">{aid_request.aid_phone}</td>
            <td style="font-weight: bold;">{aid_request.aid_email}</td>
        </tr>
        <tr>
            <td colspan="3"><div style="font-weight: normal;">Methods:</div>
            {', '.join(aid_request.contact_methods)}
            </td>
        </tr>
    </table>
    """

    map_url = f"{protocol}://{domain}/{map_file}"
    location_html = f"""
        <hr>
        <div style="text-align: left;">
            <table border="1" cellpadding="5" cellspacing="0"
                   style="border-collapse: collapse; width: auto;">
                <caption>{field_op.name} Center: {field_op.latitude},{field_op.longitude}
                </caption>
                <tr>
                    <th>Location Info</th>
                    <th>Location Map</th>
                </tr>
                <tr>
                    <td style="vertical-align:text-top; text-align: left;">
                        Address Searched:<br>
                        <strong>{aid_location.address_searched}</strong>
                        <hr class="my-1 py-0">
                        Address Found:<br>
                        <strong>{aid_location.address_found}</strong>
                        <hr class="my-1 py-0">
                        Aid Location ID {aid_location.pk}<br>
                        <strong>{aid_location.latitude},{aid_location.longitude}</strong><br>
                        Distance: <strong>{aid_location.distance} km</strong><br>
                        Status: <strong>{aid_location.status}</strong><br>
                        Source: {aid_location.source}
                        <hr class="my-1 py-0">
                        Location Notes:
                        <pre>{aid_location.note}</pre>
                    </td>
                    <td class="col-auto">
                        <div>
                            <div id="map-image">
                                <img src="{map_url}" alt="Aid Location - Preview Map">
                            </div>
                        </div>
                    </td>
                </tr>
            </table>
        </div>
    """
    html += location_html

    additional_info_html = "-------- Additional Info ---------\n"
    if aid_request.medical_needs:
        additional_info_html += f"\nMedical Needs:\n{aid_request.medical_needs}\n"
    if aid_request.supplies_needed:
        additional_info_html += f"\nSupplies Info:\n{aid_request.supplies_needed}\n"
    if aid_request.welfare_check_info:
        additional_info_html += f"\nWelfare Check Info:\n{aid_request.welfare_check_info}\n"
    if aid_request.additional_info:
        additional_info_html += f"\nAdditional Info:\n{aid_request.additional_info}\n"

    html += f"<pre>{additional_info_html}</pre>"

    message = {
        "senderAddress": settings.MAIL_FROM,
        "recipients": {
            "to": [{"address": notify.email}]
        },
        'content': {
            "subject": subject,
            "html": html
        },
    }
    return message
