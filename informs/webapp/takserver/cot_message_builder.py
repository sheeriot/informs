"""
Module for building COT (Cursor on Target) messages.
Separates message creation logic from transport logic.
"""
from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import aidrequest_location, make_cot
from icecream import ic


async def build_field_op_cot(field_op_id, mark_type):
    """Build a COT message for a field operation marker.

    Args:
        field_op_id: ID of the field operation
        mark_type: Type of mark ('field' or 'aid')

    Returns:
        dict: COT message data
    """
    try:
        field_op = await FieldOp.objects.select_related('tak_server').aget(pk=field_op_id)

        data = make_cot(
            mark_type=mark_type,
            cot_icon='blob_dot_yellow',
            name=f'{field_op.slug.upper()}',
            uuid=f'FieldOp.{field_op.slug.upper()}',
            lat=field_op.latitude,
            lon=field_op.longitude,
            remarks=f'Field Op:\n{field_op.name}',
        )
        ic(f"Created field mark for {field_op.name} ({field_op.slug})")
        return data

    except Exception as e:
        ic('Failed to build field op COT:', e)
        raise RuntimeError(f"Could not build field op COT: {e}")


async def build_aid_request_cot(aid_request_id, field_op_slug, mark_type):
    """Build a COT message for an aid request.

    Args:
        aid_request_id: ID of the aid request
        field_op_slug: Slug of the parent field operation
        mark_type: Type of mark ('aid')

    Returns:
        dict: COT message data or None if no location available
    """
    try:
        # Get aid request and locations
        aid_request = await AidRequest.objects.select_related('aid_type', 'field_op').aget(pk=aid_request_id)
        aid_locations = [
            location async for location in AidLocation.objects.filter(aid_request=aid_request_id).all()
        ]

        # Get location status and best location
        location_status, location = aidrequest_location(aid_locations)
        if not location:
            ic(f"No location available for Aid Request {aid_request_id}")
            return None

        # Build contact details
        contact_details = _build_contact_details(aid_request)

        # Build aid details
        aid_details = _build_aid_details(aid_request, location_status, contact_details, location)

        # Create COT message
        data = make_cot(
            mark_type=mark_type,
            cot_icon=aid_request.aid_type.cot_icon,
            name=f'{aid_request.aid_type.slug}.{aid_request.pk}',
            uuid=f'AidRequest.{aid_request.pk}',
            lat=location.latitude,
            lon=location.longitude,
            remarks=aid_details,
            parent_name=f'{field_op_slug.upper()}',
            parent_uuid=f'FieldOp.{field_op_slug.upper()}',
        )

        ic(f"Created aid request mark for {aid_request.pk}")
        return data

    except Exception as e:
        ic('Failed to build aid request COT:', e)
        raise RuntimeError(f"Could not build aid request COT: {e}")


def _build_contact_details(aid_request):
    """Build contact details string for aid request."""
    contact_details = (
        f'Requestor: {aid_request.requestor_first_name} {aid_request.requestor_last_name}\n'
        f'Email: {aid_request.requestor_email}\n'
        f'Phone: {aid_request.requestor_phone}\n'
    )

    if aid_request.aid_contact:
        contact_details += '--> Aid Contact <--\n'
        if aid_request.aid_first_name or aid_request.aid_last_name:
            contact_details += f'Aid Name: {aid_request.aid_first_name} {aid_request.aid_last_name}\n'
        if aid_request.aid_phone:
            contact_details += f'Aid Phone: {aid_request.aid_phone}\n'
        if aid_request.aid_email:
            contact_details += f'Aid Email: {aid_request.aid_email}\n'

    if aid_request.contact_methods:
        contact_details += '--> Contact Methods <--\n'
        contact_details += f'{aid_request.contact_methods}\n'

    return contact_details


def _build_aid_details(aid_request, location_status, contact_details, location):
    """Build complete aid details string including location information."""
    aid_details = (
        f'Aid Type: {aid_request.aid_type}\n'
        f'Priority: {aid_request.priority}\n'
        f'Status: {aid_request.status}\n'
        f'Location Status: {location_status}\n'
        '------\n'
        f'{contact_details}'
        '------\n'
        f'Group Size: {aid_request.group_size}\n'
        f'Description: {aid_request.aid_description}\n'
        '------\n'
        f'Street Address: {aid_request.street_address}\n'
        f'City: {aid_request.city}\n'
        f'State: {aid_request.state}\n'
        f'Zip Code: {aid_request.zip_code}\n'
        f'Country: {aid_request.country}\n'
        '------\n'
    )

    # Add location details if available
    if location:
        aid_details += (
            f'Best Location ID: {location.pk} ({location.status})\n'
            f'Address Searched: {location.address_searched}\n'
            f'Address Found: {location.address_found}\n'
            f'Distance: {location.distance}\n'
            f'Location Note:\n{location.note}\n'
        )

    # Add additional information
    additional_info = '--- Additional Info ---\n'
    if aid_request.medical_needs:
        additional_info += f'Medical Needs: {aid_request.medical_needs}\n'
    if aid_request.supplies_needed:
        additional_info += f'Supplies Needed: {aid_request.supplies_needed}\n'
    if aid_request.welfare_check_info:
        additional_info += f'Welfare Check Info: {aid_request.welfare_check_info}\n'
    if aid_request.additional_info:
        additional_info += f'Additional Info: {aid_request.additional_info}\n'

    aid_details += additional_info
    return aid_details
