"""
AidRequests Admin
"""

from django.contrib import admin
from .models import AidRequest, FieldOp, AidLocation, AidRequestLog

# Register your models here.


class AidRequestAdmin(admin.ModelAdmin):
    """aid request admin"""
    list_display = (
        'pk', 'field_op', 'assistance_type',
        'requestor_first_name', 'requestor_last_name',
        'group_size', 'created_by', 'updated_by')
    list_filter = ('field_op', 'assistance_type',)
    search_fields = (
        'requestor_first_name',
        'requestor_last_name',
        'street_address',
        'city',
        'assistance_description'
        )
    readonly_fields = (
        'field_op',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by'
        )

    def save_model(self, request, obj, form, change):
        # Set created_by only when creating a new object
        if not obj.pk:
            obj.created_by = request.user
        # Set updated_by on every save
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


class FieldOpAdmin(admin.ModelAdmin):
    """fieldops admin"""
    list_display = ('pk', 'slug', 'name')
    readonly_fields = (
        'created_at',
        'updated_at',
        'created_by',
        'updated_by'
        )

    def save_model(self, request, obj, form, change):
        # Set created_by only when creating a new object
        if not obj.pk:
            obj.created_by = request.user
        # Set updated_by on every save
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


class AidLocationAdmin(admin.ModelAdmin):
    """AidLocation admin"""
    list_display = ('aid_request', 'status', 'source', 'latitude', 'longitude', 'created_at')
    list_filter = ('aid_request',)
    readonly_fields = (
        'aid_request',
        'latitude',
        'longitude',
        'source',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by'
        )

    def save_model(self, request, obj, form, change):
        # Set created_by only when creating a new object
        if not obj.pk:
            obj.created_by = request.user
        # Set updated_by on every save
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)



class AidRequestLogAdmin(admin.ModelAdmin):
    """AidRequestLog admin"""
    list_display = ('aid_request', 'log_entry', 'created_at', 'created_by', 'updated_at', 'updated_by')
    list_filter = ('aid_request',)
    readonly_fields = (
        'created_at',
        'updated_at',
        'created_by',
        'updated_by'
        )

    def save_model(self, request, obj, form, change):
        # Set created_by only when creating a new object
        if not obj.pk:
            obj.created_by = request.user
        # Set updated_by on every save
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)

admin.site.register(AidRequest, AidRequestAdmin)
admin.site.register(FieldOp, FieldOpAdmin)
admin.site.register(AidLocation, AidLocationAdmin)
admin.site.register(AidRequestLog, AidRequestLogAdmin)