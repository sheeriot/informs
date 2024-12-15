"""
AidRequests Admin
"""

from django.contrib import admin
from django.db.models import Count

from .models import FieldOp, FieldOpNotify, AidRequest, AidRequestLog, AidLocation
from .views.aid_location_forms import AidLocationInline
from .views.aid_request_forms import AidRequestInline


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
    inlines = [AidLocationInline]

    def save_model(self, request, obj, form, change):
        # Set created_by only when creating a new object
        if not obj.pk:
            obj.created_by = request.user
        # Set updated_by on every save
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


class FieldOpAdmin(admin.ModelAdmin):
    """fieldops admin"""
    list_display = ('slug', 'name', 'notify_count', 'latitude', 'longitude')
    readonly_fields = (
        'latitude',
        'longitude',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by'
        )
    inlines = [AidRequestInline]
    # formfield_overrides = {
    #     models.ManyToManyField: {'widget': CheckboxSelectMultiple},
    # }
    filter_vertical = ('notify',)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(notify_count=Count("notify"))

    def notify_count(self, inst):
        return inst.notify_count

    def save_model(self, request, obj, form, change):
        # Set created_by only when creating a new object
        if not obj.pk:
            obj.created_by = request.user
        # Set updated_by on every save
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


class AidLocationAdmin(admin.ModelAdmin):
    """AidLocation admin"""
    list_display = ('aid_request', 'status', 'source', 'latitude', 'longitude', 'created_at', 'uid')
    list_filter = ('aid_request',)
    readonly_fields = (
        'aid_request',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by',
        'uid',
        'address_searched',
        'address_found',
        'map_filename',
        'distance'
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


class FieldOpNotifyAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'email', 'sms_number')
    search_fields = ('name', 'type', 'email', 'sms_number')

    # def save_model(self, request, obj, form, change):
    #     # Set created_by only when creating a new object
    #     if not obj.pk:
    #         obj.created_by = request.user
    #     # Set updated_by on every save
    #     obj.updated_by = request.user
    #     super().save_model(request, obj, form, change)


admin.site.register(FieldOp, FieldOpAdmin)
admin.site.register(FieldOpNotify, FieldOpNotifyAdmin)
admin.site.register(AidRequest, AidRequestAdmin)
admin.site.register(AidRequestLog, AidRequestLogAdmin)
admin.site.register(AidLocation, AidLocationAdmin)
