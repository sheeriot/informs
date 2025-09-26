import os
from django.conf import settings

def server_hostname(request):
    return {'server_hostname': os.environ.get('SERVER_HOSTNAME', 'UnknownServer')}


def global_template_variables(request):
    """
    Adds global variables to the context for all templates.
    """
    org_url = getattr(settings, 'ORGANIZATION_URL', '')
    org_url_text = getattr(settings, 'ORGANIZATION_NAME', 'Org Name')
    site_image_url = getattr(settings, 'SITE_IMAGE_URL', '')
    banner_color = getattr(settings, 'BANNER_COLOR', '#0a1856')
    navbar_theme = getattr(settings, 'NAVBAR_THEME', 'navbar-light')
    color_mode = getattr(settings, 'COLOR_MODE', 'light')
    banner_color_light = getattr(settings, 'BANNER_COLOR_LIGHT', '#f5e5c4')
    banner_color_dark = getattr(settings, 'BANNER_COLOR_DARK', '#0a1856')

    return {
        'APP_VERSION': settings.STATIC_VERSION,
        'static_version': settings.STATIC_VERSION,
        'org_url': org_url,
        'org_url_text': org_url_text,
        'site_image_url': site_image_url,
        'banner_color': banner_color,
        'navbar_theme': navbar_theme,
        'color_mode': color_mode,
        'banner_color_light': banner_color_light,
        'banner_color_dark': banner_color_dark,
    }
