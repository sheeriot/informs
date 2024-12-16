from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import CreateView, UpdateView, DeleteView
from django.urls import reverse_lazy

from ..models import FieldOp, AidRequest, AidLocation
from .geocode_form import AidLocationForm
from .aid_location_forms import AidLocationStatusForm
from icecream import ic


class AidLocationCreateView(LoginRequiredMixin, CreateView):
    """
    A Django class-based view for saving azure maps geocoded location
    """
    model = AidRequest
    form_class = AidLocationForm
    template_name = 'aidrequests/aid_request_geocode.html'

    def get_success_url(self):
        ic(self)
        ic(vars(self))
        return reverse_lazy('aid_request_detail',
                            kwargs={'field_op': self.field_op.slug,
                                    'pk': self.aid_request.pk}
                            )

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        ic('setup aidlocation createview')
        self.kwargs = kwargs
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])

    # def get_form_kwargs(self):
    #     kwargs = super().get_form_kwargs()
    #     return kwargs

    def form_valid(self, form):
        try:
            self.object = form.save()
        except Exception as e:
            ic(e)
        self.object.aid_request = self.aid_request
        ic(self.aid_request)
        user = self.request.user
        if user.is_authenticated:
            form.instance.created_by = user
            form.instance.updated_by = user
        else:
            form.instance.created_by = None
            form.instance.updated_by = None
        self.object.save()
        return super().form_valid(form)

    def form_invalid(self, form):
        ic('form_invalid')
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
    context_object_name = 'aid_location'

    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['aid_request'])
        self.field_op = self.aid_request.field_op

    def get_success_url(self):
        ic(self)
        ic(vars(self))
        return reverse_lazy('aid_request_detail',
                            kwargs={'field_op': self.field_op.slug,
                                    'pk': self.aid_request.pk}
                            )

    def form_valid(self, form):
        # Check which button was pressed
        if 'confirm' in self.request.POST:
            form.instance.status = 'confirmed'
        elif 'reject' in self.request.POST:
            form.instance.status = 'rejected'
        return super().form_valid(form)
