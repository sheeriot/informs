from django.core.management.base import BaseCommand
from django.utils import timezone
from aidrequests.scheduled_tasks import hourly_field_op_cot


class Command(BaseCommand):
    help = 'Manually send COT messages for Field Ops with TAK servers'

    def add_arguments(self, parser):
        parser.add_argument(
            '--field-op',
            type=str,
            help='Field Op slug to process (optional - if not provided, all Field Ops will be processed)'
        )

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.SUCCESS(f'Starting COT message send at {timezone.now().strftime("%Y-%m-%d %H:%M:%S")}')
        )

        try:
            hourly_field_op_cot(field_op_slug=options.get('field_op'))
            self.stdout.write(self.style.SUCCESS('Successfully sent COT messages'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error sending COT messages: {str(e)}'))
