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
