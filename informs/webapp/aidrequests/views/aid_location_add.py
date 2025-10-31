from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.views.decorators.http import require_POST, require_http_methods
from django.conf import settings
from icecream import ic
import os
import json

from ..models import AidRequest, AidLocation, FieldOp, ActionLog
from .aid_location_forms import AidLocationCreateForm
from .maps import create_static_map


@login_required
def add_location(request, field_op, pk):
    aid_request = get_object_or_404(AidRequest, pk=pk)
    field_op_obj = get_object_or_404(FieldOp, slug=field_op)
    # ic(f"VIEW: add_location for AidRequest PK: {aid_request.pk}")
    # ic(f"VIEW: field_op PK: {field_op_obj.pk}, slug: {field_op_obj.slug}")
    # ic(f"VIEW: aid_request address: {aid_request.full_address}")

    if request.method == 'POST':
        form = AidLocationCreateForm(request.POST, field_op_obj=field_op_obj)
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

            # After saving the new location, we need to refresh the aid_request
            # object so that its properties (like `location_status`) are up-to-date
            # when rendering the new card template.
            aid_request.refresh_from_db()
            location.refresh_from_db() # Also refresh the location to get the map filename for the card

            context = {'aid_request': aid_request, 'location': location, 'object': aid_request, 'confirmed': aid_request.location_status == 'confirmed'}

            new_location_html = render_to_string(
                'aidrequests/partials/_aid_location_card.html',
                context,
                request=request
            )
            header_html = render_to_string(
                'aidrequests/partials/aid_request_header.html',
                context,
                request=request
            )
            return JsonResponse({
                'success': True,
                'location_pk': location.pk,
                'new_location_html': new_location_html,
                'header_html': header_html
            })
        else:
            ic(form.errors)
            return JsonResponse({'success': False, 'errors': form.errors.as_json()}, status=400)

    # If not POST, we shouldn't be here. Redirect or raise an error.
    return JsonResponse({'success': False, 'error': 'Invalid request method.'}, status=405)


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
def delete_aid_location(request, field_op, location_pk):
    location = get_object_or_404(AidLocation, pk=location_pk)
    aid_request = location.aid_request
    if aid_request.field_op.slug != field_op:
        return JsonResponse({'status': 'error', 'message': 'Permission denied.'}, status=403)
    try:
        note = ''
        note_is_markdown = False
        if request.body:
            try:
                data = json.loads(request.body)
                note = data.get('note', '')
                note_is_markdown = data.get('is_markdown', False)
            except json.JSONDecodeError:
                pass

        # Render the details of the location BEFORE deleting it
        log_text = render_to_string(
            'aidrequests/logs/location_deleted_log.md',
            {'location': location}
        )

        ActionLog.objects.create(
            aid_request=aid_request,
            created_by=request.user,
            log_type='location',
            event_name=f"Location #{location.pk} Deleted",
            event_text=log_text,
            text_markdown=True, # The event_text is now markdown
            note=note, # The user-provided note is kept separate
            note_markdown=note_is_markdown,
            agent_name=request.user.username
        )

        location.delete()
        aid_request.refresh_from_db()
        locations = aid_request.locations.all()
        context = {
            'object': aid_request,
            'aid_request': aid_request,
            'locations': locations,
            'confirmed': aid_request.location_status == 'confirmed'
        }
        header_html = render_to_string('aidrequests/partials/aid_request_header.html', context, request=request)

        return JsonResponse({
            'status': 'success',
            'message': f'Location {location_pk} deleted successfully.',
            'header_html': header_html
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
