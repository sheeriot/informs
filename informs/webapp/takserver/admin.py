from django.contrib import admin
# from django.db.models import Count

from .models import TakServer


class TakServerAdmin(admin.ModelAdmin):
    """TAK Service admin"""
    list_display = ('name', 'dns_name',)


admin.site.register(TakServer, TakServerAdmin)
