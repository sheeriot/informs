"""
URLs
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
# from debug_toolbar.toolbar import debug_toolbar_urls

from aidrequests.views.aid_request import (
     AidRequestCreateView,
     AidRequestUpdateView,
     AidRequestLogCreateView
     )
from aidrequests.views.aid_request_list import AidRequestListView
from aidrequests.views.ajax_views import update_aid_request
from aidrequests.views.aid_request_detail import AidRequestDetailView, AidRequestSubmittedView
from aidrequests.views.aid_request_notify import AidRequestNotifyView

from aidrequests.views.field_op import (
     FieldOpCreateView,
     FieldOpUpdateView,
     FieldOpDetailView
     )
from aidrequests.views.field_op_list import FieldOpListView

from aidrequests.views.export_csv import AidRequestCsvView

from aidrequests.views.aid_location import (
     AidLocationCreateView,
     AidLocationDeleteView,
     aid_location_status_update
     )
from aidrequests.views.aid_location_add import (
     add_location,
     regenerate_static_map,
     delete_aid_location,
     delete_static_map
)

from aidrequests.views.ajax_sendcot import send_cot, sendcot_checkstatus
from aidrequests.views.ajax_fieldop import toggle_cot
from aidrequests.views.location import geocode_address
from aidrequests.views.aid_request_status import get_aid_request_status
from aidrequests.views.maps import check_map_status

from .views import home


# from icecream import ic


urlpatterns = [
     path('', home, name='home'),
     path('admin/', admin.site.urls),
     path('accounts/', include('accounts.urls')),
     path('fieldop/', FieldOpListView.as_view(), name='field_op_list'),
     path('fieldop/create/', FieldOpCreateView.as_view(), name='field_op_create'),
     path('fieldop/<slug:slug>/', FieldOpDetailView.as_view(), name='field_op_detail'),
     path('fieldop/<slug:slug>/update/', FieldOpUpdateView.as_view(), name='field_op_update'),
     # path('fieldop/map/', FieldOpMapView.as_view(), name='field_op_map'),
     # path('field_op/<int:pk>/delete/', FieldOpDeleteView.as_view(), name='field_op_delete'),
     path('tz_detect/', include('tz_detect.urls')),
     path('<slug:field_op>/', AidRequestCreateView.as_view(), name='aid_request_new'),
     path('<slug:field_op>/aidrequest/', AidRequestCreateView.as_view(), name='aid_request_create'),
     path('<slug:field_op>/aidrequest/list/', AidRequestListView.as_view(), name='aid_request_list'),
     path('<slug:field_op>/aidrequest/list/<str:status_group>/', AidRequestListView.as_view(), name='aid_request_list'),
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
          AidRequestLogCreateView.as_view(),
          name='aid_request_addlog'
          ),
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
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# urlpatterns += debug_toolbar_urls()
