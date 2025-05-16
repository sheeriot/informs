from django.core.management.base import BaseCommand
from django.db.models import Count
from aidrequests.models import FieldOp, AidRequest
from icecream import ic

class Command(BaseCommand):
    help = 'Validates that all aid types used in aid requests are configured in their respective field operations'

    def handle(self, *args, **options):
        self.stdout.write('Checking aid type configurations...')

        # Get all field operations
        field_ops = FieldOp.objects.all()

        mismatches_found = False

        for field_op in field_ops:
            # Get configured aid types
            configured_aid_types = set(field_op.aid_types.values_list('name', flat=True))

            # Get aid types actually used in requests
            used_aid_types = set(
                AidRequest.objects.filter(field_op=field_op)
                .values_list('aid_type__name', flat=True)
                .distinct()
            )

            # Find aid types used but not configured
            unconfigured_types = used_aid_types - configured_aid_types

            if unconfigured_types:
                mismatches_found = True
                self.stdout.write(self.style.WARNING(
                    f'\nField Operation: {field_op.name} ({field_op.slug})'
                ))
                self.stdout.write(self.style.ERROR(
                    f'  Aid types used but not configured: {", ".join(unconfigured_types)}'
                ))
                self.stdout.write(f'  Configured aid types: {", ".join(configured_aid_types)}')
                self.stdout.write(f'  Used aid types: {", ".join(used_aid_types)}')

        if not mismatches_found:
            self.stdout.write(self.style.SUCCESS('\nAll aid type configurations are valid!'))
        else:
            self.stdout.write(self.style.ERROR('\nAid type mismatches found. Please review and update configurations.'))
