# core/context_processors.py

from .models import RegionResponse


def fieldops_active(request):
    if request.user.is_authenticated:
        fieldops_active = RegionResponse.objects.all()
        return {'fieldops_active': fieldops_active}
    return {}
