"""
URL configuration for informs project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from .views import home
from aidrequests.views.aidrequest import (AidRequestCreateView,
                                          AidRequestListView,
                                          AidRequestUpdateView,
                                          AidRequestDeleteView,
                                          AidRequestDetailView
                                          )

from aidrequests.views.field_op import (FieldOpCreateView,
                                        FieldOpListView,
                                        FieldOpUpdateView,
                                        FieldOpDeleteView,
                                        FieldOpDetailView
                                        )
from aidrequests.views.export_csv import AidRequestCsvView
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
]
