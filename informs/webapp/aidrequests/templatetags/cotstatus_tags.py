from django import template

register = template.Library()

@register.filter
def get_status_classes(status):
    styles = {
        'success': {
            'text_class': 'text-success',
            'bg_class': 'bg-success bg-opacity-25',
            'icon': 'bi-check-circle',
        },
        'error': {
            'text_class': 'text-danger',
            'bg_class': 'bg-danger bg-opacity-25',
            'icon': 'bi-exclamation-circle',
        },
        'warning': {
            'text_class': 'text-warning',
            'bg_class': 'bg-warning bg-opacity-25',
            'icon': 'bi-exclamation-triangle',
        }
    }
    return styles.get(status, styles['warning'])
