from django.test import TestCase
from django.core.exceptions import ValidationError
from ..models import FieldOp, AidRequest, AidType
from ..views.aid_request_forms_c import AidRequestCreateFormC
from ..views.forms import FieldOpForm

class TestForms(TestCase):
    """Test forms for aidrequests app."""

    def setUp(self):
        """Set up test data."""
        self.field_op = FieldOp.objects.create(
            name='Test Operation',
            slug='test-op',
            latitude=34.0,
            longitude=-118.0
        )
        self.aid_type = AidType.objects.create(name='Test Aid Type', slug='test-aid')

    def test_field_op_form_valid_data(self):
        """Test FieldOpForm with valid data."""
        form_data = {
            'name': 'New Field Operation',
            'slug': 'new-field-op',
            'latitude': 35.0,
            'longitude': -119.0,
            'disable_cot': False
        }
        form = FieldOpForm(data=form_data)
        self.assertTrue(form.is_valid())

    def test_field_op_form_invalid_latitude(self):
        """Test FieldOpForm with invalid latitude."""
        form_data = {
            'name': 'New Field Operation',
            'slug': 'new-field-op',
            'latitude': 91.0,  # Invalid: > 90
            'longitude': -119.0,
            'disable_cot': False
        }
        form = FieldOpForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('latitude', form.errors)

    def test_field_op_form_invalid_longitude(self):
        """Test FieldOpForm with invalid longitude."""
        form_data = {
            'name': 'New Field Operation',
            'slug': 'new-field-op',
            'latitude': 35.0,
            'longitude': 181.0,  # Invalid: > 180
            'disable_cot': False
        }
        form = FieldOpForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('longitude', form.errors)

    def test_field_op_form_missing_required_fields(self):
        """Test FieldOpForm with missing required fields."""
        form_data = {
            'name': '',  # Required field
            'slug': 'new-field-op',
            'latitude': 35.0,
            'longitude': -119.0
        }
        form = FieldOpForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('name', form.errors)

    def test_aid_request_create_form_c_valid_email(self):
        """Test AidRequestCreateFormC with a valid email."""
        form_data = {
            'full_name': 'Test User',
            'contact_info': 'test@example.com',
            'aid_type': self.aid_type.pk
        }
        initial_data = {'field_op': self.field_op.id}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data['requestor_email'], 'test@example.com')

    def test_aid_request_create_form_c_valid_phone(self):
        """Test AidRequestCreateFormC with a valid phone number."""
        form_data = {
            'full_name': 'Test User',
            'contact_info': '123-456-7890',
            'aid_type': self.aid_type.pk
        }
        initial_data = {'field_op': self.field_op.id}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data['requestor_phone'], '1234567890')

    def test_aid_request_create_form_c_invalid_contact(self):
        """Test AidRequestCreateFormC with invalid contact info."""
        form_data = {
            'full_name': 'Test User',
            'contact_info': 'invalid',
            'aid_type': self.aid_type.pk
        }
        initial_data = {'field_op': self.field_op.id}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertFalse(form.is_valid())
        self.assertIn('contact_info', form.errors)
        self.assertEqual(form.errors['contact_info'][0], 'Enter a valid email address or a phone number with at least 10 digits.')

    def test_aid_request_create_form_c_full_name_parsing(self):
        """Test AidRequestCreateFormC full_name parsing."""
        form_data = {
            'full_name': 'First Middle Last',
            'contact_info': 'test@example.com',
            'aid_type': self.aid_type.pk
        }
        initial_data = {'field_op': self.field_op.id}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data['requestor_first_name'], 'First')
        self.assertEqual(form.cleaned_data['requestor_last_name'], 'Middle Last')
