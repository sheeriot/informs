from django.urls import path
from . import views
# from icecream import ic

urlpatterns = [
    path('signup/', views.signup, name='signup'),
    path('login/', views.login.as_view(), name='login'),
    path('logout/', views.logout, name='logout'),
]

# ic(urlpatterns)
