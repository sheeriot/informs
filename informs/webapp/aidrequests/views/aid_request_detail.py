from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
# from django.urls import reverse
from django.views.generic import DetailView
from django_q.tasks import async_task

from ..models import AidRequest, FieldOp
from .aid_request_forms import AidRequestLogForm
from .aid_location_forms import AidLocationStatusForm, AidLocationCreateForm
from .aid_request import has_location_status, format_aid_location_note
from .maps import staticmap_aid, calculate_zoom
from ..geocoder import get_azure_geocode, geocode_save
from ..tasks import aidrequest_takcot

from datetime import datetime
# from time import perf_counter as timer
from icecream import ic


# Detail View for AidRequest
class AidRequestDetailView(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    permission_required = 'aidrequests.view_aidrequest'
    model = AidRequest
    template_name = 'aidrequests/aid_request_detail.html'

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        # time_start = timer()
        self.kwargs = kwargs
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])

        location_confirmed, locs_confirmed = has_location_status(self.aid_request, 'confirmed')
        location_new, locs_new = has_location_status(self.aid_request, 'new')

        if location_confirmed:
            self.aid_location_confirmed = locs_confirmed.first()
            self.aid_location = self.aid_location_confirmed
        elif location_new:
            self.aid_location_new = locs_new.first()
            self.aid_location = self.aid_location_new
        else:
            # not confirmed, not new, better geocode and map it.
            # getting location and map here means it is ready for the web page if needed.
            # this may cause a pause on loading the Aid Request Detail page
            try:
                self.geocode_results = get_azure_geocode(self.aid_request)
            except Exception as e:
                ic(e)
            try:
                self.aid_location = geocode_save(self.aid_request, self.geocode_results)
            except Exception as e:
                ic(e)
            # ic(self.aid_location)
            self.aid_location_new = self.aid_location
            zoom = calculate_zoom(self.geocode_results['distance'])
            # ic(zoom)
            staticmap_data = staticmap_aid(
                width=600, height=600, zoom=zoom,
                fieldop_lat=self.aid_request.field_op.latitude,
                fieldop_lon=self.aid_request.field_op.longitude,
                aid1_lat=self.aid_location.latitude,
                aid1_lon=self.aid_location.longitude,)

            if staticmap_data:
                timestamp = datetime.now().strftime("%y%m%d%H%M%S")
                map_filename = f"AR{self.aid_request.pk}-map_{timestamp}.png"
                map_file = f"{settings.MAPS_PATH}/{map_filename}"
                with open(map_file, 'wb') as file:
                    file.write(staticmap_data)
                try:
                    self.aid_location.map_filename = map_filename
                    self.aid_location.save()
                except Exception as e:
                    ic(e)
            try:
                self.aid_request.logs.create(
                    log_entry=f'New Aid Location {self.aid_location} Created!'
                )
            except Exception as e:
                ic(f"Log Error: {e}")
            # ic(timer()-time_start)
            updated_at_stamp = self.aid_location.updated_at.strftime('%Y%m%d%H%M%S')
            async_task(aidrequest_takcot, aidrequest_id=self.aid_request.pk,
                       task_name=f"AidLocation{self.aid_location.pk}-New-SendCOT-{updated_at_stamp}")
            try:
                self.aid_request.logs.create(
                    log_entry=f'COT Sent! New Location {self.aid_location}')
            except Exception as e:
                ic(f"Log Error: {e}")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        context['field_op'] = self.field_op
        context['aid_request'] = self.aid_request
        if hasattr(self, 'aid_location_confirmed'):
            context['confirmed'] = True
            context['location'] = self.aid_location_confirmed
            context['map_filename'] = self.aid_location_confirmed.map_filename
            context['location_note'] = format_aid_location_note(self.aid_location_confirmed)
            found_pk = self.aid_location_confirmed.pk
        elif hasattr(self, 'aid_location_new'):
            context['new'] = True
            context['location'] = self.aid_location_new
            context['map_filename'] = self.aid_location_new.map_filename
            context['location_note'] = format_aid_location_note(self.aid_location_new)
            found_pk = self.aid_location_new.pk

        context['MAPS_PATH'] = settings.MAPS_PATH
        context['locations'] = self.aid_request.locations.all()
        context['logs'] = self.aid_request.logs.all().order_by('-updated_at')
        aid_location_status_init = {
            'field_op': self.field_op.slug,
            'aid_request': self.aid_request.pk,
            'pk': found_pk,
        }
        aid_location_status_form = AidLocationStatusForm(initial=aid_location_status_init)
        context['aid_location_status_form'] = aid_location_status_form

        # show the static map. Current, it runs in every context.
        # should be saved locally and updated as needed

        log_init = {
            'field_op': self.field_op.slug,
            'aid_request': self.aid_request.pk,
            }
        context['log_form'] = AidRequestLogForm(initial=log_init)
        # Manual Location Form
        aid_location_manual_init = {
            'field_op': self.field_op.slug,
            'aid_request': self.aid_request.pk,
        }
        context['aid_location_manual_form'] = AidLocationCreateForm(initial=aid_location_manual_init)

        return context
