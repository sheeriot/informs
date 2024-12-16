from django.db import migrations, models
import informs.utils

class Migration(migrations.Migration):

    dependencies = [
        ('aidrequests', '0023_rename_notifies_fieldop_notify'),
    ]

    operations = [
        migrations.AddField(
            model_name='aidlocation',
            name='uid',
            field=models.CharField(default=informs.utils.takuid_new, max_length=36, null=True),
        ),
    ]