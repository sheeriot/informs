from django.contrib import admin
from ..models import AidLocation


class AidLocationInline(admin.TabularInline):
    model = AidLocation
    extra = 0
