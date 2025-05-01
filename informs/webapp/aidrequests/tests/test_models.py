from django.test import TestCase
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from ..models import FieldOp, AidRequest

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
        with self.assertRaises(ValidationError):
            field_op = FieldOp(
                name='Invalid Coordinates',
                slug='invalid-coords',
                latitude=91.0,  # Invalid
                longitude=181.0  # Invalid
            )
            field_op.full_clean()

    def test_field_op_active_aid_requests(self):
        """Test FieldOp active aid requests property."""
        # Create some aid requests with different statuses
        AidRequest.objects.create(
            field_op=self.field_op,
            title='Active Request 1',
            description='Test',
            latitude=34.1,
            longitude=-118.1,
            status='NEW'
        )
        AidRequest.objects.create(
            field_op=self.field_op,
            title='Active Request 2',
            description='Test',
            latitude=34.2,
            longitude=-118.2,
            status='IN_PROGRESS'
        )
        AidRequest.objects.create(
            field_op=self.field_op,
            title='Inactive Request',
            description='Test',
            latitude=34.3,
            longitude=-118.3,
            status='COMPLETED'
        )

        active_requests = self.field_op.active_aid_requests
        self.assertEqual(active_requests.count(), 2)
        self.assertTrue(all(request.status in ['NEW', 'IN_PROGRESS'] for request in active_requests))

    def test_aid_request_str(self):
        """Test AidRequest string representation."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            title='Test Request',
            description='Test Description',
            latitude=34.1,
            longitude=-118.1,
            status='NEW'
        )
        self.assertEqual(str(aid_request), 'Test Request')

    def test_aid_request_status_transitions(self):
        """Test AidRequest status transitions."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            title='Test Request',
            description='Test Description',
            latitude=34.1,
            longitude=-118.1,
            status='NEW'
        )

        # Test valid transition
        aid_request.status = 'IN_PROGRESS'
        aid_request.full_clean()  # Should not raise ValidationError
        aid_request.save()

        # Test invalid transition (e.g., from IN_PROGRESS to NEW)
        aid_request.status = 'NEW'
        with self.assertRaises(ValidationError):
            aid_request.full_clean()

    def test_aid_request_coordinates_validation(self):
        """Test AidRequest coordinates validation."""
        with self.assertRaises(ValidationError):
            aid_request = AidRequest(
                field_op=self.field_op,
                title='Invalid Coordinates',
                description='Test',
                latitude=91.0,  # Invalid
                longitude=181.0,  # Invalid
                status='NEW'
            )
            aid_request.full_clean()

    def test_aid_request_priority_validation(self):
        """Test AidRequest priority validation."""
        with self.assertRaises(ValidationError):
            aid_request = AidRequest(
                field_op=self.field_op,
                title='Invalid Priority',
                description='Test',
                latitude=34.1,
                longitude=-118.1,
                status='NEW',
                priority='INVALID_PRIORITY'  # Invalid priority
            )
            aid_request.full_clean()

    def test_aid_request_type_validation(self):
        """Test AidRequest type validation."""
        with self.assertRaises(ValidationError):
            aid_request = AidRequest(
                field_op=self.field_op,
                title='Invalid Type',
                description='Test',
                latitude=34.1,
                longitude=-118.1,
                status='NEW',
                aid_type='INVALID_TYPE'  # Invalid aid type
            )
            aid_request.full_clean()

    def test_aid_request_default_values(self):
        """Test AidRequest default values."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            title='Test Request',
            description='Test Description',
            latitude=34.1,
            longitude=-118.1
        )
        self.assertEqual(aid_request.status, 'NEW')  # Default status
        self.assertEqual(aid_request.priority, 'MEDIUM')  # Default priority

    def test_aid_request_timestamps(self):
        """Test AidRequest timestamps."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            title='Test Request',
            description='Test Description',
            latitude=34.1,
            longitude=-118.1
        )
        self.assertIsNotNone(aid_request.created_at)
        self.assertIsNotNone(aid_request.updated_at)

        # Test update
        original_updated_at = aid_request.updated_at
        aid_request.description = 'Updated Description'
        aid_request.save()
        aid_request.refresh_from_db()
        self.assertGreater(aid_request.updated_at, original_updated_at)
