from django.http import HttpResponse
from django.views import View
import csv
from datetime import datetime

from ..models import AidRequest, FieldOp

# from icecream import ic


class AidRequestCsvView(View):
    model = AidRequest
    # Your existing view methods here

    def get(self, request, *args, **kwargs):
        if kwargs['action'] == 'export_csv':
            return self.get_csv_export(request, field_op=kwargs['field_op'])

    def get_csv_export(self, request, *args, **kwargs):
        # filter by FieldOp (GroundOp)
        rrslug = kwargs['field_op']
        field_op = FieldOp.objects.get(slug=rrslug)
        aid_requests = AidRequest.objects.filter(field_op=field_op)

        # Create the HttpResponse object with the appropriate CSV header.
        response = HttpResponse(content_type='text/csv')
        timestamp = datetime.now().strftime('%Y%m%d-%H%M')
        response['Content-Disposition'] = f'attachment; filename="{rrslug}-aidrequests-{timestamp}.csv"'

        # Create a CSV writer object.
        writer = csv.writer(response)

        # Write the header row
        writer.writerow(
                        [
                         'AidID',
                         'FieldOp',
                         'Type',
                         'R.First',
                         'R.Last',
                         'R.Email',
                         'R.Phone',
                         'A.First',
                         'A.Last',
                         'A.Email',
                         'A.Phone',
                         'Contact Methods',
                         'GroupSize',
                         'Address',
                         'City',
                         'State',
                         'Zip',
                         'Description',
                         'Medical',
                         'Supplies',
                         'welfare',
                         'additional',
                         ]
                        )

        # Write data rows
        for obj in aid_requests:
            writer.writerow([
                             obj.pk,
                             obj.field_op.slug if obj.field_op else None,
                             obj.assistance_type,
                             obj.requestor_first_name,
                             obj.requestor_last_name,
                             obj.requestor_email,
                             obj.requestor_phone,
                             obj.assistance_first_name,
                             obj.assistance_last_name,
                             obj.assistance_email,
                             obj.assistance_phone,
                             obj.contact_methods,
                             obj.group_size,
                             obj.street_address,
                             obj.city,
                             obj.state,
                             obj.zip_code,
                             obj.assistance_description,
                             obj.medical_needs,
                             obj.supplies_needed,
                             obj.welfare_check_info,
                             obj.additional_info
                             ])

        return response
