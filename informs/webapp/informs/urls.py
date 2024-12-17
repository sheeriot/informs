"""
URLs
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from debug_toolbar.toolbar import debug_toolbar_urls


from aidrequests.views.aid_request import (
     AidRequestCreateView,
     AidRequestListView,
     AidRequestUpdateView,
     # AidRequestDeleteView,
     AidRequestDetailView,
     AidRequestLogCreateView
     )

from aidrequests.views.field_op import (
     FieldOpCreateView,
     FieldOpListView,
     FieldOpUpdateView,
     # FieldOpDeleteView,
     FieldOpDetailView
     )

from aidrequests.views.export_csv import AidRequestCsvView

from aidrequests.views.aid_location import (
     AidLocationCreateView,
     AidLocationDeleteView,
     AidLocationStatusUpdateView,
     )

from .views import home


# from icecream import ic


urlpatterns = [
     path('', home, name='home'),
     path('admin/', admin.site.urls),
     path('accounts/', include('accounts.urls')),
     # path('aidrequests/', include('aidrequests.urls')),
     path('field_op/', FieldOpListView.as_view(), name='field_op_list'),
     path('field_op/<int:pk>/', FieldOpDetailView.as_view(), name='field_op_detail'),
     path('field_op/create/', FieldOpCreateView.as_view(), name='field_op_create'),
     path('field_op/<int:pk>/update/', FieldOpUpdateView.as_view(), name='field_op_update'),
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
          '<slug:field_op>/aidrequest/<int:aid_request>/location/<int:pk>/udpate',
          AidLocationStatusUpdateView.as_view(),
          name='aid_location_status_update'
          ),
     path(
          '<slug:field_op>/aidrequest/<int:pk>/addlog',
          AidRequestLogCreateView.as_view(),
          name='aid_request_addlog'
          ),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += debug_toolbar_urls()
