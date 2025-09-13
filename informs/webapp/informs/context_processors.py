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

    return {
        'APP_VERSION': settings.STATIC_VERSION,
        'static_version': settings.STATIC_VERSION,
        'org_url': org_url,
        'org_url_text': org_url_text,
        'site_image_url': site_image_url,
    }
