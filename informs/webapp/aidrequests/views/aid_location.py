from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.views.generic import CreateView, UpdateView, DeleteView
from django.urls import reverse_lazy
from django_q import tasks

from geopy.distance import geodesic
from datetime import datetime

from ..models import FieldOp, AidRequest, AidLocation
from ..tasks import aidrequest_takcot
from .aid_location_forms import AidLocationCreateForm, AidLocationStatusForm
from .maps import staticmap_aid, calculate_zoom

from icecream import ic


class AidLocationCreateView(LoginRequiredMixin, PermissionRequiredMixin, CreateView):
    """
    A Django class-based view for saving azure maps geocoded location
    """
    model = AidRequest
    form_class = AidLocationCreateForm
    permission_required = 'aidrequests.create_aidlocation'
    template_name = 'aidrequests/aid_request_geocode.html'

    def get_success_url(self):
        return reverse_lazy('aid_request_detail',
                            kwargs={'field_op': self.field_op.slug,
                                    'pk': self.aid_request.pk}
                            )

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        self.kwargs = kwargs
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['aid_request'])

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs.update({
            'initial': {
                'field_op': self.field_op.slug,
                'aid_request': self.aid_request.pk,
                'status': 'new',
                'source': 'manual'
            }
        })
        # ic(kwargs)
        return kwargs

    def form_valid(self, form):
        ic('manual created aid_location')
        try:
            self.aid_location = form.save()
        except Exception as e:
            ic(e)

        # augment location data and create log
        # first user and distance
        user = self.request.user
        if user.is_authenticated:
            self.aid_location.created_by = user
            self.aid_location.updated_by = user
        else:
            self.aid_location.created_by = None
            self.aid_location.updated_by = None

        self.aid_location.distance = round(geodesic(
                (self.field_op.latitude, self.field_op.longitude),
                (self.aid_location.latitude, self.aid_location.longitude)
            ).km, 2)

        self.aid_location.save()

        # Build the map
        zoom = calculate_zoom(self.aid_location.distance)
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

        ic(vars(self.aid_location))
        # ----- Send COT ------
        updated_at_stamp = self.aid_location.updated_at.strftime('%Y%m%d%H%M%S')
        tasks.async_task(aidrequest_takcot, aidrequest_id=self.aid_request.pk,
                         task_name=f"AidLocation{self.aid_location.pk}-ManualCreate-SendCot-{updated_at_stamp}")

        return super().form_valid(form)

    def form_invalid(self, form):
        ic(form.errors)
        return self.render_to_response(self.get_context_data(form=form))


class AidLocationDeleteView(LoginRequiredMixin, PermissionRequiredMixin, DeleteView):
    permission_required = 'aidrequests.delete_aidlocation'
    model = AidLocation
    template_name = 'aidrequests/aid_location_confirm_delete.html'
    context_object_name = 'aid_location'

    def get_success_url(self):
        return reverse_lazy(
            'aid_request_detail',
            kwargs={
                'field_op': self.field_op.slug,
                'pk': self.aid_request.pk
                }
            )

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['aid_request'])
        self.field_op = self.aid_request.field_op

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['aid_request'] = self.aid_request
        # ic(context)
        return context


class AidLocationStatusUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    model = AidLocation
    form_class = AidLocationStatusForm
    permission_required = 'aidrequests.change_aidlocation'
    # template_name = 'aidrequests/aid_location_update.html'
    # context_object_name = 'aid_location'

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['aid_request'])
        self.field_op = self.aid_request.field_op
        self.aid_location = get_object_or_404(AidLocation, pk=kwargs['pk'])
        # ic(vars(self))

    def get_success_url(self):
        return reverse_lazy('aid_request_detail',
                            kwargs={'field_op': self.field_op.slug,
                                    'pk': self.aid_request.pk}
                            )

    def form_valid(self, form):
        user = self.request.user
        if 'confirm' in self.request.POST:
            form.instance.status = 'confirmed'
            action = f'Location {self.object.pk} - Confirmed by {user}'
            # ic(get_object_or_404(AidLocation, pk=self.aid_location.pk).status)
        elif 'reject' in self.request.POST:
            form.instance.status = 'rejected'
            action = f'Location {self.object.pk} - Rejected by {user}'
        if user.is_authenticated:
            form.instance.updated_by = user
        else:
            form.instance.updated_by = None
        try:
            self.aid_location = form.save()
            # ic(get_object_or_404(AidLocation, pk=self.aid_location.pk).status)
        except Exception as e:
            ic(e)
            # ic(self.aid_request)
        try:
            self.aid_request.logs.create(
                log_entry=f'Location {self.aid_request.pk} - Action: {action}')
        except Exception as e:
            ic(f"Log Error: {e}")
        # ----- Send COT ------
        updated_at_stamp = self.aid_request.updated_at.strftime('%Y%m%d%H%M%S')
        tasks.async_task(aidrequest_takcot, aidrequest_id=self.aid_request.pk,
                         task_name=f"AidLocation{self.aid_location.pk}-StatusUpdate-SendCot-{updated_at_stamp}")

        return super().form_valid(form)
