from django.test import TestCase
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from ..models import FieldOp, AidRequest, AidType

class TestModels(TestCase):
    """Test models for aidrequests app."""

    def setUp(self):
        """Set up test data."""
        self.field_op = FieldOp.objects.create(
            name='Test Operation',
            slug='test-op',
            latitude=34.0,
            longitude=-118.0
        )
        self.aid_type = AidType.objects.create(name='Test Aid Type', slug='test-aid')

    def test_field_op_str(self):
        """Test FieldOp string representation."""
        self.assertEqual(str(self.field_op), 'Test Operation')

    def test_field_op_slug_unique(self):
        """Test FieldOp slug uniqueness."""
        with self.assertRaises(IntegrityError):
            FieldOp.objects.create(
                name='Another Operation',
                slug='test-op',  # Duplicate slug
                latitude=35.0,
                longitude=-119.0
            )

    def test_field_op_coordinates_validation(self):
        """Test FieldOp coordinates validation."""
        field_op = FieldOp(
            name='Invalid Coordinates',
            slug='invalid-coords',
            latitude=91.0,  # Invalid
            longitude=181.0  # Invalid
        )
        with self.assertRaises(ValidationError):
            field_op.full_clean()

    def test_aid_request_str(self):
        """Test AidRequest string representation."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
            aid_first_name='John',
            aid_last_name='Doe',
            status='NEW'
        )
        self.assertIn(aid_request.get_full_name(), str(aid_request))
        self.assertIn(self.aid_type.name, str(aid_request))

    def test_aid_request_status_transitions(self):
        """Test AidRequest status transitions."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
            aid_first_name='User',
            aid_last_name='User',
            status='NEW'
        )

        # Test valid transition
        aid_request.status = 'assigned'
        aid_request.full_clean()  # Should not raise ValidationError
        aid_request.save()

    def test_aid_request_priority_validation(self):
        """Test AidRequest priority validation."""
        with self.assertRaises(ValidationError):
            aid_request = AidRequest(
                field_op=self.field_op,
                aid_type=self.aid_type,
                status='NEW',
                priority='INVALID_PRIORITY'  # Invalid priority
            )
            aid_request.full_clean()

    def test_aid_request_type_validation(self):
        """Test AidRequest type validation."""
        with self.assertRaises(ValueError):
            AidRequest.objects.create(
                field_op=self.field_op,
                aid_type='INVALID_TYPE'
            )

    def test_aid_request_default_values(self):
        """Test AidRequest default values."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
        )
        self.assertEqual(aid_request.status, 'new')  # Default status
        self.assertEqual(aid_request.priority, 'medium')  # Default priority

    def test_aid_request_timestamps(self):
        """Test AidRequest timestamps."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
        )
        self.assertIsNotNone(aid_request.created_at)
        self.assertIsNotNone(aid_request.updated_at)

        # Test update
        original_updated_at = aid_request.updated_at
        aid_request.aid_description = 'Updated Description'
        aid_request.save()
        aid_request.refresh_from_db()
        self.assertGreater(aid_request.updated_at, original_updated_at)
