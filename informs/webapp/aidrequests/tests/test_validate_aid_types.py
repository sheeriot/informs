from io import StringIO
from django.test import TestCase
from django.core.management import call_command
from aidrequests.models import FieldOp, AidType, AidRequest

class ValidateAidTypesTest(TestCase):
    def setUp(self):
        # Create test aid types
        self.evacuation, _ = AidType.objects.get_or_create(name='Evacuation', slug='evacuation')
        self.resupply, _ = AidType.objects.get_or_create(name='Re-supply', slug='resupply')
        self.welfare, _ = AidType.objects.get_or_create(name='Welfare Check', slug='welfare')

        # Create a test field operation
        self.field_op = FieldOp.objects.create(
            name='Test Field Op',
            slug='test-op',
            latitude=30.0,
            longitude=-97.0
        )

        # Configure only evacuation and resupply
        self.field_op.aid_types.add(self.evacuation, self.resupply)

    def test_validate_aid_types_no_mismatch(self):
        """Test when all used aid types are properly configured"""
        # Create aid request with configured aid type
        AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.evacuation,
            requestor_first_name='John',
            requestor_last_name='Doe',
            street_address='123 Test St',
            city='Test City',
            state='TX'
        )

        out = StringIO()
        call_command('validate_aid_types', stdout=out)
        self.assertIn('All aid type configurations are valid!', out.getvalue())

    def test_validate_aid_types_with_mismatch(self):
        """Test when there are unconfigured aid types in use"""
        # Create aid request with unconfigured aid type
        AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.welfare,  # Welfare Check is not configured
            requestor_first_name='Jane',
            requestor_last_name='Doe',
            street_address='456 Test St',
            city='Test City',
            state='TX'
        )

        out = StringIO()
        call_command('validate_aid_types', stdout=out)
        output = out.getvalue()

        self.assertIn('Aid type mismatches found', output)
        self.assertIn('Test Field Op (test-op)', output)
        self.assertIn('Welfare Check', output)
