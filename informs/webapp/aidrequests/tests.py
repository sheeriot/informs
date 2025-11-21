from django.test import TestCase, Client, SimpleTestCase
from django.urls import reverse, resolve
from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from io import StringIO
from django.core.management import call_command
import json

from .models import FieldOp, AidRequest, AidType, AidLocation
from .forms.fieldop_forms import FieldOpForm
from .views.aid_request_forms_c import AidRequestCreateFormC
from .views.field_op_list import FieldOpListView
from .views.field_op import FieldOpDetailView
from .views.aid_request_list import AidRequestListView
from .views.aid_request_detail import AidRequestDetailView
from .views.aid_request import AidRequestCreateView

# === test_forms.py ===

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
        self.field_op.aid_types.add(self.aid_type)

    def test_field_op_form_valid_data(self):
        """Test FieldOpForm with valid data."""
        form_data = {
            'name': 'New Field Operation',
            'slug': 'new-field-op',
            'latitude': 35.0,
            'longitude': -119.0,
            'country': 'US',
            'ring_size': 10,
            'disable_cot': False,
            'aid_types': [self.aid_type.pk]
        }
        form = FieldOpForm(data=form_data)
        self.assertTrue(form.is_valid(), form.errors)

    def test_field_op_form_invalid_latitude(self):
        """Test FieldOpForm with invalid latitude."""
        form_data = {
            'name': 'New Field Operation',
            'slug': 'new-field-op',
            'latitude': 91.0,  # Invalid: > 90
            'longitude': -119.0,
            'country': 'US',
            'ring_size': 10,
            'disable_cot': False,
            'aid_types': [self.aid_type.pk]
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
            'country': 'US',
            'ring_size': 10,
            'disable_cot': False,
            'aid_types': [self.aid_type.pk]
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
            'field_op': self.field_op.id,
            'full_name': 'Test User',
            'contact_info': 'test@example.com',
            'aid_type': self.aid_type.slug
        }
        initial_data = {'fieldop_slug': self.field_op.slug}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data['requester_email'], 'test@example.com')

    def test_aid_request_create_form_c_valid_phone(self):
        """Test AidRequestCreateFormC with a valid phone number."""
        form_data = {
            'field_op': self.field_op.id,
            'full_name': 'Test User',
            'contact_info': '123-456-7890',
            'aid_type': self.aid_type.slug
        }
        initial_data = {'fieldop_slug': self.field_op.slug}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data['requester_phone'], '1234567890')

    def test_aid_request_create_form_c_invalid_contact(self):
        """Test AidRequestCreateFormC with invalid contact info."""
        form_data = {
            'field_op': self.field_op.id,
            'full_name': 'Test User',
            'contact_info': 'invalid',
            'aid_type': self.aid_type.slug
        }
        initial_data = {'fieldop_slug': self.field_op.slug}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertFalse(form.is_valid())
        self.assertIn('contact_info', form.errors)
        self.assertEqual(form.errors['contact_info'][0], 'Enter a valid email address or a phone number with at least 10 digits.')

    def test_aid_request_create_form_c_full_name_parsing(self):
        """Test AidRequestCreateFormC full_name parsing."""
        form_data = {
            'field_op': self.field_op.id,
            'full_name': 'First Middle Last',
            'contact_info': 'test@example.com',
            'aid_type': self.aid_type.slug
        }
        initial_data = {'fieldop_slug': self.field_op.slug}
        form = AidRequestCreateFormC(data=form_data, initial=initial_data)
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data['requester_first_name'], 'First')
        self.assertEqual(form.cleaned_data['requester_last_name'], 'Middle Last')

# === test_models.py ===

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
            requester_first_name='John',
            requester_last_name='Doe',
            status='NEW'
        )
        self.assertIn(aid_request.requester_full_name, str(aid_request))
        self.assertIn(self.aid_type.name, str(aid_request))

    def test_aid_request_status_transitions(self):
        """Test AidRequest status transitions."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
            requester_first_name='User',
            requester_last_name='User',
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

    def test_aid_request_default_values(self):
        """Test AidRequest default values."""
        aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
        )
        self.assertEqual(aid_request.status, 'new')  # Default status
        self.assertEqual(aid_request.priority, None)  # Default priority

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


# === test_urls.py ===

class TestUrls(SimpleTestCase):
    """Test URL configuration for aidrequests app."""

    def test_field_op_list_url_resolves(self):
        """Test field_op_list URL pattern."""
        url = reverse('field_op_list')
        self.assertEqual(resolve(url).func.view_class, FieldOpListView)

    def test_field_op_detail_url_resolves(self):
        """Test field_op_detail URL pattern."""
        url = reverse('field_op_detail', args=['test-slug'])
        self.assertEqual(resolve(url).func.view_class, FieldOpDetailView)

    def test_aid_request_list_url_resolves(self):
        """Test aid_request_list URL pattern."""
        url = reverse('aid_request_list', kwargs={'field_op': 'test-op'})
        self.assertEqual(resolve(url).func.view_class, AidRequestListView)

    def test_aid_request_detail_url_resolves(self):
        """Test aid_request_detail URL pattern."""
        url = reverse('aid_request_detail', kwargs={
            'field_op': 'test-op',
            'pk': 1
        })
        self.assertEqual(resolve(url).func.view_class, AidRequestDetailView)

    def test_aid_request_create_url_resolves(self):
        """Test aid_request_create URL pattern."""
        url = reverse('aid_request_create', kwargs={'field_op': 'test-op'})
        self.assertEqual(resolve(url).func.view_class, AidRequestCreateView)

# === test_validate_aid_types.py ===

class ValidateAidTypesTest(TestCase):
    def setUp(self):
        # Create test aid types
        self.evacuation, _ = AidType.objects.get_or_create(name='Evacuation', slug='evacuation')
        self.resupply, _ = AidType.objects.get_or_create(name='Re-supply', slug='resupply')
        self.welfare, _ = AidType.objects.get_or_create(name='Welfare Check', slug='welfare')

        # Create a test field operation
        self.field_op = FieldOp.objects.create(
            name='Test Field Op',
            slug='test-field-op',
            latitude=33.33,
            longitude=44.44
        )

        # Configure only evacuation and resupply
        self.field_op.aid_types.add(self.evacuation, self.resupply)

    def test_validate_aid_types_no_mismatch(self):
        """Test when all used aid types are properly configured"""
        # Create aid request with configured aid type
        AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.evacuation,
            requester_first_name='John',
            requester_last_name='Doe',
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
            requester_first_name='Jane',
            requester_last_name='Doe',
            street_address='456 Test St',
            city='Test City',
            state='TX'
        )

        out = StringIO()
        call_command('validate_aid_types', stdout=out)
        output = out.getvalue()

        self.assertIn('Aid type mismatches found', output)
        self.assertIn('Test Field Op (test-field-op)', output)
        self.assertIn('Welfare Check', output)


# === test_views.py ===

class TestViews(TestCase):
    """Test views for aidrequests app."""

    def setUp(self):
        """Set up test data."""
        self.client = Client()

        # Create test user with permissions
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

        # Add permissions
        content_types_models = {
            FieldOp: ['view', 'add', 'change', 'delete'],
            AidRequest: ['view', 'add', 'change', 'delete']
        }

        for model, permissions in content_types_models.items():
            content_type = ContentType.objects.get_for_model(model)
            for permission in permissions:
                try:
                    permission_obj = Permission.objects.get(
                        content_type=content_type,
                        codename=f'{permission}_{model._meta.model_name}'
                    )
                    self.user.user_permissions.add(permission_obj)
                except Permission.DoesNotExist:
                    # This can happen if migrations for other apps haven't run
                    # For tests, we can often ignore this if not directly testing these permissions
                    pass

        # Create test field operation
        self.field_op = FieldOp.objects.create(
            name='Test Operation',
            slug='test-op',
            latitude=34.0,
            longitude=-118.0
        )
        self.aid_type = AidType.objects.create(name='Test Aid Type', slug='test-aid')
        self.field_op.aid_types.add(self.aid_type)

        # Create test aid request
        self.aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
            requester_first_name='Test',
            requester_last_name='User',
            status='NEW'
        )

    def test_field_op_list_GET_authenticated(self):
        """Test authenticated access to field_op_list view."""
        self.client.force_login(self.user)
        response = self.client.get(reverse('field_op_list'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/field_op_list.html')
        self.assertContains(response, 'Test Operation')

    def test_field_op_list_GET_unauthenticated(self):
        """Test unauthenticated access to field_op_list view."""
        response = self.client.get(reverse('field_op_list'))
        self.assertEqual(response.status_code, 302)  # Redirects to login

    def test_field_op_detail_GET_authenticated(self):
        """Test authenticated access to field_op_detail view."""
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('field_op_detail', kwargs={'field_op': self.field_op.slug})
        )
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/field_op_detail.html')
        self.assertContains(response, 'Test Operation')

    def test_field_op_create_view_renders(self):
        """
        Test that the FieldOp creation page renders correctly without syntax errors.
        This test would have caught the duplicate block tag issue.
        """
        self.client.force_login(self.user)
        url = reverse('field_op_create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/field_op_form.html')

    def test_aid_request_list_GET_authenticated(self):
        """Test authenticated access to aid_request_list view."""
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('aid_request_list', kwargs={'field_op': self.field_op.slug})
        )
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/aid_request_list.html')
        self.assertContains(response, self.aid_request.requester_full_name)

    def test_aid_request_detail_renders_location_card(self):
        """Test that the aid request detail page renders the location card include."""
        # Add a location to the aid request
        location = AidLocation.objects.create(
            aid_request=self.aid_request,
            latitude=34.1,
            longitude=-118.1,
            source='manual'
        )

        self.client.force_login(self.user)
        response = self.client.get(
            reverse('aid_request_detail', kwargs={
                'field_op': self.field_op.slug,
                'pk': self.aid_request.id
            })
        )
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/includes/aid_locations_list.html')
        self.assertTemplateUsed(response, 'aidrequests/includes/aid_location_card.html')

        # Check for a specific element from the new card structure
        self.assertContains(response, f'id="coords-{location.pk}"')
        # Check for the clipboard icon
        self.assertContains(response, 'class="bi bi-clipboard"')

    def test_aid_request_create_POST_authenticated(self):
        """Test authenticated creation of aid request."""
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('aid_request_create', kwargs={'field_op': self.field_op.slug}),
            {
                'field_op': self.field_op.id,
                'aid_type': self.aid_type.slug,
                'full_name': 'Jane Doe',
                'contact_info': 'jane@example.com',
                'street_address': '123 Main St',
                'city': 'Anytown',
                'state': 'CA',
                'latitude': '34.0522',
                'longitude': '-118.2437',
            }
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            AidRequest.objects.filter(requester_first_name='Jane').exists()
        )

    def test_aid_request_create_POST_invalid_data(self):
        """Test aid request creation with invalid data."""
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('aid_request_create', kwargs={'field_op': self.field_op.slug}),
            {
                'field_op': self.field_op.id,
                'aid_type': self.aid_type.slug,
                'full_name': '',  # Invalid: empty name
                'contact_info': 'invalid@example.com',
                'latitude': '34.0522',
                'longitude': '-118.2437',
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            AidRequest.objects.filter(requester_last_name='Invalid').exists()
        )
        self.assertContains(response, 'This field is required.')

    def test_ajax_filter_aid_requests(self):
        """Test AJAX filtering of aid requests."""
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('get_aid_requests_json', kwargs={'field_op': self.field_op.slug}),
            {'status': 'new'},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(len(data) > 0)
        self.assertEqual(data[0]['status'], 'NEW')


class AidRequestSubmissionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpassword'
        )
        self.field_op = FieldOp.objects.create(
            name="Test Field Op",
            slug="test-field-op",
            latitude=34.0,
            longitude=-118.0
        )
        self.aid_type = AidType.objects.create(
            name="Food and Water",
            slug="food-and-water"
        )
        self.field_op.aid_types.add(self.aid_type)
        self.client = Client()

    def test_submission_form_loads(self):
        """Test that the public submission form loads correctly."""
        response = self.client.get(reverse('aid_request_create', kwargs={'field_op': self.field_op.slug}))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/aid_request_form_c.html')
        self.assertContains(response, "What kind of aid is needed?")

    def test_successful_submission(self):
        """Test a complete and successful submission of the aid request form."""
        aid_request_count = AidRequest.objects.count()
        aid_location_count = AidLocation.objects.count()

        form_data = {
            'field_op': self.field_op.id,
            'full_name': 'John Doe',
            'contact_info': 'john.doe@example.com',
            'aid_type': self.aid_type.slug,
            'street_address': '123 Main St',
            'city': 'Anytown',
            'state': 'CA',
            'country': 'US',
            'latitude': '34.0522',
            'longitude': '-118.2437',
            'location_source': 'user_picked',
            'geocode_json': '{"some": "data"}',
            'location_freeform_address': '123 Main St, Anytown, CA',
            'group_size': 2,
            'aid_description': 'We need help.',
            'has_medical_needs': 'on',
            'medical_needs': 'Standard first aid kit',
        }

        response = self.client.post(
            reverse('aid_request_create', kwargs={'field_op': self.field_op.slug}),
            data=form_data,
        )

        self.assertEqual(AidRequest.objects.count(), aid_request_count + 1)
        self.assertEqual(AidLocation.objects.count(), aid_location_count + 1)

        new_aid_request = AidRequest.objects.latest('id')
        self.assertEqual(new_aid_request.requester_first_name, 'John')
        self.assertEqual(new_aid_request.requester_email, 'john.doe@example.com')
        self.assertEqual(new_aid_request.field_op, self.field_op)
        self.assertEqual(new_aid_request.aid_type, self.aid_type)
        self.assertEqual(new_aid_request.group_size, 2)
        self.assertEqual(new_aid_request.medical_needs, 'Standard first aid kit')

        new_location = new_aid_request.locations.first()
        self.assertIsNotNone(new_location)
        self.assertEqual(float(new_location.latitude), 34.0522)

        self.assertRedirects(
            response,
            reverse('aid_request_submitted', kwargs={'field_op': self.field_op.slug, 'pk': new_aid_request.pk}),
            status_code=302,
            target_status_code=200
        )

    def test_submission_fails_without_full_name(self):
        """Test that submission fails if full_name is not provided."""
        aid_request_count = AidRequest.objects.count()

        form_data = {
            'field_op': self.field_op.id,
            'full_name': '',
            'contact_info': 'jane.doe@example.com',
            'aid_type': self.aid_type.slug,
            'latitude': '34.0522',
            'longitude': '-118.2437',
            'group_size': 1,
            'aid_description': 'Missing name.',
        }

        response = self.client.post(
            reverse('aid_request_create', kwargs={'field_op': self.field_op.slug}),
            data=form_data
        )

        self.assertEqual(response.status_code, 200) # Should re-render the form
        self.assertFormError(response.context['form'], 'full_name', 'This field is required.')
        self.assertEqual(AidRequest.objects.count(), aid_request_count) # No new request created


class AidRequestUpdateLoggingTests(TestCase):
    def setUp(self):
        """Set up a user, field op, and an aid request to be updated."""
        self.user = User.objects.create_user(username='testlogger', password='password', is_staff=True)
        self.field_op = FieldOp.objects.create(name="Logging Test Op", slug="log-op", latitude=10, longitude=10)
        self.aid_type = AidType.objects.create(name="Logging Aid", slug="log-aid")
        self.field_op.aid_types.add(self.aid_type)
        self.aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            aid_type=self.aid_type,
            requester_first_name="Initial",
            requester_last_name="User",
        )
        self.client = Client()
        self.client.force_login(self.user)

    def test_status_and_priority_update_logging(self):
        """
        Test that updating status and priority creates a well-formed ActionLog,
        including a custom note.
        """
        print("\n--- Testing Status & Priority Update ---")
        update_url = reverse('aid_request_ajax_update', kwargs={'field_op': self.field_op.slug, 'pk': self.aid_request.pk})

        update_data = {
            'status': 'assigned',
            'priority': 'high',
            'note': 'This is a **Markdown** note.',
            'note_markdown': True
        }

        response = self.client.post(
            update_url,
            data=json.dumps(update_data),
            content_type='application/json'
        )

        self.assertEqual(response.status_code, 200)
        self.aid_request.refresh_from_db()
        self.assertEqual(self.aid_request.status, 'assigned')

        latest_log = self.aid_request.action_logs.latest('created_at')
        self.assertEqual(latest_log.event_name, 'Aid Request Updated')
        expected_status_text = """Status:
 from: New
   to: Assigned"""
        expected_priority_text = """Priority:
 from: None
   to: High"""
        self.assertIn(expected_status_text, latest_log.event_text)
        self.assertIn(expected_priority_text, latest_log.event_text)
        self.assertEqual(latest_log.note, 'This is a **Markdown** note.')
        self.assertTrue(latest_log.note_markdown)

        # Report for review
        print(f"Event Name: {latest_log.event_name}")
        print(f"Event Text:\n{latest_log.event_text}")
        print(f"Note: {latest_log.note} (Markdown: {latest_log.note_markdown})")

    def test_requester_info_update_logging(self):
        """
        Test that updating requester info via HTMX creates a well-formed ActionLog.
        """
        print("\n--- Testing Requester Info Update ---")
        update_url = reverse('save_requester_info', kwargs={'field_op': self.field_op.slug, 'pk': self.aid_request.pk})

        update_data = {
            'requester_first_name': 'Updated',
            'requester_last_name': 'Name',
            'requester_phone': '1234567890',
            'requester_email': 'new@email.com',
            'group_size': 5,
            'note': 'No markdown for this one.',
            'note_markdown': False
        }

        response = self.client.post(update_url, data=update_data)

        self.assertEqual(response.status_code, 200) # This view returns a partial
        self.aid_request.refresh_from_db()
        self.assertEqual(self.aid_request.requester_first_name, 'Updated')
        self.assertEqual(self.aid_request.group_size, 5)

        latest_log = self.aid_request.action_logs.latest('created_at')
        self.assertEqual(latest_log.event_name, 'Requester Info Updated')
        self.assertIn("Requester First Name: 'Initial' → 'Updated'", latest_log.event_text)
        self.assertIn("Requester Last Name: 'User' → 'Name'", latest_log.event_text)
        self.assertIn("Group Size: 'None' → '5'", latest_log.event_text)
        self.assertEqual(latest_log.note, 'No markdown for this one.')
        self.assertFalse(latest_log.note_markdown)

        # Report for review
        print(f"Event Name: {latest_log.event_name}")
        print(f"Event Text:\n{latest_log.event_text}")
        print(f"Note: {latest_log.note} (Markdown: {latest_log.note_markdown})")

    def test_address_update_logging(self):
        """
        Test that updating address info via HTMX creates a well-formed ActionLog.
        """
        print("\n--- Testing Address Info Update ---")
        update_url = reverse('save_address_info', kwargs={'field_op': self.field_op.slug, 'pk': self.aid_request.pk})

        self.aid_request.street_address = "123 Old St"
        self.aid_request.save()

        update_data = {
            'street_address': '456 New Ave',
            'city': 'Newville',
            'state': 'NY',
            'zip_code': '10001',
            'note': 'Address was incorrect.',
        }

        response = self.client.post(update_url, data=update_data)

        self.assertEqual(response.status_code, 200)
        self.aid_request.refresh_from_db()
        self.assertEqual(self.aid_request.city, 'Newville')

        latest_log = self.aid_request.action_logs.latest('created_at')
        self.assertEqual(latest_log.event_name, 'Address Info Updated')
        self.assertIn("Street Address: '123 Old St' → '456 New Ave'", latest_log.event_text)
        self.assertIn("City: '' → 'Newville'", latest_log.event_text)
        self.assertEqual(latest_log.note, 'Address was incorrect.')
        self.assertFalse(latest_log.note_markdown)

        # Report for review
        print(f"Event Name: {latest_log.event_name}")
        print(f"Event Text:\n{latest_log.event_text}")
        print(f"Note: {latest_log.note} (Markdown: {latest_log.note_markdown})")

    def test_detail_field_update_logging(self):
        """
        Test that updating a generic detail field (e.g., aid_description)
        creates a well-formed ActionLog.
        """
        print("\n--- Testing Detail Field Update (Aid Description) ---")
        field_to_test = 'aid_description'
        # Correctly use the specific URL name for the field
        update_url = reverse(f'save_{field_to_test}', kwargs={
            'field_op': self.field_op.slug,
            'pk': self.aid_request.pk,
        })

        update_data = {
            'value': 'This is the new description.',
            'note': 'Clarified the request details.',
            'note_markdown': 'false'
        }

        response = self.client.post(update_url, data=update_data)

        self.assertEqual(response.status_code, 200)
        self.aid_request.refresh_from_db()
        self.assertEqual(self.aid_request.aid_description, 'This is the new description.')

        latest_log = self.aid_request.action_logs.latest('created_at')
        self.assertEqual(latest_log.event_name, 'Aid Request Updated')
        expected_description_text = """Aid Description:
 from: None
   to: This is the new description."""
        self.assertIn(expected_description_text, latest_log.event_text)
        self.assertEqual(latest_log.note, 'Clarified the request details.')
        self.assertFalse(latest_log.note_markdown)

        # Report for review
        print(f"Event Name: {latest_log.event_name}")
        print(f"Event Text:\n{latest_log.event_text}")
        print(f"Note: {latest_log.note} (Markdown: {latest_log.note_markdown})")
