from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from ..models import FieldOp, AidRequest
import json

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
                permission_obj = Permission.objects.get(
                    content_type=content_type,
                    codename=f'{permission}_{model._meta.model_name}'
                )
                self.user.user_permissions.add(permission_obj)

        # Create test field operation
        self.field_op = FieldOp.objects.create(
            name='Test Operation',
            slug='test-op',
            latitude=34.0,
            longitude=-118.0
        )

        # Create test aid request
        self.aid_request = AidRequest.objects.create(
            field_op=self.field_op,
            title='Test Aid Request',
            description='Test Description',
            latitude=34.1,
            longitude=-118.1,
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
            reverse('field_op_detail', args=[self.field_op.id])
        )
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/field_op_detail.html')
        self.assertContains(response, 'Test Operation')

    def test_aid_request_list_GET_authenticated(self):
        """Test authenticated access to aid_request_list view."""
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('aid_request_list', kwargs={'field_op': self.field_op.slug})
        )
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/aid_request_list.html')
        self.assertContains(response, 'Test Aid Request')

    def test_aid_request_detail_GET_authenticated(self):
        """Test authenticated access to aid_request_detail view."""
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('aid_request_detail', kwargs={
                'field_op': self.field_op.slug,
                'aid_request_id': self.aid_request.id
            })
        )
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'aidrequests/aid_request_detail.html')
        self.assertContains(response, 'John Doe')

    def test_aid_request_create_POST_authenticated(self):
        """Test authenticated creation of aid request."""
        self.client.force_login(self.user)
        self.field_op.aid_types.add(self.aid_type)
        response = self.client.post(
            reverse('aid_request_create', kwargs={'field_op': self.field_op.slug}),
            {
                'aid_type': self.aid_type.pk,
                'full_name': 'Jane Doe',
                'contact_info': 'jane@example.com',
                'street_address': '123 Main St',
                'city': 'Anytown',
                'state': 'CA'
            }
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            AidRequest.objects.filter(aid_first_name='Jane').exists()
        )

    def test_aid_request_create_POST_invalid_data(self):
        """Test aid request creation with invalid data."""
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('aid_request_create', kwargs={'field_op': self.field_op.slug}),
            {
                'full_name': '',  # Invalid: empty name
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            AidRequest.objects.filter(aid_last_name='Invalid').exists()
        )
        self.assertContains(response, 'This field is required')

    def test_aid_request_update_POST_authenticated(self):
        """Test authenticated update of aid request."""
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('aid_request_update', kwargs={
                'field_op': self.field_op.slug,
                'pk': self.aid_request.pk
            }),
            {
                'aid_type': self.aid_type.pk,
                'aid_first_name': 'John',
                'aid_last_name': 'Smith',
                'status': 'assigned'
            }
        )
        self.assertEqual(response.status_code, 302)
        updated_request = AidRequest.objects.get(id=self.aid_request.id)
        self.assertEqual(updated_request.aid_last_name, 'Smith')
        self.assertEqual(updated_request.status, 'assigned')

    def test_ajax_filter_aid_requests(self):
        """Test AJAX filtering of aid requests."""
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('aid_request_list', kwargs={'field_op': self.field_op.slug}),
            {'status': 'new'},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(len(data) > 0)
        self.assertEqual(data[0]['status'], 'new')
