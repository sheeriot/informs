from django import template

register = template.Library()

@register.inclusion_tag('aidrequests/partials/_group_size_display.html')
def display_group_size(group_size):
    """
    Renders the group size with a dynamically calculated font size based on a hyperbolic curve.
    """
    font_size = "1rem"  # Default font size
    if isinstance(group_size, (int, float)) and group_size > 0:
        s_min = 1.0  # The font size for group_size = 1
        s_max = 2.5  # The maximum font size to approach
        k = 0.1      # Controls how quickly the font size increases

        # Hyperbolic function
        font_size_val = s_max - (s_max - s_min) / (1 + k * (group_size - 1))
        font_size = f"{font_size_val:.2f}rem"

    return {
        'group_size': group_size,
        'font_size': font_size,
    }
