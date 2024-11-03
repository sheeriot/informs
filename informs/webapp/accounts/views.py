from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib import auth

import icecream as ic

from django.contrib.auth.views import LoginView

class login(LoginView):
    template_name = 'login.html'

    def get_success_url(self):
        next_url = self.request.GET.get('next')
        if next_url:
            return next_url
        return super().get_success_url()


# def login(request):
#     if request.method == 'POST':
#         ic(request)
#         # ic(request.POST)
#         user = auth.authenticate(username=request.POST['username'],
#                                  password=request.POST['password'])
#         if user is not None:
#             auth.login(request, user)
#             if 'next' in request.POST:
#                 ic('next in POST')
#                 return redirect(request.POST['next'])
#             else:
#                 return redirect('home')
#         else:
#             return render(request, 'accounts/login.html',
#                           {'error': 'username or password is incorrect'})
#     else:
#         return render(request, 'accounts/login.html')

def signup(request):
    if request.method == 'POST':
        if request.POST['password1'] == request.POST['password2']:
            try:
                user = User.objects.get(username=request.POST['username'])
                return render(request, 'accounts/signUp.html',
                              {'error': 'username has already been taken'})
            except User.DoesNotExist:
                user = User.objects.create_user(request.POST['username'], password=request.POST['password1'])
                auth.login(request, user)
                return redirect('home')
        else:
            return render(request, 'accounts/signup.html',
                          {'error': 'passwords do not match'})
    else:
        return render(request, 'accounts/signup.html')


def logout(request):
    if request.method == 'POST':
        auth.logout(request)
        return redirect('home')
