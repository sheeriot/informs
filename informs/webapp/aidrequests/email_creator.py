from django.conf import settings
from django.urls import reverse
from django.contrib.sites.models import Site

# from icecream import ic


def email_connectstring():
    connect_string = f"endpoint=https://{settings.MAIL_ENDPOINT}/;accesskey={settings.MAIL_FROM_KEY}"
    return connect_string


def email_creator_plain(aid_request, geocode_results, notify, map_file):
    subject = (
        f"SOA:{aid_request.field_op.slug}:"
        f"New Aid Request #{aid_request.pk}:"
        f"{aid_request.assistance_type}:"
        f"{aid_request.requestor_first_name} {aid_request.requestor_last_name}"
    )
    message_body = (
        f"SOA Notification - {aid_request.field_op.name}\n"
        "------------------------------------------\n"
        f"A new aid request has been created with the following details:\n\n"
        f"Assistance Type: {aid_request.assistance_type}, Group Size: {aid_request.group_size}\n"
        f"Requestor: {aid_request.requestor_first_name} {aid_request.requestor_last_name}\n"
        f"Email: {aid_request.requestor_email}\n"
        f"Phone: {aid_request.requestor_phone}\n"
    )
    if aid_request.contact_methods:
        message_body += f"Preferred Contact Methods: {', '.join(aid_request.contact_methods)}\n"
    if aid_request.assistance_first_name or aid_request.assistance_last_name:
        message_body += "Assistance Contact Provided\n"
        message_body += f"Assistance Contact: {aid_request.assistance_first_name} {aid_request.assistance_last_name}\n"
    if aid_request.assistance_phone:
        message_body += f"Assistance Phone: {aid_request.assistance_phone}\n"
    if aid_request.assistance_email:
        message_body += f"Assistance Email: {aid_request.assistance_email}\n"

    message_body += (
        f"Description: {aid_request.assistance_description}\n"
        f"\nLocation:\n"
        f"{aid_request.street_address}\n"
        f"{aid_request.city}, {aid_request.state}, {aid_request.zip_code}, {aid_request.country}\n"
    )

    message_body += "-------- Additional Info ---------\n"
    if aid_request.medical_needs:
        message_body += f"Medical Needs: {aid_request.medical_needs}\n"
    if aid_request.supplies_needed:
        message_body += f"Supplies Info: {aid_request.supplies_needed}\n"
    if aid_request.welfare_check_info:
        message_body += f"Welfare Check Info: {aid_request.welfare_check_info}\n"
    if aid_request.additional_info:
        message_body += f"Additional Info: {aid_request.additional_info}\n"

    message_body += "-------- Geocoded Location ---------\n"

    if geocode_results['status'] == "Success":
        note = geocode_results('note')
        message_body += (
            f"Latitude: {geocode_results['latitude']}\n"
            f"Longitude: {geocode_results['longitude']}\n"
            f"Distance: {geocode_results['distance']} km\n"
            f"Note: {note}\n"
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


def email_creator_html(aid_request, geocode_results, notify, map_file):
    domain = Site.objects.get_current().domain
    protocol = 'https'

    subject = (
        f"SOA:{aid_request.field_op.slug}:"
        f"New Aid Request #{aid_request.pk}:"
        f"{aid_request.assistance_type}:"
        f"{aid_request.requestor_first_name} {aid_request.requestor_last_name}"
    )

    html = f"""
    <h2>{aid_request.field_op}: New Aid Request #{aid_request.pk}</h2>
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: auto;">
        <caption style="text-align: left;"><strong>Aid Summary</strong></caption>
        <tr>
            <th style="font-weight: normal;">ID</th>
            <th style="font-weight: normal;">Field Op</th>
            <th style="font-weight: normal;">Aid Type</th>
            <th style="font-weight: normal;">Group Size</th>
        </tr>
        <tr>
            <td style="font-weight: bold;">
                <a href="{protocol}://{domain}{reverse('aid_request_detail',
                                                       kwargs={
                                                            'pk': aid_request.pk,
                                                            'field_op': aid_request.field_op.slug
                                                        }
                                                       )}">
                    {aid_request.pk}
                </a>
            </td>
            <td style="font-weight: bold;">{aid_request.field_op.name}</td>
            <td style="font-weight: bold;">{aid_request.assistance_type}</td>
            <td style="font-weight: bold;">{aid_request.group_size}</td>
        </tr>
        <tr>
            <th colspan="4" style="font-weight: normal;">Description</th>
        </tr>
        <tr>
            <td colspan="4" style="font-weight: bold;">{aid_request.assistance_description}</td>
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
            <td style="font-weight: bold;">{aid_request.assistance_first_name} {aid_request.assistance_last_name}</td>
            <td style="font-weight: bold;">{aid_request.assistance_phone}</td>
            <td style="font-weight: bold;">{aid_request.assistance_email}</td>
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
        <div>
            Field Operation ({aid_request.field_op.slug}) Center:
            <strong>
                {aid_request.field_op.latitude},{aid_request.field_op.longitude}
            </strong>
        </div>
        <div>
            <table border="1" cellpadding="5" cellspacing="0"
                   style="border-collapse: collapse; width: auto;">
                <tr>
                    <th>Aid Location</th>
                    <th>Map</th>
                </tr>
                <tr>
                    <td style="vertical-align:text-top">
                        <div>Provided Address:</div>
                        <div style="font-weight: bold; margin-left: 10px;">
                            <div>{aid_request.street_address}</div>
                            <div>
                                {aid_request.city}, {aid_request.state} {aid_request.zip_code} {aid_request.country}
                            </div>
                        </div>
                        <hr class="my-1 py-0">
                        Geocoded:
                        <div style="font-weight: bold; margin-left: 10px;">
                            <div>{geocode_results['latitude']},{geocode_results['longitude']}</div>
                            <div>
                                <pre style="font-weight: normal;">{geocode_results['note']}</pre>
                            </div>
                        </div>
                    </td>
                    <td class="col-auto">
                        <div>
                            <div id="map-image">
                                <img src="{map_url}" alt="Aid Request - Preview Map">
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
