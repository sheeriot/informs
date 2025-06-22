"""
URLs for aidrequests app - currently not in use as all URLs are defined in root urls.py
"""
from django.urls import path
from .views.aid_request_list import AidRequestListView
from .views.aid_request import AidRequestCreateView, AidRequestUpdateView, AidRequestDeleteView
from .views.aid_request_detail import AidRequestDetailView, AidRequestSubmittedView
from .views.aid_request_forms_a import AidRequestLogCreateView
from .views.aid_request_notify import AidRequestNotifyView
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


urlpatterns = [
    # This file is not currently used.
    # All URLs are defined in informs.urls.py
]
