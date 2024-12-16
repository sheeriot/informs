from django.db import migrations, models
import informs.utils

class Migration(migrations.Migration):

    dependencies = [
        ('aidrequests', '0025_aidlocation_adduids'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aidlocation',
            name='uid',
            field=models.CharField(default=informs.utils.takuid_new, max_length=36, unique=True),
        ),
    ]
