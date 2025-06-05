from django import template
from django.template.defaultfilters import stringfilter
from datetime import timedelta

# from icecream import ic
from django.utils import timezone

register = template.Library()


@register.filter
def age_color(date):
    now = timezone.now()
    if timezone.is_naive(now):
        now = timezone.make_aware(now)
    if now - date > timedelta(weeks=1):
        return 'danger'
    elif now - date > timedelta(days=1):
        return 'warning'
    else:
        return 'primary'


@register.filter
@stringfilter
def upto(value, delimiter=None):
    return value.split(delimiter)[0]


upto.is_safe = True


@register.filter
def get_item(dictionary, key):
    """
    Get item from dictionary by key
    Usage: {{ mydict|get_item:key_variable }}
    """
    if key is None:
        return None
    return dictionary.get(key, None)


@register.filter
@stringfilter
def status_bootstrap_color(status):
    """
    Convert status values to Bootstrap color classes
    Usage: {{ status_value|status_bootstrap_color }}
    """
    status_colors = {
        'new': 'warning',
        'assigned': 'primary',
        'resolved': 'info',
        'closed': 'success',
        'rejected': 'danger',
        'other': 'secondary'
    }
    return status_colors.get(status.lower(), 'secondary')


@register.filter
@stringfilter
def priority_bootstrap_color(priority):
    """
    Convert priority values to Bootstrap color classes
    Usage: {{ priority_value|priority_bootstrap_color }}
    """
    priority_colors = {
        'high': 'danger',
        'medium': 'warning',
        'low': 'info',
        'none': 'secondary'
    }
    return priority_colors.get(priority.lower(), 'secondary')


@register.filter
def active_status_count(status_counts, active_statuses):
    """Count total number of requests with active statuses."""
    total = 0
    for status_name, data in status_counts.items():
        if data.get('value') in active_statuses:
            total += data.get('count', 0)
    return total


@register.filter
def inactive_status_count(status_counts, inactive_statuses):
    """Count total number of requests with inactive statuses."""
    total = 0
    for status_name, data in status_counts.items():
        if data.get('value') in inactive_statuses:
            total += data.get('count', 0)
    return total


@register.filter
@stringfilter
def text_color(hex_color):
    """
    Determines if text should be light or dark based on background hex color.
    Returns '#FFFFFF' (white) for dark backgrounds and '#000000' (black) for light backgrounds.
    """
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        r, g, b = (int(hex_color[i]*2, 16) for i in range(3))
    elif len(hex_color) == 6:
        r, g, b = (int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    else:
        # Default to black for invalid hex codes
        return '#000000'

    # Calculate luminance (YIQ formula)
    luminance = (r * 299 + g * 587 + b * 114) / 1000

    # Threshold can be adjusted (128 is a common midpoint)
    return '#FFFFFF' if luminance < 128 else '#000000'


@register.simple_tag
def get_status_badge(status):
    """
    Generates a Bootstrap badge for a given status.
    Usage: {% get_status_badge status_value %}
    """
    if not status:
        return ""
    color_class = status_bootstrap_color(status) # Use the existing filter
    # Find the display name from AidRequest.STATUS_CHOICES, or use title case of status
    from ..models import AidRequest # Lazy import to avoid circular dependencies
    status_display = dict(AidRequest.STATUS_CHOICES).get(status, status.replace('_', ' ').title())
    return f'<span class="badge bg-{color_class}">{status_display}</span>'


@register.simple_tag
def get_priority_badge(priority):
    """
    Generates a Bootstrap badge for a given priority.
    Usage: {% get_priority_badge priority_value %}
    """
    if not priority:
        # Handle None or empty priority - perhaps display 'None' or an empty string
        priority_val = 'none' # Default to 'none' for color mapping if None
        priority_display = 'None'
    else:
        priority_val = priority
        # Find the display name from AidRequest.PRIORITY_CHOICES, or use title case
        from ..models import AidRequest # Lazy import
        priority_display = dict(AidRequest.PRIORITY_CHOICES).get(priority, priority.replace('_', ' ').title())

    color_class = priority_bootstrap_color(priority_val) # Use the existing filter
    return f'<span class="badge bg-{color_class}">{priority_display}</span>'
