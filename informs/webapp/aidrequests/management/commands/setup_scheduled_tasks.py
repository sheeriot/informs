from django.core.management.base import BaseCommand
from django_q.models import Schedule
from django_q.tasks import schedule

class Command(BaseCommand):
    help = 'Sets up scheduled tasks for sending COT messages'

    def handle(self, *args, **options):
        # Delete any existing schedules with this name to avoid duplicates
        Schedule.objects.filter(name='hourly_field_op_cot').delete()

        # Create a new schedule for the hourly COT messages
        schedule(
            func='aidrequests.tasks.send_all_field_op_cot',  # The function to run
            name='hourly_field_op_cot',                      # A unique name for this schedule
            schedule_type=Schedule.MINUTES,                   # Run on an interval
            minutes=60,                                      # Every 60 minutes
            repeats=-1                                       # Repeat indefinitely
        )

        self.stdout.write(
            self.style.SUCCESS('Successfully set up hourly COT message schedule')
        )
