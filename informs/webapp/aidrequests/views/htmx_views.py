from django.shortcuts import get_object_or_404, render
from django.contrib.auth.decorators import login_required
from dateutil import parser
from django.utils import timezone
import json
from django.db.models import Case, When, Value
from icecream import ic

from ..models import AidRequest, ActionLog
from ..forms import ActionLogForm
from django.http import HttpResponseForbidden, HttpResponse
from django.views.decorators.http import require_POST

@login_required
def get_action_logs_partial(request, field_op, pk):
    """
    Returns the rendered HTML for the action logs component.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    action_logs = aid_request.action_logs.all().order_by('-created_at')
    log_form = ActionLogForm(
        initial={'aid_request': aid_request.pk},
        field_op_slug=field_op,
        aid_request_pk=pk
    )

    context = {
        'aid_request': aid_request,
        'action_logs': action_logs,
        'log_form': log_form,
        'field_op': aid_request.field_op,
    }
    return render(request, 'aidrequests/partials/action_logs_tab.html', context)


@login_required
def get_audit_logs_partial(request, field_op, pk):
    """
    Returns the rendered HTML for the audit logs component.
    """
    from auditlog.models import LogEntry
    from django.contrib.contenttypes.models import ContentType

    aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
    content_type = ContentType.objects.get_for_model(aid_request)
    audit_logs = LogEntry.objects.filter(content_type=content_type, object_pk=aid_request.pk).order_by('-timestamp')

    context = {
        'aid_request': aid_request,
        'audit_logs': audit_logs,
        'field_op': aid_request.field_op,
    }
    return render(request, 'aidrequests/partials/audit_logs_tab.html', context)

@login_required
def get_action_log_edit_form(request, pk):
    """ Returns the htmx form for editing an action log """
    log = get_object_or_404(ActionLog, pk=pk)
    context = {'log': log}
    # The template can now directly access log.note and log.note_markdown
    return render(request, 'aidrequests/partials/action_log_edit_form.html', context)

@login_required
@require_POST
def update_action_log(request, pk):
    """ Updates an action log """
    log = get_object_or_404(ActionLog, pk=pk)
    if request.user == log.created_by:
        log.note = request.POST.get('note', '')
        log.note_markdown = request.POST.get('is_markdown') == 'on'
        log.save()
    return render(request, 'aidrequests/action_log_row.html', {'log': log})


@login_required
def get_action_log_row(request, pk):
    """ Returns a single action log row """
    log = get_object_or_404(ActionLog, pk=pk)
    return render(request, 'aidrequests/action_log_row.html', {'log': log})


@login_required
def get_locations_list_partial(request, field_op, pk):
    """
    Returns the partial template for the aid locations list.
    """
    aid_request = get_object_or_404(AidRequest, pk=pk)

    # Use the custom manager method for sorting
    locations = aid_request.locations.sorted_for_display()

    context = {
        'object': aid_request,
        'aid_request': aid_request,
        'locations': locations
    }
    return render(request, 'aidrequests/includes/aid_locations_list.html', context)
