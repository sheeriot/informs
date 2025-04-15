from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User
from .models import FieldOp, AidRequest
from .views.forms import FieldOpForm


class FieldOpModelTests(TestCase):
    """Tests for the FieldOp model"""

    def test_fieldop_creation(self):
        """Test creating a FieldOp instance"""
        field_op = FieldOp.objects.create(
            name="Test Field Operation",
            slug="test-field-op",
            latitude=34.0,
            longitude=-118.0
        )

        self.assertEqual(FieldOp.objects.count(), 1)
        self.assertEqual(field_op.name, "Test Field Operation")
        self.assertEqual(field_op.slug, "test-field-op")
        self.assertEqual(field_op.latitude, 34.0)
        self.assertEqual(field_op.longitude, -118.0)

    def test_fieldop_str(self):
        """Test the string representation of a FieldOp"""
        field_op = FieldOp.objects.create(
            name="Test Field Operation",
            slug="test-field-op",
            latitude=34.0,
            longitude=-118.0
        )

        self.assertEqual(str(field_op), "Test Field Operation")


class FieldOpFormTests(TestCase):
    """Tests for the FieldOp form"""

    def test_valid_fieldop_form(self):
        """Test that the form validates with valid data"""
        form_data = {
            'name': 'Test Field Operation',
            'slug': 'test-field-op',
            'latitude': 34.0,
            'longitude': -118.0
        }
        form = FieldOpForm(data=form_data)
        self.assertTrue(form.is_valid())

    def test_invalid_latitude(self):
        """Test that the form fails with invalid latitude"""
        form_data = {
            'name': 'Test Field Operation',
            'slug': 'test-field-op',
            'latitude': 91.0,  # Invalid: > 90
            'longitude': -118.0
        }
        form = FieldOpForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('latitude', form.errors)

    def test_invalid_longitude(self):
        """Test that the form fails with invalid longitude"""
        form_data = {
            'name': 'Test Field Operation',
            'slug': 'test-field-op',
            'latitude': 34.0,
            'longitude': 181.0  # Invalid: > 180
        }
        form = FieldOpForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('longitude', form.errors)


class FieldOpViewTests(TestCase):
    """Tests for the FieldOp views"""

    def setUp(self):
        # Create a test user for authentication tests
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpassword'
        )
        self.client = Client()

        # Create a test FieldOp
        self.field_op = FieldOp.objects.create(
            name="Test Field Operation",
            slug="test-field-op",
            latitude=34.0,
            longitude=-118.0
        )

    def test_fieldop_list_view(self):
        """Test the field_op_list view"""
        # Login required for this view
        self.client.login(username='testuser', password='testpassword')

        response = self.client.get(reverse('field_op_list'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test Field Operation")

    def test_fieldop_detail_view(self):
        """Test the field_op_detail view"""
        # Login required for this view
        self.client.login(username='testuser', password='testpassword')

        response = self.client.get(reverse('field_op_detail', args=[self.field_op.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test Field Operation")
