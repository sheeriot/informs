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
