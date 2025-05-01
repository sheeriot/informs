from django.test import TestCase
from django.core.exceptions import ValidationError
from ..models import FieldOp, AidRequest
from ..views.forms import FieldOpForm, AidRequestForm

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

    def test_aid_request_form_valid_data(self):
        """Test AidRequestForm with valid data."""
        form_data = {
            'field_op': self.field_op.id,
            'title': 'New Aid Request',
            'description': 'Test Description',
            'latitude': 34.1,
            'longitude': -118.1,
            'status': 'NEW',
            'priority': 'MEDIUM',
            'aid_type': 'MEDICAL'
        }
        form = AidRequestForm(data=form_data)
        self.assertTrue(form.is_valid())

    def test_aid_request_form_invalid_status(self):
        """Test AidRequestForm with invalid status."""
        form_data = {
            'field_op': self.field_op.id,
            'title': 'New Aid Request',
            'description': 'Test Description',
            'latitude': 34.1,
            'longitude': -118.1,
            'status': 'INVALID_STATUS',  # Invalid status
            'priority': 'MEDIUM',
            'aid_type': 'MEDICAL'
        }
        form = AidRequestForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('status', form.errors)

    def test_aid_request_form_invalid_priority(self):
        """Test AidRequestForm with invalid priority."""
        form_data = {
            'field_op': self.field_op.id,
            'title': 'New Aid Request',
            'description': 'Test Description',
            'latitude': 34.1,
            'longitude': -118.1,
            'status': 'NEW',
            'priority': 'INVALID_PRIORITY',  # Invalid priority
            'aid_type': 'MEDICAL'
        }
        form = AidRequestForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('priority', form.errors)

    def test_aid_request_form_invalid_aid_type(self):
        """Test AidRequestForm with invalid aid type."""
        form_data = {
            'field_op': self.field_op.id,
            'title': 'New Aid Request',
            'description': 'Test Description',
            'latitude': 34.1,
            'longitude': -118.1,
            'status': 'NEW',
            'priority': 'MEDIUM',
            'aid_type': 'INVALID_TYPE'  # Invalid aid type
        }
        form = AidRequestForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('aid_type', form.errors)

    def test_aid_request_form_missing_required_fields(self):
        """Test AidRequestForm with missing required fields."""
        form_data = {
            'field_op': self.field_op.id,
            'title': '',  # Required field
            'description': 'Test Description',
            'latitude': 34.1,
            'longitude': -118.1,
            'status': 'NEW',
            'priority': 'MEDIUM',
            'aid_type': 'MEDICAL'
        }
        form = AidRequestForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('title', form.errors)

    def test_aid_request_form_coordinates_validation(self):
        """Test AidRequestForm coordinates validation."""
        form_data = {
            'field_op': self.field_op.id,
            'title': 'New Aid Request',
            'description': 'Test Description',
            'latitude': 91.0,  # Invalid latitude
            'longitude': 181.0,  # Invalid longitude
            'status': 'NEW',
            'priority': 'MEDIUM',
            'aid_type': 'MEDICAL'
        }
        form = AidRequestForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('latitude', form.errors)
        self.assertIn('longitude', form.errors)
