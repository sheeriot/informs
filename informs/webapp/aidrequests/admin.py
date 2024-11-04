from django.contrib import admin
from .models import AidRequest

# Register your models here.

class AidRequestAdmin(admin.ModelAdmin):
    pass

admin.site.register(AidRequest, AidRequestAdmin)
