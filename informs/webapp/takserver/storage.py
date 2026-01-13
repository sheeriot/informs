from django.core.files.storage import FileSystemStorage
from django.conf import settings
import os


class CertificateStorage(FileSystemStorage):
    """
    Custom storage backend for TAK Server certificates.
    Stores files in the persistent /opt/app/certs Docker volume.
    """

    def __init__(self, subdir=''):
        base_location = getattr(settings, 'CERTIFICATE_STORAGE_ROOT', '/opt/app/certs')
        location = os.path.join(base_location, subdir)
        # Ensure the directory exists
        os.makedirs(location, exist_ok=True)
        super().__init__(location=location, base_url=None)
