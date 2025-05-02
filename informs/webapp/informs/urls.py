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
from aidrequests.views.aid_request_list import AidRequestListView, update_aid_request
from aidrequests.views.aid_request_detail import AidRequestDetailView
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
     AidLocationStatusUpdateView,
     )

from aidrequests.views.ajax_sendcot import sendcot_aidrequest, sendcot_checkstatus
from aidrequests.views.ajax_fieldop import toggle_cot, send_cot

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
          '<slug:field_op>/aidrequest/<int:aid_request>/location/<int:pk>/update',
          AidLocationStatusUpdateView.as_view(),
          name='aid_location_status_update'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/addlog',
          AidRequestLogCreateView.as_view(),
          name='aid_request_addlog'
          ),
     path('api/<slug:field_op>/request/<int:pk>/update/', update_aid_request, name='aid_request_ajax_update'),
     path('api/<slug:field_op>/toggle-cot/', toggle_cot, name='toggle_cot'),
     path('api/<slug:field_op>/send-cot/', send_cot, name='send_cot'),
     path('api/<slug:field_op>/sendcot-aidrequest/', sendcot_aidrequest, name='sendcot_aidrequest'),
     path('api/<slug:field_op>/sendcot-checkstatus/', sendcot_checkstatus, name='sendcot_checkstatus'),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# urlpatterns += debug_toolbar_urls()
