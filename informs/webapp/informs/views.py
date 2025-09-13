from django.shortcuts import render


def home(request):
    """
    Renders the home page.
    """
    return render(request, 'home.html')


def custom_404(request, exception):
    return render(request, '404.html', {'exception': exception}, status=404)


def custom_500(request):
    return render(request, '500.html', status=500)
