from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.views.decorators.http import require_POST, require_http_methods
from django.conf import settings
from icecream import ic
import os
import json
from django.db.models import Case, When, Value

from ..models import AidRequest, AidLocation, FieldOp, ActionLog
from .aid_location_forms import AidLocationCreateForm
from .maps import create_static_map
from django_q.tasks import async_task


@login_required
def add_location(request, field_op, pk):
    aid_request = get_object_or_404(AidRequest, pk=pk)
    field_op_obj = get_object_or_404(FieldOp, slug=field_op)
    # ic(f"VIEW: add_location for AidRequest PK: {aid_request.pk}")
    # ic(f"VIEW: field_op PK: {field_op_obj.pk}, slug: {field_op_obj.slug}")
    # ic(f"VIEW: aid_request address: {aid_request.full_address}")

    if request.method == 'POST':
        form = AidLocationCreateForm(request.POST, field_op_obj=field_op_obj, aid_request_obj=aid_request)
        if form.is_valid():
            ic(form.cleaned_data)
            location = form.save(commit=False)
            location.aid_request = aid_request

            # Populate missing fields
            street = form.cleaned_data.get('street_address', '')
            city = form.cleaned_data.get('city', '')
            state = form.cleaned_data.get('state', '')
            # Join only non-empty parts with a comma and a space
            location.address_searched = ", ".join(filter(None, [street, city, state]))

            location.created_by = request.user
            location.updated_by = request.user

            location.save()

            # After saving, get the complete list of all locations, but
            # annotate it to force the newly created one to the top.
            aid_request.refresh_from_db()

            # Get the base sorted queryset
            sorted_locations = aid_request.locations.sorted_for_display()

            # Annotate to bring the newly created location to the very top,
            # while preserving the rest of the sorting.
            locations_with_new_on_top = sorted_locations.annotate(
                sort_order_override=Case(
                    When(pk=location.pk, then=Value(0)),
                    default=Value(1)
                )
            ).order_by('sort_order_override', *sorted_locations.query.order_by)

            ic(f"Rendering locations for AidRequest #{aid_request.pk}. Found {len(locations_with_new_on_top)} locations.")
            ic("Top location in list:", locations_with_new_on_top[0] if locations_with_new_on_top else "None")

            context = {
                'aid_request': aid_request,
                'locations': locations_with_new_on_top,
                'new_location_id': location.pk, # Pass the new ID for highlighting
            }
            response = render(request, 'aidrequests/includes/aid_locations_list.html', context)

            response['HX-Trigger'] = json.dumps({
                "closeModal": "#addLocationModal",
                "showActionAlert": {
                    "message": f"Location {location.pk} added successfully.",
                    "level": "success"
                },
                "actionLogUpdated": "",
                "auditLogUpdated": ""
            })
            return response
        else:
            ic(form.errors)
            # This needs to be a proper HTTP response that can be handled by HTMX on error
            return render(request, 'aidrequests/partials/_add_location_modal_body.html', {'add_location_form': form}, status=400)

    # If not POST, we shouldn't be here. Redirect or raise an error.
    # For HTMX, it's better to return a specific error response
    return HttpResponse("Invalid request method.", status=405)


@require_POST
@login_required
def regenerate_static_map(request, field_op, location_pk):
    location = get_object_or_404(AidLocation, pk=location_pk)
    aid_request = location.aid_request
    if aid_request.field_op.slug != field_op:
        return JsonResponse({'status': 'error', 'message': 'Permission denied.'}, status=403)
    try:
        # 1. Delete the old map file if it exists
        if location.map_filename:
            old_map_path = os.path.join(settings.MAPS_PATH, location.map_filename)
            if os.path.exists(old_map_path):
                os.remove(old_map_path)
                # ic(f"Deleted old map file: {location.map_filename}")
                location.map_filename = None
                location.save()

        # 2. Run map creation synchronously to get the new file
        create_static_map(location, synchronous=True)

        # 3. Refresh the object to get the new filename and URL
        location.refresh_from_db()

        # 4. Render the map area partial with the updated location object
        map_html = render_to_string(
            'aidrequests/partials/_location_map_area.html',
            {'location': location, 'MEDIA_URL': settings.MEDIA_URL},
            request=request
        )

        return JsonResponse({'status': 'success', 'map_html': map_html})

    except Exception as e:
        # ic(f"Error regenerating map for location {location_pk}: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@require_POST
@login_required
def delete_static_map(request, field_op, location_pk):
    location = get_object_or_404(AidLocation, pk=location_pk)
    if location.aid_request.field_op.slug != field_op:
        return JsonResponse({'status': 'error', 'message': 'Permission denied.'}, status=403)
    try:
        if location.static_map:
            location.static_map.delete(save=True)
        return JsonResponse({'status': 'success'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
@require_http_methods(["DELETE"])
def delete_aid_location(request, field_op, pk):
    """
    Deletes an AidLocation.
    This view is called via HTMX from a modal confirmation.
    """
    try:
        location = get_object_or_404(AidLocation, pk=pk)
        aid_request = location.aid_request
        location_id = location.pk  # Capture ID before deletion

        note = ''
        note_markdown = False
        if request.body:
            try:
                data = json.loads(request.body)
                note = data.get('note', '')
                note_markdown = data.get('note_markdown', False)
            except json.JSONDecodeError:
                # Ignore if body is not valid JSON, note will be blank
                pass

        # Render the details of the location BEFORE deleting it for the log
        log_text = render_to_string(
            'aidrequests/logs/location_deleted_log.md',
            {'location': location}
        )

        # Create a log entry BEFORE deleting the object
        ActionLog.objects.create(
            aid_request=aid_request,
            created_by=request.user,
            log_type='location',
            event_name=f"Location #{location_id} Deleted",
            event_text=log_text,
            text_markdown=True, # The event_text is now markdown
            note=note,
            note_markdown=note_markdown,
            agent_name=request.user.username,
        )

        location.delete()

        # After deleting, trigger a CoT update for the parent aid request
        # to ensure the map marker reflects the new primary location.
        if not aid_request.field_op.disable_cot:
            async_task(
                'aidrequests.tasks.send_cot_task',
                field_op_slug=aid_request.field_op.slug,
                mark_type='aid',
                aidrequest=aid_request.pk,
                task_name=f"Update_CoT_AR_{aid_request.pk}_Loc_{pk}_Deleted"
            )

        # After deleting, fetch the remaining locations to render the updated list
        locations = aid_request.locations.sorted_for_display()

        response = render(
            request,
            'aidrequests/includes/aid_locations_list.html',
            {'aid_request': aid_request, 'locations': locations}
        )
        response['HX-Trigger'] = json.dumps({
            "showActionAlert": {
                "message": f"Location {location_id} has been deleted.",
                "level": "success"
            },
            "actionLogUpdated": "",
            "auditLogUpdated": ""
        })
        return response

    except AidLocation.DoesNotExist:
        return HttpResponseNotFound("The requested location does not exist.")
    except Exception as e:
        # logger.error(f"Error deleting location: {e}") # This line was not in the original file, so it's not added.
        # In case of an error, you might want to return an error message to the user
        # For simplicity, returning a generic server error here.
        return HttpResponse(status=500)
