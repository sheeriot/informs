from django import forms
from django.shortcuts import redirect, get_object_or_404
from django.views.generic import DetailView
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django_q import tasks
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Submit

from ..models import FieldOp, AidRequest, FieldOpNotify
from ..tasks import aid_request_notify

from datetime import datetime

# from icecream import ic


class AidRequestNotifyForm(forms.Form):
    field_op = forms.CharField(widget=forms.HiddenInput())
    notify_destinations = forms.ModelMultipleChoiceField(
        queryset=FieldOpNotify.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        required=False
    )
    email_additional = forms.EmailField(
        label='Additional Email:',
        required=False,
        max_length=64,
        widget=forms.TextInput(attrs={'style': 'max-width: 30em'}),)

    def __init__(self, *args, **kwargs):
        super(AidRequestNotifyForm, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.add_input(Submit('submit', 'Notify Selected', css_class='btn-primary'))

        if 'initial' in kwargs:
            # field_op = get_object_or_404(FieldOp, id=kwargs['initial']['field_op'])
            kwargs_init = kwargs['initial']
            if kwargs_init['notify_destinations'] is not None:
                self.fields['notify_destinations'].queryset = kwargs_init['notify_destinations']


class AidRequestNotifyView(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    permission_required = 'aidrequests.view_aidrequest'
    model = AidRequest
    template_name = 'aidrequests/aid_request_notify.html'
    form_class = AidRequestNotifyForm

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        self.field_op = get_object_or_404(FieldOp, slug=kwargs['field_op'])
        self.aid_request = get_object_or_404(AidRequest, pk=kwargs['pk'])
        self.object = self.aid_request

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        if "form" not in context:
            initial_data = {
                'field_op': self.field_op.pk,
                'notify_destinations': self.field_op.notify.all(),
                }
            context['form'] = AidRequestNotifyForm(initial=initial_data)
        context['form'].fields['notify_destinations'].choices = [
            (notify.id, notify.name) for notify in self.field_op.notify.all()
        ]
        return context

    def post(self, request, *args, **kwargs):
        timestamp = datetime.now().isoformat()
        self.object = self.get_object()
        form = AidRequestNotifyForm(request.POST)
        if form.is_valid():
            notifies = form.cleaned_data['notify_destinations']
            email_extra = form.cleaned_data['email_additional']
            if not notifies and not email_extra:
                form.add_error(
                    None,
                    'Please select at least one notification destination, '
                    'or provide an additional email. Note, SMS is not implemented.'
                )
                return self.render_to_response(self.get_context_data(form=form))
            tasks.async_task(
                        aid_request_notify,
                        self.object,
                        kwargs={
                            'notifies': notifies,
                            'email_extra': email_extra},
                        task_name=f"AR{self.object.pk}-Notifications-Manual-{timestamp}")
            return redirect('aid_request_detail', field_op=self.get_object().field_op.slug, pk=self.get_object().pk)
        else:
            return self.render_to_response(self.get_context_data(form=form))
