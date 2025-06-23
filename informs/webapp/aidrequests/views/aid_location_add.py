from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.views.decorators.http import require_POST
from django.conf import settings
# from icecream import ic
import os

from ..models import AidRequest, AidLocation, FieldOp
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
            location = form.save(commit=False)
            location.aid_request = aid_request
            location.save()

            create_static_map(location)

            new_location_html = render_to_string(
                'aidrequests/partials/_aid_location_card.html',
                {'aid_request': aid_request, 'location': location},
                request=request
            )
            return JsonResponse({
                'success': True,
                'location_pk': location.pk,
                'new_location_html': new_location_html
            })
        else:
            return JsonResponse({'success': False, 'errors': form.errors.as_json()}, status=400)
    else: # GET request
        form = AidLocationCreateForm(field_op_obj=field_op_obj, aid_request_obj=aid_request, initial={
            'aid_request': aid_request.pk,
            'country': aid_request.country or field_op_obj.country,
        })
        context = {
            'form': form,
            'aid_request': aid_request,
            'field_op': field_op_obj,
            'AZURE_MAPS_KEY': settings.AZURE_MAPS_KEY
        }
        return render(request, 'aidrequests/partials/_aid_location_form.html', context)


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


@require_POST
@login_required
def delete_aid_location(request, field_op, location_pk):
    location = get_object_or_404(AidLocation, pk=location_pk)
    aid_request = location.aid_request
    if aid_request.field_op.slug != field_op:
        return JsonResponse({'status': 'error', 'message': 'Permission denied.'}, status=403)
    try:
        location_id = location.pk
        location.delete()
        return JsonResponse({'status': 'success', 'message': f'Location {location_id} deleted successfully.'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
