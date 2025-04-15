# core/context_processors.py
from django.conf import settings
from .models import FieldOp

"""
Important naming conventions:
- URL patterns use 'field_op' as the parameter name
- Context variables use 'fieldop_slug' for consistency
- HTML templates should use 'fieldop_slug' in data attributes
- JavaScript should read 'fieldop_slug' from body or container data attributes

This approach provides consistent access to the field operation slug
across all parts of the application.
"""

def fieldops_active(request):
    if request.user.is_authenticated:
        fieldops_active = FieldOp.objects.all()
        return {'fieldops_active': fieldops_active}
    return {}


def basevars(request):
    return {
        'static_version': settings.STATIC_VERSION
    }


def field_op_context(request):
    """
    Add field_op data to context for all templates.
    This can be used to maintain consistent URLs across the application.
    """
    if not request.user.is_authenticated:
        return {}

    # Extract field_op from URL path parameters
    field_op_slug = None

    # Check if 'field_op' is in URL kwargs (for class-based views)
    if hasattr(request, 'resolver_match') and request.resolver_match:
        field_op_slug = request.resolver_match.kwargs.get('field_op')

    if not field_op_slug:
        return {}

    try:
        field_op = FieldOp.objects.get(slug=field_op_slug)
        return {
            'field_op': field_op,
            'fieldop_slug': field_op_slug,
        }
    except FieldOp.DoesNotExist:
        return {}


def get_field_op_from_kwargs(kwargs):
    """
    Extract field_op object and slug from view kwargs.
    This is a utility function that can be used in view classes.

    Returns a tuple of (field_op, fieldop_slug)
    """
    field_op_slug = kwargs.get('field_op')
    if not field_op_slug:
        return None, None

    try:
        field_op = FieldOp.objects.get(slug=field_op_slug)
        return field_op, field_op_slug
    except FieldOp.DoesNotExist:
        return None, field_op_slug


def get_field_op_for_form(initial_data):
    """
    Extract field_op object from form initialization data.
    This is a utility function for Django forms.

    Returns a tuple of (field_op, fieldop_slug) or raises ValueError if not found
    """
    field_op_id = initial_data.get('field_op')
    fieldop_slug = initial_data.get('fieldop_slug')

    field_op = None

    if field_op_id:
        try:
            field_op = FieldOp.objects.get(id=field_op_id)
        except FieldOp.DoesNotExist:
            field_op = None

    if not field_op and fieldop_slug:
        try:
            field_op = FieldOp.objects.get(slug=fieldop_slug)
        except FieldOp.DoesNotExist:
            field_op = None

    if not field_op:
        raise ValueError("Valid field_op ID or fieldop_slug must be provided in initial data")

    return field_op, fieldop_slug
