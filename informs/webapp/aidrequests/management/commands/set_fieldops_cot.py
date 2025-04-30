from django.core.management.base import BaseCommand, CommandError
from aidrequests.models import FieldOp


class Command(BaseCommand):
    help = 'Enable or disable COT (Common Operating Template) for all FieldOps'

    def add_arguments(self, parser):
        parser.add_argument(
            'enabled',
            help='Whether to enable COT. Accepts: true/false, True/False, TRUE/FALSE'
        )

    def handle(self, *args, **options):
        value = options['enabled'].lower()
        if value not in ('true', 'false'):
            raise CommandError('Argument must be one of: true/false, True/False, TRUE/FALSE')

        enabled = (value == 'true')
        # Note: disable_cot is the opposite of enabled
        updated = FieldOp.objects.update(disable_cot=not enabled)

        status = "enabled" if enabled else "disabled"
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully {status} COT for {updated} field ops'
            )
        )
