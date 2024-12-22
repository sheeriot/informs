# core/context_processors.py
from django.conf import settings
from .models import FieldOp


def fieldops_active(request):
    if request.user.is_authenticated:
        fieldops_active = FieldOp.objects.all()
        return {'fieldops_active': fieldops_active}
    return {}


def basevars(request):
    return {
        'static_version': settings.STATIC_VERSION
    }
