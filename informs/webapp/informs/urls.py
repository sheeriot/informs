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
from aidrequests.views import (AidRequestCreateView,
                               AidRequestListView, AidRequestUpdateView,
                               AidRequestDeleteView, AidRequestDetailView,
                               RegionResponseCreateView,
                               RegionResponseListView, RegionResponseUpdateView,
                               RegionResponseDeleteView, RegionResponseDetailView,)
# from icecream import ic


urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('accounts.urls')),
    # path('aidrequests/', include('aidrequests.urls')),
    path('regionresponse/', RegionResponseListView.as_view(), name='regionresponse_list'),
    path('regionresponse/<int:pk>/', RegionResponseDetailView.as_view(), name='regionresponse_detail'),
    path('regionresponse/create/', RegionResponseCreateView.as_view(), name='regionresponse_create'),
    path('regionresponse/<int:pk>/update/', RegionResponseUpdateView.as_view(), name='regionresponse_update'),
    path('regionresponse/<int:pk>/delete/', RegionResponseDeleteView.as_view(), name='regionresponse_delete'),
    path('', home, name='home'),
    path('tz_detect/', include('tz_detect.urls')),
    path('<slug:regionresponse>/', AidRequestCreateView.as_view(), name='aidrequest_new'),
    path('<slug:regionresponse>/aidrequest/', AidRequestCreateView.as_view(), name='aidrequest_create'),
    path('<slug:regionresponse>/aidrequest/list/', AidRequestListView.as_view(), name='aidrequest_list'),
    path('<slug:regionresponse>/aidrequest/<int:pk>/update/',
         AidRequestUpdateView.as_view(),
         name='aidrequest_update'
         ),
    path('<slug:regionresponse>/aidrequest/<int:pk>/delete/',
         AidRequestDeleteView.as_view(),
         name='aidrequest_delete'
         ),
    path('<slug:regionresponse>/aidrequest/<int:pk>/',
         AidRequestDetailView.as_view(),
         name='aidrequest_detail'
         ),
]
