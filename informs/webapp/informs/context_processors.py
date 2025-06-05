import os

def server_hostname(request):
    return {'server_hostname': os.environ.get('SERVER_HOSTNAME', 'UnknownServer')}
