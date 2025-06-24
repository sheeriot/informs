from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.urls import reverse
from django.views.generic import DetailView
from django_q.tasks import async_task
import logging

from ..models import AidRequest, FieldOp, AidRequestLog
from ..forms import AidRequestLogForm, RequestStatusForm
from .aid_location_forms import AidLocationStatusForm
from .aid_request import has_location_status, format_aid_location_note
from .maps import staticmap_aid
from ..geocoder import get_azure_geocode, geocode_save
from ..tasks import send_cot_task

from datetime import datetime
# from time import perf_counter as timer
from icecream import ic

logger = logging.getLogger(__name__)


class AidRequestSubmittedView(DetailView):
    model = AidRequest
    template_name = 'aidrequests/aid_request_submitted.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = get_object_or_404(FieldOp, slug=self.kwargs['field_op'])
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        context['hide_auth_header_items'] = True

        # Get the most recent location, which should have been created by the post_save task.
        aid_location = self.object.locations.order_by('-created_at').first()
        context['aid_location'] = aid_location

        return context


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
            # If no location is found, it means post_save hasn't run or completed yet.
            # This can happen on a quick redirect. We should wait and not create a new one.
            self.aid_location = self.aid_request.locations.all().first()

        # Ensure the location has a map
        if self.aid_location and not self.aid_location.map_filename:
            logger.info(f"AR-{self.aid_request.pk}: Location {self.aid_location.pk} is missing a map. Generating one now.")
            staticmap_data = staticmap_aid(
                width=600, height=600,
                fieldop_lat=self.aid_request.field_op.latitude,
                fieldop_lon=self.aid_request.field_op.longitude,
                aid1_lat=self.aid_location.latitude,
                aid1_lon=self.aid_location.longitude,
            )
            if staticmap_data:
                timestamp = datetime.now().strftime("%y%m%d%H%M%S")
                map_filename = f"AR{self.aid_request.pk}-map_{timestamp}.png"
                map_file = f"{settings.MAPS_PATH}/{map_filename}"
                with open(map_file, 'wb') as file:
                    file.write(staticmap_data)
                self.aid_location.map_filename = map_filename
                self.aid_location.save()
                logger.info(f"AR-{self.aid_request.pk}: Map generated and saved as {map_filename}")

    def get_context_data(self, **kwargs):
        try:
            context = super().get_context_data(**kwargs)

            context['field_op'] = self.field_op
            context['aid_request'] = self.aid_request

            if self.aid_location:
                if hasattr(self, 'aid_location_confirmed'):
                    context['confirmed'] = True
                elif hasattr(self, 'aid_location_new'):
                    context['new'] = True

                context['location'] = self.aid_location
                context['map_filename'] = self.aid_location.map_filename
                context['location_note'] = format_aid_location_note(self.aid_location)

                aid_location_status_init = {
                    'field_op': self.field_op.slug,
                    'aid_request': self.aid_request.pk,
                    'location_pk': self.aid_location.pk,
                }
                aid_location_status_form = AidLocationStatusForm(initial=aid_location_status_init)
                context['aid_location_status_form'] = aid_location_status_form

            context['MAPS_PATH'] = settings.MAPS_PATH
            context['locations'] = self.aid_request.locations.all()
            context['logs'] = self.aid_request.logs.all().order_by('-updated_at')

            log_init = {
                'aid_request': self.aid_request.pk,
                }
            context['log_form'] = AidRequestLogForm(
                initial=log_init,
                field_op_slug=self.field_op.slug,
                aid_request_pk=self.aid_request.pk
            )
            context['AZURE_MAPS_KEY'] = settings.AZURE_MAPS_KEY
            context['MEDIA_URL'] = settings.MEDIA_URL
            context['status_form'] = RequestStatusForm(instance=self.aid_request)
            context['hide_add_location_button'] = True

            # URLs for javascript actions
            context['url_partial_update'] = reverse('aid_request_ajax_update', kwargs={'field_op': self.field_op.slug, 'pk': self.aid_request.pk})
            context['url_regenerate_map'] = reverse('static_map_regenerate', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})
            context['url_delete_location'] = reverse('api_aid_location_delete', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})
            context['url_update_location_status'] = reverse('aid_location_status_update', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})
            context['url_check_map_status'] = reverse('check_map_status', kwargs={'field_op': self.field_op.slug, 'location_pk': 0})

            return context
        except Exception as e:
            logger.error(f"Error getting context data: {e}")
            raise

    def get_object(self, queryset=None):
        try:
            return super().get_object(queryset)
        except Exception as e:
            logger.error(f"Error getting aid request object: {e}")
            raise
