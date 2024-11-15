"""
URLs
"""

from django.contrib import admin
from django.urls import path, include

from aidrequests.views.aidrequest import (AidRequestCreateView,
                                          AidRequestListView,
                                          AidRequestUpdateView,
                                          AidRequestDeleteView,
                                          AidRequestDetailView,
                                          AddressValidationView
                                          )

from aidrequests.views.field_op import (FieldOpCreateView,
                                        FieldOpListView,
                                        FieldOpUpdateView,
                                        FieldOpDeleteView,
                                        FieldOpDetailView
                                        )

from aidrequests.views.export_csv import AidRequestCsvView

from .views import home


# from icecream import ic


urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('accounts.urls')),
    # path('aidrequests/', include('aidrequests.urls')),
    path('field_op/', FieldOpListView.as_view(), name='field_op_list'),
    path('field_op/<int:pk>/', FieldOpDetailView.as_view(), name='field_op_detail'),
    path('field_op/create/', FieldOpCreateView.as_view(), name='field_op_create'),
    path('field_op/<int:pk>/update/', FieldOpUpdateView.as_view(), name='field_op_update'),
    path('field_op/<int:pk>/delete/', FieldOpDeleteView.as_view(), name='field_op_delete'),
    path('', home, name='home'),
    path('tz_detect/', include('tz_detect.urls')),
    path('<slug:field_op>/', AidRequestCreateView.as_view(), name='aidrequest_new'),
    path('<slug:field_op>/aidrequest/', AidRequestCreateView.as_view(), name='aidrequest_create'),
    path('<slug:field_op>/aidrequest/list/', AidRequestListView.as_view(), name='aidrequest_list'),
    path('<slug:field_op>/aidrequest/<int:pk>/update/',
         AidRequestUpdateView.as_view(),
         name='aidrequest_update'
         ),
    path('<slug:field_op>/aidrequest/<int:pk>/delete/',
         AidRequestDeleteView.as_view(),
         name='aidrequest_delete'
         ),
    path('<slug:field_op>/aidrequest/<int:pk>/',
         AidRequestDetailView.as_view(),
         name='aidrequest_detail'
         ),

    path('<slug:field_op>/aidrequest/export-csv/',
         AidRequestCsvView.as_view(),
         {'action': 'export_csv'},
         name='aidrequests_csv'
         ),
    path('<slug:field_op>/aidrequest/<int:pk>/addresser',
         AddressValidationView.as_view(),
         name='aidrequest_addresser'
         ),
]
