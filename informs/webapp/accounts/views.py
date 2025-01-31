from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib import auth
from django.contrib.auth.views import LoginView
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

# import icecream as ic


class login(LoginView):
    template_name = 'login.html'

    def get_success_url(self):
        next_url = self.request.GET.get('next')
        if next_url:
            return next_url
        return super().get_success_url()


def signup(request):
    if request.method == 'POST':
        if request.POST['password1'] == request.POST['password2']:
            try:
                validate_password(request.POST['password1'])
            except ValidationError as e:
                return render(request, 'accounts/signup.html', {'error': e.messages})

            try:
                user = User.objects.get(username=request.POST['username'])
                return render(request, 'accounts/signup.html',
                              {'error': 'username has already been taken'})
            except User.DoesNotExist:
                user = User.objects.create_user(request.POST['username'], password=request.POST['password1'])
                user.user_permissions.set([])
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
