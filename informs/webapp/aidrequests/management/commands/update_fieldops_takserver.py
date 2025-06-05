from django.core.management.base import BaseCommand
from aidrequests.models import FieldOp
from takserver.models import TakServer

class Command(BaseCommand):
    help = 'Changes the tak_server on all field ops to a selected destination TAK server.'

    def handle(self, *args, **options):
        # Get all available TAK servers
        tak_servers = TakServer.objects.all()
        if not tak_servers.exists():
            self.stdout.write(self.style.ERROR('No TAK servers found in the database.'))
            return

        # Display the list of available TAK servers
        self.stdout.write("Available TAK servers:")
        for i, server in enumerate(tak_servers):
            self.stdout.write(f"  {i + 1}: {server.name}")

        # Prompt the user to choose a destination server
        while True:
            try:
                choice = input("Enter the number of the destination TAK server to set for all Field Ops: ")
                choice_index = int(choice) - 1
                if 0 <= choice_index < len(tak_servers):
                    destination_tak_server = tak_servers[choice_index]
                    break
                else:
                    self.stdout.write(self.style.ERROR('Invalid number. Please try again.'))
            except (ValueError, IndexError):
                self.stdout.write(self.style.ERROR('Invalid input. Please enter a number from the list.'))

        # Confirm the choice
        self.stdout.write(f"You have selected '{destination_tak_server.name}' as the destination server.")
        confirmation = input("Are you sure you want to update all Field Ops to this server? (yes/no): ")

        if confirmation.lower() != 'yes':
            self.stdout.write(self.style.WARNING('Operation cancelled by user.'))
            return

        # Update all FieldOp records
        update_count = FieldOp.objects.update(tak_server=destination_tak_server)

        if update_count == 0:
            self.stdout.write(self.style.WARNING('No field ops were updated.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Successfully updated {update_count} field ops to use "{destination_tak_server.name}".')) 