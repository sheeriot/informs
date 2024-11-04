from django.urls import path
from .views import (
    AidRequestListView,
    AidRequestDetailView,
    AidRequestCreateView,
    AidRequestUpdateView,
    AidRequestDeleteView,
)

urlpatterns = [
    path('', AidRequestListView.as_view(), name='aidrequest_list'),
    path('<int:pk>/', AidRequestDetailView.as_view(), name='aidrequest_detail'),
    path('create/', AidRequestCreateView.as_view(), name='aidrequest_create'),
    path('<int:pk>/update/', AidRequestUpdateView.as_view(), name='aidrequest_update'),
    path('<int:pk>/delete/', AidRequestDeleteView.as_view(), name='aidrequest_delete'),
]
