from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
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
            longitude=-118.0,
            disable_cot=False
        )

        self.assertEqual(FieldOp.objects.count(), 1)
        self.assertEqual(field_op.name, "Test Field Operation")
        self.assertEqual(field_op.slug, "test-field-op")
        self.assertEqual(field_op.latitude, 34.0)
        self.assertEqual(field_op.longitude, -118.0)
        self.assertEqual(field_op.disable_cot, False)

    def test_fieldop_str(self):
        """Test the string representation of a FieldOp"""
        field_op = FieldOp.objects.create(
            name="Test Field Operation",
            slug="test-field-op",
            latitude=34.0,
            longitude=-118.0,
            disable_cot=False
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
            'longitude': -118.0,
            'disable_cot': False
        }
        form = FieldOpForm(data=form_data)
        self.assertTrue(form.is_valid())

    def test_invalid_latitude(self):
        """Test that the form fails with invalid latitude"""
        form_data = {
            'name': 'Test Field Operation',
            'slug': 'test-field-op',
            'latitude': 91.0,  # Invalid: > 90
            'longitude': -118.0,
            'disable_cot': False
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
            'longitude': 181.0,  # Invalid: > 180
            'disable_cot': False
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

        # Add necessary permissions
        content_type = ContentType.objects.get_for_model(FieldOp)
        view_fieldop_permission = Permission.objects.get(
            content_type=content_type,
            codename='view_fieldop'
        )
        self.user.user_permissions.add(view_fieldop_permission)

        # Add permission for viewing aid requests
        aid_request_content_type = ContentType.objects.get_for_model(AidRequest)
        view_aidrequest_permission = Permission.objects.get(
            content_type=aid_request_content_type,
            codename='view_aidrequest'
        )
        self.user.user_permissions.add(view_aidrequest_permission)

        self.client = Client()

        # Create a test FieldOp
        self.field_op = FieldOp.objects.create(
            name="Test Field Operation",
            slug="test-field-op",
            latitude=34.0,
            longitude=-118.0,
            disable_cot=False
        )

    def test_fieldop_list_view(self):
        """Test the field_op_list view"""
        # Login required for this view
        self.client.login(username='testuser', password='testpassword')

        # Create a field op with COT disabled
        field_op_disabled = FieldOp.objects.create(
            name="Test Field Operation Disabled",
            slug="test-field-op-disabled",
            latitude=34.0,
            longitude=-118.0,
            disable_cot=True
        )

        response = self.client.get(reverse('field_op_list'))
        self.assertEqual(response.status_code, 200)

        # Check both field ops are listed
        self.assertContains(response, "Test Field Operation")
        self.assertContains(response, "Test Field Operation Disabled")

        # Check COT status is shown correctly for both
        self.assertContains(response, '<i class="bi bi-check-circle"></i> Enabled')  # Default field op
        self.assertContains(response, '<i class="bi bi-x-circle"></i> Disabled')  # Disabled field op

    def test_fieldop_detail_view(self):
        """Test the field_op_detail view"""
        # Login required for this view
        self.client.login(username='testuser', password='testpassword')

        response = self.client.get(reverse('field_op_detail', args=[self.field_op.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test Field Operation")
        # Check that COT status is shown as enabled (default)
        self.assertContains(response, "Enabled")
        self.assertContains(response, "bi-check-circle")

    def test_fieldop_detail_view_cot_disabled(self):
        """Test the field_op_detail view with COT disabled"""
        # Create a field op with COT disabled
        field_op_disabled = FieldOp.objects.create(
            name="Test Field Operation Disabled",
            slug="test-field-op-disabled",
            latitude=34.0,
            longitude=-118.0,
            disable_cot=True
        )

        # Login required for this view
        self.client.login(username='testuser', password='testpassword')

        response = self.client.get(reverse('field_op_detail', args=[field_op_disabled.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test Field Operation Disabled")
        # Check that COT status is shown as disabled
        self.assertContains(response, "Disabled")
        self.assertContains(response, "bi-x-circle")

    def test_aid_request_list_view_cot_disabled(self):
        """Test that the aid request list view shows COT disabled status when applicable."""
        self.client.force_login(self.user)
        field_op = FieldOp.objects.create(
            name='Test Field Op COT Disabled',
            slug='test-field-op-cot-disabled',
            latitude=0,
            longitude=0,
            disable_cot=True
        )
        response = self.client.get(reverse('aid_request_list', kwargs={'field_op': field_op.slug}))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'COT Disabled')
        self.assertContains(response, 'bi-x-circle')
        self.assertContains(response, 'badge bg-danger')

    def test_aid_request_list_view_cot_enabled(self):
        """Test that the aid request list view does not show COT disabled status when COT is enabled."""
        self.client.force_login(self.user)
        field_op = FieldOp.objects.create(
            name='Test Field Op COT Enabled',
            slug='test-field-op-cot-enabled',
            latitude=0,
            longitude=0,
            disable_cot=False
        )
        response = self.client.get(reverse('aid_request_list', kwargs={'field_op': field_op.slug}))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'COT Disabled')
        self.assertNotContains(response, 'bi-x-circle')
