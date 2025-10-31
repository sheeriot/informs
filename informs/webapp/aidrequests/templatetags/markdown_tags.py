import markdown
from django import template
from django.utils.safestring import mark_safe

register = template.Library()

@register.filter
def markdownify(text):
    if not text:
        return ""
    # Convert markdown to HTML
    html = markdown.markdown(text, extensions=['fenced_code', 'tables'])
    return mark_safe(html)
