from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aidrequests', '0022_alter_aidrequest_requestor_first_name_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='aidrequest',
            old_name='requestor_email',
            new_name='requester_email',
        ),
        migrations.RenameField(
            model_name='aidrequest',
            old_name='requestor_first_name',
            new_name='requester_first_name',
        ),
        migrations.RenameField(
            model_name='aidrequest',
            old_name='requestor_last_name',
            new_name='requester_last_name',
        ),
        migrations.RenameField(
            model_name='aidrequest',
            old_name='requestor_phone',
            new_name='requester_phone',
        ),
    ]
