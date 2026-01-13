# Generated migration for certificate storage change

import os
import shutil
from django.db import migrations, models
from django.conf import settings

from takserver.storage import CertificateStorage


def get_trust_storage():
    return CertificateStorage('certtrust')


def get_private_storage():
    return CertificateStorage('certprivate')


def migrate_certificates_forward(apps, schema_editor):
    """
    Migrate certificate files from media/certificates/ to /opt/app/certs/
    and update database paths.
    """
    TakServer = apps.get_model('takserver', 'TakServer')

    media_root = getattr(settings, 'MEDIA_ROOT', '/opt/app/media')
    cert_root = getattr(settings, 'CERTIFICATE_STORAGE_ROOT', '/opt/app/certs')

    # Ensure destination directories exist
    os.makedirs(os.path.join(cert_root, 'certtrust'), exist_ok=True)
    os.makedirs(os.path.join(cert_root, 'certprivate'), exist_ok=True)

    for server in TakServer.objects.all():
        # Migrate cert_trust
        if server.cert_trust:
            old_path = server.cert_trust.name  # e.g., 'certificates/certtrust/filename.pem'
            if old_path.startswith('certificates/certtrust/'):
                filename = os.path.basename(old_path)
                old_full_path = os.path.join(media_root, old_path)
                new_full_path = os.path.join(cert_root, 'certtrust', filename)

                # Copy file if it exists
                if os.path.exists(old_full_path):
                    shutil.copy2(old_full_path, new_full_path)
                    print(f"Copied {old_full_path} -> {new_full_path}")

                # Update database path (just the filename now)
                server.cert_trust = filename

        # Migrate cert_private
        if server.cert_private:
            old_path = server.cert_private.name  # e.g., 'certificates/certprivate/filename.pem'
            if old_path.startswith('certificates/certprivate/'):
                filename = os.path.basename(old_path)
                old_full_path = os.path.join(media_root, old_path)
                new_full_path = os.path.join(cert_root, 'certprivate', filename)

                # Copy file if it exists
                if os.path.exists(old_full_path):
                    shutil.copy2(old_full_path, new_full_path)
                    print(f"Copied {old_full_path} -> {new_full_path}")

                # Update database path (just the filename now)
                server.cert_private = filename

        server.save()


def migrate_certificates_reverse(apps, schema_editor):
    """
    Reverse migration - update paths back to media/certificates/ format.
    Note: This does not move files back, just updates paths.
    """
    TakServer = apps.get_model('takserver', 'TakServer')

    for server in TakServer.objects.all():
        if server.cert_trust and not server.cert_trust.name.startswith('certificates/'):
            filename = os.path.basename(server.cert_trust.name)
            server.cert_trust = f'certificates/certtrust/{filename}'

        if server.cert_private and not server.cert_private.name.startswith('certificates/'):
            filename = os.path.basename(server.cert_private.name)
            server.cert_private = f'certificates/certprivate/{filename}'

        server.save()


class Migration(migrations.Migration):

    dependencies = [
        ('takserver', '0003_alter_takserver_notes'),
    ]

    operations = [
        # First, alter the fields to use the new storage
        migrations.AlterField(
            model_name='takserver',
            name='cert_trust',
            field=models.FileField(
                storage=get_trust_storage,
                upload_to='',
                help_text='Upload the trusted certificate file - PEM Format'
            ),
        ),
        migrations.AlterField(
            model_name='takserver',
            name='cert_private',
            field=models.FileField(
                storage=get_private_storage,
                upload_to='',
                help_text='Upload the private certificate file - PEM Format'
            ),
        ),
        # Then run the data migration
        migrations.RunPython(migrate_certificates_forward, migrate_certificates_reverse),
    ]
