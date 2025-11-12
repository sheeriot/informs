from django.shortcuts import get_object_or_404, render
from django.contrib.auth.decorators import login_required
from dateutil import parser
from django.utils import timezone
import json
from django.db.models import Case, When, Value
from icecream import ic

from ..models import AidRequest, ActionLog
from ..forms import (
    RequesterInformationForm, LocationInformationForm, RequestDetailsForm,
    ActionLogForm
)
from django.http import HttpResponseForbidden, HttpResponse
from django.views.decorators.http import require_POST
from django.conf import settings
from django.http import Http404
import os
from django.http import FileResponse
from ..models import AidLocation
from django.urls import reverse
from django.template.loader import render_to_string
from django.utils.safestring import mark_safe
from ..models import AidRequest, ActionLog, AidLocation
from ..forms import ActionLogForm
from ..forms.aidrequest_update_forms import RequesterAndGroupSizeForm
from ..forms.aidrequest_generic_forms import GenericDetailFieldForm
from ..forms.address_forms import AddressForm
from auditlog.models import LogEntry
from icecream import ic
from django.template.defaultfilters import linebreaks
from django.utils.html import escape
from django.urls import NoReverseMatch
import logging

logger = logging.getLogger(__name__)


@login_required
def get_aid_request_header_partial(request, field_op, pk):
    """
    Returns the rendered HTML for the aid request header partial.
    This is used to refresh the header via HTMX.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    # The header needs 'object', 'field_op', 'locations', 'confirmed', 'action_logs'
    locations = aid_request.locations.all()
    context = {
        'object': aid_request,
        'field_op': aid_request.field_op,
        'locations': locations,
        'confirmed': aid_request.location_status == 'confirmed',
        'action_logs': aid_request.action_logs.all(),
    }
    return render(request, 'aidrequests/partials/_aid_request_header.html', context)


@login_required
def get_action_logs_partial(request, field_op, pk):
    """
    Returns a partial HTML response containing the action logs for an aid request.
    Can be filtered by `since_id`.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    since_id = request.GET.get('since_id')

    logs_query = aid_request.action_logs.all().order_by('-created_at')
    if since_id:
        logs_query = logs_query.filter(pk__gt=since_id)

    # ic(f"Action Logs Request for AR-{pk} with since_id: {since_id}")
    # ic(f"Found {logs_query.count()} new action logs.")

    context = {
        'aid_request': aid_request,
        'logs': logs_query,
        'since_id': since_id,
    }
    return render(request, 'aidrequests/partials/_action_log_rows.html', context)


@login_required
def get_requester_info(request, field_op, pk):
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    return render(request, 'aidrequests/partials/_requester_info_display.html', {'aid_request': aid_request})


@login_required
def edit_requester_info(request, field_op, pk):
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    form = RequesterAndGroupSizeForm(instance=aid_request)
    return render(request, 'aidrequests/partials/_requester_info_form.html', {
        'aid_request': aid_request,
        'form': form,
    })


@login_required
def edit_detail_field(request, field_op, pk, field_name):
    """
    Renders a generic form in the modal for editing a single textarea-based field.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)

    # Basic security check to ensure we're only editing allowed fields
    allowed_fields = ['aid_description', 'supplies_needed', 'medical_needs', 'welfare_check_info', 'additional_info']
    if field_name not in allowed_fields:
        raise Http404("Invalid field specified for editing.")

    # Dynamically determine the save URL name based on the field name
    url_name = f"save_{field_name}"
    try:
        # Construct the URL for the form's hx-post action
        save_url = reverse(url_name, kwargs={'field_op': field_op, 'pk': pk})
    except NoReverseMatch:
        # Handle case where the URL name is not found, maybe log it
        save_url = '' # Or raise an error

    field_meta = AidRequest._meta.get_field(field_name)
    field_label = field_meta.verbose_name.title()
    current_value = getattr(aid_request, field_name)

    form = GenericDetailFieldForm(initial={'value': current_value}, field_label=field_label)

    context = {
        'aid_request': aid_request,
        'form': form,
        'field_name': field_name,
        'field_label': field_label,
        'save_url': save_url,
    }
    return render(request, 'aidrequests/partials/_detail_field_edit_modal.html', context)


@login_required
def edit_address_info(request, field_op, pk):
    """
    Renders the modal form for editing the address.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    form = AddressForm(instance=aid_request)
    context = {
        'aid_request': aid_request,
        'form': form,
        'hx_url': reverse('save_address_info', kwargs={'field_op': field_op, 'pk': pk})
    }
    return render(request, 'aidrequests/partials/_address_edit_modal.html', context)


@login_required
@require_POST
def save_address_info(request, field_op, pk):
    """
    Saves the address information and returns the updated requester info partial.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    # Store original values for comparison
    original_values = {
        'street_address': aid_request.street_address,
        'city': aid_request.city,
        'state': aid_request.state,
        'zip_code': aid_request.zip_code,
    }

    form = AddressForm(request.POST, instance=aid_request)

    if form.is_valid():
        # Get note from form BEFORE saving, as we will pass it to the save method
        note = request.POST.get('note', '')
        note_markdown = request.POST.get('note_markdown') == 'on'

        # Manually set the country from the FieldOp before saving
        updated_request = form.save(commit=False)
        updated_request.country = aid_request.field_op.country

        # Compare old and new values to build the event_text
        changes = []
        for field, old_value in original_values.items():
            new_value = getattr(updated_request, field)
            if old_value != new_value:
                changes.append(f"{field.replace('_', ' ').title()}: '{old_value}' → '{new_value}'")

        event_text = "\n".join(changes)
        if not event_text:
            event_text = "Address information saved with no changes."

        # Now save, passing the logging details to the model's save method
        updated_request.save(
            event_name='Address Info Updated',
            event_text=event_text,
            note=note,
            note_markdown=note_markdown
        )

        # Return the smaller, updated address partial to be swapped.
        response = render(request, 'aidrequests/partials/_address_info_display.html', {'aid_request': updated_request})
        response['HX-Trigger'] = json.dumps({
            'actionLogUpdated': None,
            'auditLogUpdated': None,
            'detailFieldUpdated': None, # To trigger header refresh
            'closeModal': '#genericEditModal',
        })
        return response

    # If form is not valid, re-render the modal with errors
    context = {
        'aid_request': aid_request,
        'form': form,
        'hx_url': reverse('save_address_info', kwargs={'field_op': field_op, 'pk': pk})
    }
    return render(request, 'aidrequests/partials/_address_edit_modal.html', context)


@login_required
@require_POST
def save_detail_field(request, field_op, pk, field_name):
    """
    Saves the value from the generic edit form and returns an OOB swap response.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)

    allowed_fields = ['aid_description', 'supplies_needed', 'medical_needs', 'welfare_check_info', 'additional_info']
    if field_name not in allowed_fields:
        raise Http404("Invalid field specified for saving.")

    field_meta = AidRequest._meta.get_field(field_name)
    field_label = field_meta.verbose_name.title()

    form = GenericDetailFieldForm(request.POST, field_label=field_label)

    if form.is_valid():
        new_value = form.cleaned_data['value']
        old_value = getattr(aid_request, field_name)

        note = request.POST.get('note', '')
        note_markdown = request.POST.get('note_markdown') == 'on'

        # Update the field and save the model
        setattr(aid_request, field_name, new_value)
        aid_request.save(
            update_fields=[field_name],
            note=note,
            note_markdown=note_markdown
        )

        # The <pre> tag on the front end will handle newlines, so we just need to escape.
        processed_value = escape(new_value) if new_value else '-'

        # ic(f"HTMX Response for '{field_name}':", processed_value)

        # The swap target and method are now defined in the form itself.
        # We just need to return the content and trigger other events.
        response = HttpResponse(processed_value, content_type="text/html")
        response['HX-Trigger'] = json.dumps({
            'detailFieldUpdated': None,
            'actionLogUpdated': None,
            'auditLogUpdated': None,
            'closeModal': '#genericEditModal',
        })
        return response

    # If form is invalid, re-render the modal content with errors
    context = {
        'aid_request': aid_request,
        'form': form,
        'field_name': field_name,
        'field_label': field_label,
    }
    return render(request, 'aidrequests/partials/_detail_field_edit_modal.html', context)


@login_required
@require_POST
def save_requester_info(request, field_op, pk):
    original_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)

    # Store original values before they are changed by the form
    original_values = {
        'requester_first_name': original_request.requester_first_name,
        'requester_last_name': original_request.requester_last_name,
        'requester_phone': original_request.requester_phone,
        'requester_email': original_request.requester_email,
        'group_size': original_request.group_size,
    }

    form = RequesterAndGroupSizeForm(request.POST, instance=original_request)

    if form.is_valid():
        updated_request = form.save(commit=False)
        updated_request.updated_by = request.user
        updated_request.save()

        # Get note from form
        note = request.POST.get('note', '')
        note_markdown = request.POST.get('note_markdown') == 'on'

        # Compare old and new values to build the event_text
        changes = []
        for field, old_value in original_values.items():
            new_value = getattr(updated_request, field)
            if str(old_value) != str(new_value): # Compare as strings to handle different types
                changes.append(f"{field.replace('_', ' ').title()}: '{old_value}' → '{new_value}'")

        event_text = "\n".join(changes)
        if not event_text:
            event_text = "No changes detected."

        ActionLog.objects.create(
            aid_request=updated_request,
            log_type='system',
            event_name='Requester Info Updated',
            event_text=event_text,
            created_by=request.user,
            agent_name=request.user.username,
            note=note,
            note_markdown=note_markdown
        )

        response_html = render_to_string('aidrequests/partials/_requester_info_card.html', {'aid_request': updated_request})
        # ic("HTMX response for save_requester_info:", response_html)
        response = HttpResponse(response_html)
        response['HX-Trigger'] = 'actionLogUpdated, auditLogUpdated'
        return response

    # If form is not valid, re-render the form with errors
    return render(request, 'aidrequests/partials/_requester_info_form.html', {
        'aid_request': original_request,
        'form': form,
    })


@login_required
def get_audit_logs_partial(request, field_op, pk):
    """
    Returns just the rows for the audit logs table.
    """
    from auditlog.models import LogEntry
    from django.contrib.contenttypes.models import ContentType

    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    # Get the 'since_id' from query params to fetch only new logs
    since_id = request.GET.get('since_id')
    content_type = ContentType.objects.get_for_model(AidRequest)

    if since_id:
        audit_logs = LogEntry.objects.filter(
            content_type=content_type,
            object_pk=aid_request.pk,
            id__gt=since_id
        ).order_by('-timestamp')
        template_name = 'aidrequests/partials/_audit_log_rows.html'
    else:
        audit_logs = LogEntry.objects.filter(
            content_type=content_type,
            object_pk=aid_request.pk
        ).order_by('-timestamp')
        template_name = 'aidrequests/partials/audit_logs_tab.html'

    context = {
        'audit_logs': audit_logs,
        'aid_request': aid_request,
        'log_form': ActionLogForm(
            initial={'aid_request': pk, 'log_type': 'user'},
            field_op_slug=field_op,
            aid_request_pk=pk
        )
    }
    return render(request, template_name, context)

@login_required
def get_action_log_edit_form(request, field_op, aid_request_pk, pk):
    """ Returns the htmx form for editing an action log """
    log = get_object_or_404(ActionLog, pk=pk, aid_request__pk=aid_request_pk, aid_request__field_op__slug=field_op)
    context = {'log': log}
    # The template can now directly access log.note and log.note_markdown
    return render(request, 'aidrequests/partials/action_log_edit_form.html', context)

@login_required
@require_POST
def update_action_log(request, field_op, aid_request_pk, pk):
    """ Updates an action log """
    log = get_object_or_404(ActionLog, pk=pk, aid_request__pk=aid_request_pk, aid_request__field_op__slug=field_op)
    if request.user == log.created_by:
        log.note = request.POST.get('note', '')
        log.note_markdown = request.POST.get('note_markdown') == 'on'
        log.save()
    return render(request, 'aidrequests/partials/_action_log_row.html', {'log': log})


@login_required
def get_action_log_row(request, field_op, aid_request_pk, pk):
    """ Returns a single action log row """
    log = get_object_or_404(ActionLog, pk=pk, aid_request__pk=aid_request_pk, aid_request__field_op__slug=field_op)
    return render(request, 'aidrequests/action_log_row.html', {'log': log})


@login_required
def get_locations_list_partial(request, field_op, pk):
    """
    Returns the rendered HTML for the aid locations list.
    """
    aid_request = get_object_or_404(AidRequest, field_op__slug=field_op, pk=pk)
    locations = aid_request.locations.sorted_for_display()
    current_location = aid_request.location  # This is the property that gets the confirmed or newest

    ic(locations.values_list('pk', 'status'))

    new_location_id = None
    new_location_id_str = request.GET.get('new')
    if new_location_id_str:
        try:
            new_location_id = int(new_location_id_str)
            locations_list = list(locations)
            # Sort to bring the new location to the top
            locations_list.sort(key=lambda x: x.pk == new_location_id, reverse=True)
            locations = locations_list
            ic([l.pk for l in locations])
        except (ValueError, TypeError):
            new_location_id = None  # Ignore if 'new' is not a valid int

    context = {
        'aid_request': aid_request,
        'locations': locations,
        'current_location': current_location,
        'new_location_id': new_location_id,
        'MEDIA_URL': settings.MEDIA_URL,
    }
    return render(request, 'aidrequests/includes/aid_locations_list.html', context)


@login_required
def serve_map_file(request, field_op, aid_request_pk, filename):
    """
    Serves a static map image after performing a security check.
    Sets long-term cache headers as the map files are immutable.
    """
    try:
        AidLocation.objects.get(
            map_filename=filename,
            aid_request__pk=aid_request_pk,
            aid_request__field_op__slug=field_op
        )
    except AidLocation.DoesNotExist:
        logger.warning(f"Map Access Denied: Security check FAILED for map '{filename}'.")
        raise Http404("Map file not found or permission denied.")

    file_path = os.path.join(settings.MEDIA_ROOT, 'maps', filename)

    if os.path.exists(file_path):
        response = FileResponse(open(file_path, 'rb'))
        response['Cache-Control'] = 'public, max-age=31536000, immutable'
        return response
    else:
        logger.error(f"Map File Not Found on Disk at path: {file_path}")
        raise Http404("Map file does not exist on disk.")
