from django.shortcuts import get_object_or_404, render
from django.contrib.auth.decorators import login_required
from dateutil import parser
from django.utils import timezone
import json

from ..models import AidRequest, ActionLog
from ..forms import ActionLogForm
from django.http import HttpResponseForbidden, HttpResponse
from django.views.decorators.http import require_POST

@login_required
def get_action_logs_partial(request, field_op, pk):
    """
    Returns the rendered HTML for the action logs component.
    If a 'since' parameter is provided, it only returns the newer log entries (rows).
    Otherwise, it returns the full component structure.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    since_id = request.GET.get('since')

    queryset = aid_request.action_logs.all().order_by('-created_at')

    if since_id and since_id.isdigit() and int(since_id) > 0:
        queryset = queryset.filter(pk__gt=since_id)

    action_logs = queryset
    log_form = ActionLogForm(
        initial={'aid_request': aid_request.pk},
        field_op_slug=field_op,
        aid_request_pk=pk
    )

    context = {
        'aid_request': aid_request, # For the URL in the hx-get div
        'action_logs': action_logs,
        'log_form': log_form,
    }

    if since_id:
        # Only return the new rows to be prepended
        return render(request, 'aidrequests/partials/_action_logs_rows.html', context)
    else:
        # Return the full component for the initial load
        return render(request, 'aidrequests/partials/action_logs_tab.html', context)


@login_required
def get_audit_logs_partial(request, field_op, pk):
    """
    Returns the rendered HTML for the audit logs component.
    Triggered by an HTMX event.
    """
    from auditlog.models import LogEntry
    from django.contrib.contenttypes.models import ContentType

    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    content_type = ContentType.objects.get_for_model(aid_request)
    since_timestamp_str = request.GET.get('since')

    queryset = LogEntry.objects.filter(content_type=content_type, object_pk=aid_request.pk).order_by('-timestamp')

    if since_timestamp_str:
        try:
            since_timestamp = parser.isoparse(since_timestamp_str)
            if timezone.is_naive(since_timestamp):
                since_timestamp = timezone.make_aware(since_timestamp, timezone.get_current_timezone())
            queryset = queryset.filter(timestamp__gt=since_timestamp)
        except (ValueError, TypeError):
            pass

    audit_logs = queryset

    context = {
        'aid_request': aid_request,
        'audit_logs': audit_logs,
    }

    if since_timestamp_str:
        return render(request, 'aidrequests/partials/_audit_logs_rows.html', context)
    else:
        return render(request, 'aidrequests/partials/audit_logs_tab.html', context)

@login_required
def get_action_log_edit_form(request, pk):
    """
    Returns the HTML form for editing an action log note.
    """
    log = get_object_or_404(ActionLog, pk=pk)

    # Security check: only the user who created the log can edit it
    if request.user != log.created_by:
        return HttpResponseForbidden("You are not allowed to edit this log.")

    # The template can now directly access log.note and log.is_markdown
    context = {
        'log': log,
    }
    return render(request, 'aidrequests/partials/action_log_edit_form.html', context)

@login_required
@require_POST
def update_action_log(request, pk):
    """
    Updates the note and markdown status of an action log.
    """
    log = get_object_or_404(ActionLog, pk=pk)

    if request.user != log.created_by:
        return HttpResponseForbidden("You are not allowed to edit this log.")

    # Update the note and markdown status directly on the model
    log.note = request.POST.get('note', '')
    log.is_markdown = request.POST.get('is_markdown') == 'on'

    # We will add dedicated fields for edit tracking later
    # For now, we save the changes directly.
    log.save()

    # Return the updated row
    return render(request, 'aidrequests/action_log_row.html', {'log': log})


@login_required
def get_action_log_row(request, pk):
    """
    Returns a single, freshly rendered action log row.
    """
    log = get_object_or_404(ActionLog, pk=pk)
    return render(request, 'aidrequests/partials/action_log_row.html', {'log': log})


@login_required
def get_locations_list_partial(request, field_op, pk):
    """
    Returns the rendered HTML for the locations list component.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    locations = aid_request.locations.all().order_by('-created_at')

    context = {
        'aid_request': aid_request,
        'locations': locations,
    }
    return render(request, 'aidrequests/includes/aid_locations_list.html', context)
