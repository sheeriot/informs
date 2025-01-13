from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.views.generic import CreateView, UpdateView, DeleteView
from django.urls import reverse_lazy

from django_q import tasks

from geopy.distance import geodesic

from ..models import FieldOp, AidRequest, AidLocation
from ..tasks import aid_location_postsave
from .aid_location_forms import AidLocationCreateForm, AidLocationStatusForm

from icecream import ic


class AidLocationCreateView(LoginRequiredMixin, CreateView):
    """
    A Django class-based view for saving azure maps geocoded location
    """
    model = AidRequest
    form_class = AidLocationCreateForm
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
        try:
            self.object = form.save()
        except Exception as e:
            ic(e)
        # self.object.aid_request = self.aid_request

        user = self.request.user
        if user.is_authenticated:
            form.instance.created_by = user
            form.instance.updated_by = user
        else:
            form.instance.created_by = None
            form.instance.updated_by = None
        aid_request = form.instance.aid_request
        form.instance.distance = round(geodesic(
                    (aid_request.field_op.latitude, aid_request.field_op.longitude),
                    (form.instance.latitude, form.instance.longitude)
                    ).km, 2)
        self.object.save()
        # ----- post save starts here ------
        updated_at_stamp = self.object.updated_at.strftime('%Y%m%d%H%M%S')
        tasks.async_task(aid_location_postsave, self.object, kwargs={},
                         task_name=f"AidLocation{self.object.pk}-PostSave-{updated_at_stamp}")

        return super().form_valid(form)

    def form_invalid(self, form):
        ic(form.errors)
        return self.render_to_response(self.get_context_data(form=form))


class AidLocationDeleteView(LoginRequiredMixin, DeleteView):
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


class AidLocationStatusUpdateView(LoginRequiredMixin, UpdateView):
    model = AidLocation
    form_class = AidLocationStatusForm
    # template_name = 'aidrequests/aid_location_update.html'
    # context_object_name = 'aid_location'

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['aid_request'])
        self.field_op = self.aid_request.field_op

    def get_success_url(self):
        return reverse_lazy('aid_request_detail',
                            kwargs={'field_op': self.field_op.slug,
                                    'pk': self.aid_request.pk}
                            )

    def form_valid(self, form):
        user = self.request.user

        # Check which button was pressed
        if 'confirm' in self.request.POST:
            form.instance.status = 'confirmed'
            action = f'Location {self.object.pk} - Confirmed by {user}'
        elif 'reject' in self.request.POST:
            form.instance.status = 'rejected'
            action = f'Location {self.object.pk} - Rejected by {user}'
        if user.is_authenticated:
            form.instance.updated_by = user
        else:
            form.instance.updated_by = None
        try:
            self.object = form.instance.save(update_fields=['status', 'updated_by'])
        except Exception as e:
            ic(e)
        try:
            self.aid_request.logs.create(
                log_entry=f'{action}'
            )
        except Exception as e:
            ic(f"Log Error: {e}")
        return super().form_valid(form)
