from django.contrib import admin
from ..models import AidLocation


class AidLocationInline(admin.TabularInline):
    model = AidLocation
    extra = 0
    readonly_fields = ('uid',)
    fields = ('status', 'latitude', 'longitude', 'source', 'note', 'uid')
