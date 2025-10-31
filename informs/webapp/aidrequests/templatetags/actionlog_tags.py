from django import template
from django.utils import timezone
from datetime import timedelta

register = template.Library()

@register.filter
def is_recent(value, minutes=15):
    """
    Checks if a datetime value is within the last X minutes.
    """
    if not value:
        return False
    return timezone.now() - value < timedelta(minutes=minutes)
