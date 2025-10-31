"""
URLs
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls import handler404, handler500
from django.shortcuts import render
# from debug_toolbar.toolbar import debug_toolbar_urls

from aidrequests.views import (
    get_aid_requests_json,
    update_aid_request,
    AidRequestCreateView,
    AidRequestUpdateView,
    ActionLogCreateView,
    change_aid_request_type,
    AidRequestDetailView,
    AidRequestSubmittedView,
    AidRequestListView,
    AidRequestNotifyView,
    FieldOpCreateView,
    FieldOpUpdateView,
    FieldOpDetailView,
    FieldOpListView,
    AidRequestCsvView,
    AidLocationCreateView,
    AidLocationDeleteView,
    aid_location_status_update,
    add_location,
    regenerate_static_map,
    delete_aid_location,
    delete_static_map,
    send_cot,
    sendcot_checkstatus,
    toggle_cot,
    geocode_address,
    get_aid_request_status,
    check_map_status,
    send_email,
    get_action_logs_partial,
    get_audit_logs_partial,
    get_locations_list_partial,
    get_action_log_edit_form,
    update_action_log,
    get_action_log_row,
)

from .views import home


# from icecream import ic


urlpatterns = [
     path('', home, name='home'),
     path('admin/', admin.site.urls),
     path('accounts/', include('accounts.urls')),
     path('fieldops/', FieldOpListView.as_view(), name='field_op_list'),
     path('fieldop/create/', FieldOpCreateView.as_view(), name='field_op_create'),
     path('fieldop/<slug:slug>/', FieldOpDetailView.as_view(), name='field_op_detail'),
     path('fieldop/<slug:slug>/update/', FieldOpUpdateView.as_view(), name='field_op_update'),
     # path('fieldop/map/', FieldOpMapView.as_view(), name='field_op_map'),
     # path('field_op/<int:pk>/delete/', FieldOpDeleteView.as_view(), name='field_op_delete'),
     path('tz_detect/', include('tz_detect.urls')),
     path('<slug:field_op>/aidrequest/', AidRequestCreateView.as_view(), name='aid_request_create'),
     path('<slug:field_op>/aidrequests/', AidRequestListView.as_view(), name='aid_request_list'),
     path('<slug:field_op>/aidrequests/<str:status_group>/', AidRequestListView.as_view(), name='aid_request_list_by_status'),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/update/',
          AidRequestUpdateView.as_view(),
          name='aid_request_update'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/notify/',
          AidRequestNotifyView.as_view(),
          name='aid_request_notify'
          ),
     # path(
     #      '<slug:field_op>/aid_request/<int:pk>/delete/',
     #      AidRequestDeleteView.as_view(),
     #      name='aid_request_delete'
     #      ),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/',
          AidRequestDetailView.as_view(),
          name='aid_request_detail'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/submitted/',
          AidRequestSubmittedView.as_view(),
          name='aid_request_submitted'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/add-location/',
          add_location,
          name='add_location'
          ),
     path(
          '<slug:field_op>/aidrequest/export-csv/',
          AidRequestCsvView.as_view(),
          {'action': 'export_csv'},
          name='aid_requests_csv'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:aid_request>/location',
          AidLocationCreateView.as_view(),
          name='aid_location_create'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:aid_request>/location/<int:pk>/delete',
          AidLocationDeleteView.as_view(),
          name='aid_location_delete'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/addlog',
          ActionLogCreateView.as_view(),
          name='aid_request_addlog'
          ),
     path('api/<slug:field_op>/requests/', get_aid_requests_json, name='get_aid_requests_json'),
     path('api/<slug:field_op>/request/<int:pk>/update/', update_aid_request, name='aid_request_ajax_update'),
     path('api/<slug:field_op>/toggle-cot/', toggle_cot, name='toggle_cot'),
     path('api/<slug:field_op>/send-cot/', send_cot, name='send_cot'),
     path('api/<slug:field_op>/sendcot-aidrequest/', send_cot, name='sendcot_aidrequest'),
     path('api/<slug:field_op>/sendcot-checkstatus/', sendcot_checkstatus, name='sendcot_checkstatus'),
     path('api/<slug:field_op>/geocode/', geocode_address, name='geocode_address'),
     path('api/<slug:field_op>/aidrequest/<int:pk>/status/', get_aid_request_status, name='get_aid_request_status'),
     path('api/<slug:field_op>/aidlocation/<int:location_pk>/remap/', regenerate_static_map, name='static_map_regenerate'),
     path('api/<slug:field_op>/aidlocation/<int:location_pk>/delete/', delete_aid_location, name='api_aid_location_delete'),
     path('api/<slug:field_op>/aidlocation/<int:location_pk>/delete-map/', delete_static_map, name='delete_static_map'),
     path('api/<slug:field_op>/aidlocation/<int:location_pk>/status-update/', aid_location_status_update, name='aid_location_status_update'),
     path('api/<slug:field_op>/aidlocation/<int:location_pk>/check-map-status/', check_map_status, name='check_map_status'),
     path('api/<slug:field_op>/request/<int:pk>/send_email/', send_email, name='ajax_send_email'),
     path('api/<slug:field_op>/aidrequest/<int:pk>/action-logs/', get_action_logs_partial, name='get_action_logs_partial'),
     path('api/<slug:field_op>/aidrequest/<int:pk>/audit-logs/', get_audit_logs_partial, name='get_audit_logs_partial'),
     path('api/<slug:field_op>/aidrequest/<int:pk>/locations-list/', get_locations_list_partial, name='get_locations_list_partial'),
     path('api/action-log/<int:pk>/edit/', get_action_log_edit_form, name='get_action_log_edit_form'),
     path('api/action-log/<int:pk>/update/', update_action_log, name='update_action_log'),
     path('api/action-log/<int:pk>/', get_action_log_row, name='get_action_log_row'),
     path('<str:field_op>/<int:pk>/change_type/', change_aid_request_type, name='change_aid_request_type'),
     # path('<str:field_op>/aidrequests/', AidRequestListView.as_view(), name='aid_requests_by_field_op'),
     path('<slug:field_op>/', AidRequestCreateView.as_view(), name='aid_request_new'),
]

urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler404 = 'informs.views.custom_404'
handler500 = 'informs.views.custom_500'

# urlpatterns += debug_toolbar_urls()
