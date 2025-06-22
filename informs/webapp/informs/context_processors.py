import os
from django.conf import settings

def server_hostname(request):
    return {'server_hostname': os.environ.get('SERVER_HOSTNAME', 'UnknownServer')}

def app_version(request):
    """
    Adds the application version to the context.
    """
    return {'APP_VERSION': settings.STATIC_VERSION}
