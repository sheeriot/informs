"""
URLs
"""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls import handler404, handler500
from django.shortcuts import render
# from debug_toolbar.toolbar import debug_toolbar_urls

from aidrequests.views.aid_location import (
    aid_location_status_update,
    AidLocationCreateView,
    AidLocationDeleteView,
)

from aidrequests.views.aid_location_add import (
    add_location,
    regenerate_static_map,
    delete_static_map,
    delete_aid_location
)

from aidrequests.views.aid_request import (
    AidRequestCreateView, ActionLogAddView, change_aid_request_type
)
from aidrequests.views.aid_request_detail import AidRequestDetailView, AidRequestSubmittedView
from aidrequests.views.aid_request_list import AidRequestListView
from aidrequests.views.aid_request_notify import AidRequestNotifyView

from aidrequests.views.ajax_aidrequest import get_aid_requests_json, update_aid_request

from aidrequests.views.ajax_sendcot import send_cot, sendcot_checkstatus

from aidrequests.views.ajax_fieldop import toggle_cot

from aidrequests.views.location import geocode_address

from aidrequests.views.aid_request_status import get_aid_request_status

from aidrequests.views.field_op import (
    FieldOpCreateView, FieldOpUpdateView, FieldOpDetailView
)

from aidrequests.views.field_op_list import FieldOpListView
from aidrequests.views.export_csv import AidRequestCsvView
from aidrequests.views.maps import check_map_status

from aidrequests.tasks import send_email
from aidrequests.views.htmx_views import (
    get_requester_info, edit_requester_info, save_requester_info,
    edit_detail_field, save_detail_field,
    get_action_logs_partial,
    get_action_log_edit_form, update_action_log, get_action_log_row,
    get_locations_list_partial, serve_map_file,
    get_aid_request_header_partial, get_audit_logs_partial,
    edit_address_info, save_address_info,
    get_aid_request_row, get_filter_counts,
    htmx_send_tak_alert, htmx_check_tak_status,
    aid_request_list_partial
)

from .views import home
# from .views.htmx_views import (
#     get_action_logs_partial, get_audit_logs_partial, get_action_log_row,
#     update_action_log, get_requester_info, edit_requester_info,
#     save_requester_info, edit_detail_field, save_detail_field
# )

# from icecream import ic


# API URLS
api_patterns = [
    # HTMX API URLs
    path('api/<slug:field_op>/aidrequest/<int:pk>/addlog',
        ActionLogAddView.as_view(), name='aid_request_addlog'),
    path('api/<slug:field_op>/aidrequest/<int:aid_request_pk>/action-log/<int:pk>/update/',
        update_action_log, name='update_action_log'),
    path('api/<slug:field_op>/aidrequest/<int:aid_request_pk>/action-log/<int:pk>/', get_action_log_row, name='get_action_log_row'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/action-logs/',
        get_action_logs_partial, name='get_action_logs_partial'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/audit-logs/',
        get_audit_logs_partial, name='get_audit_logs_partial'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/requester-info/',
        get_requester_info, name='get_requester_info'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/requester-info/edit/',
        edit_requester_info, name='edit_requester_info'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/requester-info/save/',
        save_requester_info, name='save_requester_info'),

    # Specific, multi-field editors first
    path('api/<slug:field_op>/aidrequest/<int:pk>/address/edit/', edit_address_info, name='edit_address_info'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/address/save/', save_address_info, name='save_address_info'),

    # Explicit patterns for single-field editors
    path('api/<slug:field_op>/aidrequest/<int:pk>/description/edit/', edit_detail_field, {'field_name': 'aid_description'}, name='edit_aid_description'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/description/save/', save_detail_field, {'field_name': 'aid_description'}, name='save_aid_description'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/supplies/edit/', edit_detail_field, {'field_name': 'supplies_needed'}, name='edit_supplies_needed'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/supplies/save/', save_detail_field, {'field_name': 'supplies_needed'}, name='save_supplies_needed'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/medical/edit/', edit_detail_field, {'field_name': 'medical_needs'}, name='edit_medical_needs'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/medical/save/', save_detail_field, {'field_name': 'medical_needs'}, name='save_medical_needs'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/welfare/edit/', edit_detail_field, {'field_name': 'welfare_check_info'}, name='edit_welfare_check_info'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/welfare/save/', save_detail_field, {'field_name': 'welfare_check_info'}, name='save_welfare_check_info'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/additional/edit/', edit_detail_field, {'field_name': 'additional_info'}, name='edit_additional_info'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/additional/save/', save_detail_field, {'field_name': 'additional_info'}, name='save_additional_info'),

    # API URLs from previous version
    path('api/<slug:field_op>/requests/', get_aid_requests_json, name='get_aid_requests_json'),
    path('api/<slug:field_op>/request/<int:pk>/update/', update_aid_request, name='aid_request_ajax_update'),
    path('api/<slug:field_op>/request/<int:pk>/row/', get_aid_request_row, name='get_aid_request_row'),
    path('api/<slug:field_op>/filter-counts/', get_filter_counts, name='get_filter_counts'),
    path('api/<slug:field_op>/toggle-cot/', toggle_cot, name='toggle_cot'),
    path('api/<slug:field_op>/send-cot/', send_cot, name='send_cot'),
    path('api/<slug:field_op>/sendcot-aidrequest/', send_cot, name='sendcot_aidrequest'),
    path('api/<slug:field_op>/sendcot-checkstatus/', sendcot_checkstatus, name='sendcot_checkstatus'),
    path('api/<slug:field_op>/geocode/', geocode_address, name='geocode_address'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/status/', get_aid_request_status, name='get_aid_request_status'),
    path('api/<slug:field_op>/aidlocation/<int:location_pk>/remap/', regenerate_static_map, name='static_map_regenerate'),
    path('api/<slug:field_op>/aidlocation/<int:pk>/delete/', delete_aid_location, name='api_aid_location_delete'),
    path('api/<slug:field_op>/aidlocation/<int:location_pk>/delete-map/', delete_static_map, name='delete_static_map'),
    path('api/<slug:field_op>/aidlocation/<int:pk>/status-update/', aid_location_status_update, name='aid_location_status_update'),
    path('api/<slug:field_op>/aidlocation/<int:pk>/check-map-status/', check_map_status, name='check_map_status'),
    path('api/<slug:field_op>/request/<int:pk>/send_email/', send_email, name='ajax_send_email'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/locations-list/', get_locations_list_partial, name='get_locations_list_partial'),
    path('api/<slug:field_op>/aidrequest/<int:aid_request_pk>/action-log/<int:pk>/edit/', get_action_log_edit_form, name='get_action_log_edit_form'),
    path('api/<slug:field_op>/aidrequest/<int:pk>/header/', get_aid_request_header_partial, name='get_aid_request_header'),
    # HTMX for TAK Alert
    path('api/<slug:field_op>/htmx/send-tak-alert/', htmx_send_tak_alert, name='htmx_send_tak_alert'),
    path('api/<slug:field_op>/htmx/check-tak-status/<str:task_id>/', htmx_check_tak_status, name='htmx_check_tak_status'),
]

urlpatterns = [
    path('', home, name='home'),
    path('admin/', admin.site.urls),
    path('accounts/', include('accounts.urls')),
    path('takservers/', include('takserver.urls')),
    # path('select2/', include('django_select2.urls')),
    path('tz_detect/', include('tz_detect.urls')),
    path('about/', TemplateView.as_view(template_name='pages/about.html'), name='about'),

    # Main Application URLs
    path('fieldops/', FieldOpListView.as_view(), name='field_op_list'),
    path('fieldops/new/', FieldOpCreateView.as_view(), name='field_op_create'),
    path('fieldop/<slug:slug>/update/', FieldOpUpdateView.as_view(), name='field_op_update'),

    # New URLs for FieldOp Detail View per user request
    path('fieldop/<slug:field_op>/', FieldOpDetailView.as_view(), name='field_op_detail_long'),
    path('<slug:field_op>/view/', FieldOpDetailView.as_view(), name='field_op_detail'),

    path('<slug:field_op>/requests/', AidRequestListView.as_view(), name='aid_request_list'),
    path('<slug:field_op>/requests/partial/', aid_request_list_partial, name='aid_request_list_partial'),
    path('<slug:field_op>/aidrequests/<str:status_group>/', AidRequestListView.as_view(), name='aid_request_list_by_status'),
    path('<slug:field_op>/aidrequest/<int:pk>/', AidRequestDetailView.as_view(), name='aid_request_detail'),
    path('<slug:field_op>/aidrequest/<int:pk>/notify/', AidRequestNotifyView.as_view(), name='aid_request_notify'),
    path('<slug:field_op>/aidrequest/<int:pk>/submitted/', AidRequestSubmittedView.as_view(), name='aid_request_submitted'),
    path('<slug:field_op>/aidrequest/<int:pk>/add-location/', add_location, name='add_location'),
    path('<slug:field_op>/aidrequest/<int:pk>/add-location-modal/', add_location, name='add_location_modal'), # Using same view but new name for clarity in HTMX
    path('<slug:field_op>/aidrequest/export-csv/', AidRequestCsvView.as_view(), {'action': 'export_csv'}, name='aid_requests_csv'),
    path('<slug:field_op>/aidrequest/<int:aid_request>/location/<int:pk>/delete', AidLocationDeleteView.as_view(), name='aid_location_delete'),
    path('<slug:field_op>/<int:pk>/',
        AidRequestDetailView.as_view(), name='aid_request_detail_short'),
    path('<slug:field_op>/<int:pk>/add_location',
        AidLocationCreateView.as_view(), name='aid_location_create'),
    path('<slug:field_op>/<int:pk>/locations/',
        get_locations_list_partial, name='get_locations_list'),
    path('<slug:field_op>/<int:pk>/change_type/',
        change_aid_request_type, name='change_aid_request_type'),
    path('<slug:field_op>/<int:aid_request_pk>/map/<str:filename>', serve_map_file, name='serve_map_file'),

    # This MUST be last of the slug patterns. Per user request, this is now the short URL to CREATE an aid request.
    path('<slug:field_op>/', AidRequestCreateView.as_view(), name='aid_request_create'),
]

urlpatterns += api_patterns

# Force a reload
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler404 = 'informs.views.custom_404'
handler500 = 'informs.views.custom_500'

if getattr(settings, 'DEBUG_TOOLBAR', False):
    import debug_toolbar
    urlpatterns += [
        path('__debug__/', include(debug_toolbar.urls)),
    ]
