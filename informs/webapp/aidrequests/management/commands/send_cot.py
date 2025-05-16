from django.core.management.base import BaseCommand
from django.utils import timezone
import asyncio
from aidrequests.tasks import send_cot_task


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
            # Run the async task in a new event loop
            result = asyncio.run(send_cot_task(
                field_op_slug=options.get('field_op'),
                mark_type='field'
            ))
            self.stdout.write(self.style.SUCCESS('Successfully sent COT messages'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error sending COT messages: {str(e)}'))
