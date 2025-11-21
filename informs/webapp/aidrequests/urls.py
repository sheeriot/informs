"""
URLs for aidrequests app - currently not in use as all URLs are defined in root urls.py
"""
from django.urls import path
from .views.aid_request_list import AidRequestListView
from .views.aid_request import AidRequestCreateView, AidRequestDeleteView  # AidRequestUpdateView
from .views.aid_request_detail import AidRequestDetailView, AidRequestSubmittedView, get_task_status
from .views.htmx_views import (
    edit_detail_field, save_detail_field,
    edit_requester_info, save_requester_info,
    edit_address_info, save_address_info
)
from .views.ajax_aidrequest import update_aid_request
from .views.aid_location import aid_location_status_update
from .views.aid_location_add import add_location, delete_aid_location
from .views.field_op import FieldOpListView, FieldOpDetailView, FieldOpCreateView, FieldOpUpdateView
from .views.maps import serve_map_image
from .views.ajax_fieldop import get_fieldop_details
from .views.ajax_sendcot import send_cot
# from .views.curator import CuratorView
from .views.export_csv import export_aid_requests_csv
from .views.field_op import FieldOpCreateView, FieldOpDetailView, FieldOpUpdateView
from .views.field_op_list import FieldOpListView
from .views.location import get_geocode
from .views.aid_location import (
    AidLocationUpdateView,
    AidLocationCreateView,
    AidLocationDeleteView,
    add_location,
    regenerate_static_map,
    delete_static_map,
    delete_aid_location
)
from .views.maps import check_map_status
from .views.aid_location_forms import AidLocationUpdateStatusView
from .views.aid_request_status import get_aid_request_status
from .views.aid_request_update_partial import partial_update_aid_request

app_name = 'aidrequests'

urlpatterns = [
    path('', FieldOpListView.as_view(), name='field_op_list'),
    path('<slug:field_op_slug>/', AidRequestCreateView.as_view(), name='aid_request_create'),
    path('aidrequest/<int:pk>/', AidRequestDetailView.as_view(), name='aid_request_detail'),
    path('aidrequest/<int:pk>/submitted/', AidRequestSubmittedView.as_view(), name='aid_request_submitted'),
    path('task_status/<str:task_id>/', get_task_status, name='get_task_status'),
    path('check_map_status/<str:task_id>/', check_map_status, name='check_map_status'),

    # Secure Map Serving
    path('<slug:field_op_slug>/<int:aid_request_pk>/map/<str:map_filename>', serve_map_image, name='serve_map_image'),

    # HTMX partials/modals
    path('htmx/edit-detail-field/<int:pk>/<str:field_name>/', edit_detail_field, name='edit_detail_field'),
    path('htmx/save-detail-field/<int:pk>/<str:field_name>/', save_detail_field, name='save_detail_field'),
]
