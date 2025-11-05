import json
from django.shortcuts import get_object_or_404, render
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.urls import reverse_lazy, reverse
from django.views.generic import CreateView, UpdateView
from django.conf import settings
from django.http import Http404, HttpResponseRedirect, JsonResponse, HttpResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import user_passes_test

from django_q.tasks import async_task

from icecream import ic

from ..models import AidRequest, FieldOp, ActionLog, AidLocation, AidType
from ..tasks import aid_request_postsave
from ..forms import (
    AidRequestCreateFormA,
    RequesterInformationForm,
    LocationInformationForm,
    RequestDetailsForm,
    RequestStatusForm,
    ActionLogForm,
)
from .aid_request_forms_b import AidRequestCreateFormB
from .aid_request_forms_c import AidRequestCreateFormC
from .aid_location_forms import AidLocationCreateForm
from ..context_processors import get_field_op_from_kwargs


def get_client_ip(request):
    """Get client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

# Create View for AidRequest
class AidRequestCreateView(CreateView):
    """ Aid Request - Create """
    model = AidRequest
    template_name = 'aidrequests/aid_request_form.html'
    success_url = reverse_lazy('home')

    FORM_CLASSES = {
        'A': AidRequestCreateFormA,
        'B': AidRequestCreateFormB,
        'C': AidRequestCreateFormC,
    }
    DEFAULT_FORM = 'C'

    def get_form_class(self):
        form_key = self.request.GET.get('form', self.DEFAULT_FORM).upper()
        return self.FORM_CLASSES.get(form_key, self.FORM_CLASSES[self.DEFAULT_FORM])

    def dispatch(self, request, *args, **kwargs):
        try:
            self.field_op = FieldOp.objects.get(slug=kwargs.get('field_op'))
            self.fieldop_slug = self.field_op.slug
        except FieldOp.DoesNotExist:
            return render(request, 'aidrequests/field_op_not_found.html', {'field_op_slug': kwargs.get('field_op')})

        if self.field_op.aid_types.count() == 0:
            return render(request, 'aidrequests/field_op_misconfigured.html', {'field_op': self.field_op})

        return super().dispatch(request, *args, **kwargs)

    def get_template_names(self):
        form_key = self.request.GET.get('form', self.DEFAULT_FORM).upper()
        if form_key == 'C':
            return ['aidrequests/aid_request_form_c.html']
        return super().get_template_names()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['field_op'] = self.field_op
        context['fieldop_slug'] = self.fieldop_slug
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY
        context['hide_auth_header_items'] = True
        context['New'] = self.object is None
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['request'] = self.request
        kwargs.setdefault('initial', {})
        kwargs['initial']['field_op'] = self.field_op.pk
        kwargs['initial']['fieldop_slug'] = self.fieldop_slug
        return kwargs

    def form_valid(self, form):
        self.object = form.save(commit=False)
        self.object.field_op = get_object_or_404(FieldOp, slug=self.kwargs['field_op'])

        if self.request.user.is_authenticated:
            self.object.requester_first_name = self.request.user.first_name
            self.object.requester_last_name = self.request.user.last_name
            self.object.created_by = self.request.user
            self.object.updated_by = self.request.user
        else:
            self.object.created_by = None
            self.object.updated_by = None

        # If there is only one aid_type, assign it automatically.
        if self.object.field_op.aid_types.count() == 1 and not self.object.aid_type:
            self.object.aid_type = self.object.field_op.aid_types.first()

        source_ip = get_client_ip(self.request)
        self.object.save(source_ip=source_ip)

        latitude = form.cleaned_data.get('latitude')
        longitude = form.cleaned_data.get('longitude')
        location_freeform_address = form.cleaned_data.get('location_freeform_address')

        geocode_json_str = form.cleaned_data.get('geocode_json')
        geocode_json = None
        if geocode_json_str:
            try:
                geocode_json = json.loads(geocode_json_str)
            except json.JSONDecodeError:
                geocode_json = None

        if latitude and longitude:
            location_creator = self.request.user if self.request.user.is_authenticated else None
            AidLocation.objects.create(
                aid_request=self.object,
                latitude=latitude,
                longitude=longitude,
                source=form.cleaned_data.get('location_source'),
                geocode_json=geocode_json,
                free_form_address=location_freeform_address,
                status='confirmed',
                created_by=location_creator,
                updated_by=location_creator
            )

        task_name = f"AR{self.object.pk}_postsave"
        async_task('aidrequests.tasks.aid_request_postsave',
            self.object.pk,
            is_new=True,
            task_name=task_name,
        )

        # Redirect to the list view for this field_op after creating
        self.success_url = reverse_lazy('aid_request_submitted', kwargs={'field_op': self.fieldop_slug, 'pk': self.object.pk})
        return super().form_valid(form)

    def form_invalid(self, form):
        return super().form_invalid(form)


# Update View for AidRequest is now handled by AidRequestDetailView
# class AidRequestUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
#     model = AidRequest
#     form_class = RequesterInformationForm  # Default form, though we use multiple
#     permission_required = 'aidrequests.change_aidrequest'
#     template_name = 'aidrequests/aid_request_update.html'

#     def dispatch(self, request, *args, **kwargs):
#         self.object = self.get_object()
#         self.field_op = self.object.field_op
#         self.fieldop_slug = self.field_op.slug
#         return super().dispatch(request, *args, **kwargs)

#     def get_context_data(self, **kwargs):
#         context = super().get_context_data(**kwargs)
#         context['field_op'] = self.field_op
#         context['aid_request'] = self.object  # Add this for consistency with DetailView
#         context['MEDIA_URL'] = settings.MEDIA_URL
#         context['AZURE_MAPS_KEY'] = settings.AZURE_MAPS_KEY

#         # Get locations and sort them
#         all_locations = self.object.locations.all()
#         status_order = {'confirmed': 0, 'new': 1, 'candidate': 2, 'rejected': 3, 'other': 4}
#         sorted_locations = sorted(
#             all_locations,
#             key=lambda loc: (status_order.get(loc.status, 99), -loc.created_at.timestamp())
#         )
#         context['locations'] = sorted_locations

#         # Add Location Form
#         context['add_location_form'] = AidLocationCreateForm(
#             field_op_obj=self.field_op,
#             aid_request_obj=self.object,
#             initial={
#                 'field_op': self.fieldop_slug,
#                 'aid_request': self.object.pk,
#                 'country': self.field_op.country,
#                 'status': 'new',
#                 'source': 'manual'
#             }
#         )

#         instance = self.object
#         context['requester_form'] = RequesterInformationForm(instance=instance)
#         context['location_form'] = LocationInformationForm(instance=instance)
#         context['details_form'] = RequestDetailsForm(instance=instance)
#         context['status_form'] = RequestStatusForm(instance=instance)

#         if self.request.user.is_superuser:
#             context['aid_types'] = self.field_op.aid_types.all()

#         return context

#     def get_success_url(self):
#         return reverse_lazy('aid_request_update', kwargs={'pk': self.object.pk, 'field_op': self.object.field_op.slug})

#     def get_form_kwargs(self):
#         kwargs = super().get_form_kwargs()
#         kwargs.setdefault('initial', {})
#         kwargs['initial']['fieldop_slug'] = self.fieldop_slug
#         return kwargs


class ActionLogAddView(LoginRequiredMixin, PermissionRequiredMixin, CreateView):
    model = ActionLog
    form_class = ActionLogForm
    permission_required = 'aidrequests.add_actionlog'

    def setup(self, request, *args, **kwargs):
        """Initialize attributes shared by all view methods."""
        super().setup(request, *args, **kwargs)
        self.aid_request = get_object_or_404(AidRequest, pk=self.kwargs['pk'])
        self.fieldop_slug = self.kwargs['field_op']

    def form_valid(self, form):
        self.object = form.save(commit=False)
        self.object.aid_request = self.aid_request
        self.object.created_by = self.request.user
        self.object.agent_name = self.request.user.username
        self.object.log_type = 'user'
        self.object.note = form.cleaned_data.get('note', '')
        self.object.note_markdown = form.cleaned_data.get('enable_markdown', False)
        self.object.save()
        return render(self.request, 'aidrequests/partials/_action_log_row.html', {'log': self.object})

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {
            'aid_request': self.aid_request.pk,
            'fieldop_slug': self.fieldop_slug
        }
        return kwargs


@require_POST
@user_passes_test(lambda u: u.is_superuser)
def change_aid_request_type(request, field_op, pk):
    ic("Entering change_aid_request_type view")
    ic(request.POST)
    try:
        aid_request = get_object_or_404(AidRequest, pk=pk, field_op__slug=field_op)
        ic(aid_request)
        new_aid_type_id = request.POST.get('aid_type')
        ic(new_aid_type_id)

        if not new_aid_type_id:
            ic("new_aid_type_id is missing")
            return JsonResponse({'status': 'error', 'message': 'Aid Type not provided.'}, status=400)

        new_aid_type = get_object_or_404(AidType, pk=new_aid_type_id)
        ic(new_aid_type)

        original_aid_type_name = aid_request.aid_type.name
        aid_request.aid_type = new_aid_type
        aid_request.save()

        # Add a log entry for this change
        ActionLog.objects.create(
            aid_request=aid_request,
            log_type='system',
            event_name="Aid Type Changed",
            event_text=f"Aid type changed from '{original_aid_type_name}' to '{new_aid_type.name}'.",
            created_by=request.user,
            agent_name=request.user.username,
        )

        response_html = f'<span id="aid-type-display" class="fw-normal" hx-swap-oob="true">{new_aid_type.name}</span>'
        response = HttpResponse(response_html)
        response['HX-Trigger'] = 'actionLogUpdated, auditLogUpdated'
        return response

    except Exception as e:
        ic(e)
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
