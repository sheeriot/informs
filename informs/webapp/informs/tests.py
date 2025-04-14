from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User


class InformsURLTests(TestCase):
    """Test the URLs of the informs app"""

    def setUp(self):
        # Create a test user for authentication tests
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpassword'
        )
        self.client = Client()

    def test_home_url(self):
        """Test that the home URL resolves and returns 200"""
        response = self.client.get(reverse('home'))
        self.assertEqual(response.status_code, 200)

    def test_admin_url(self):
        """Test that the admin URL resolves and returns 302 (redirect to login)"""
        response = self.client.get(reverse('admin:index'))
        self.assertEqual(response.status_code, 302)

    def test_authenticated_admin_url(self):
        """Test that the admin URL returns 200 when authenticated as admin"""
        # Make the user a superuser
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save()

        # Login
        self.client.login(username='testuser', password='testpassword')

        response = self.client.get(reverse('admin:index'))
        self.assertEqual(response.status_code, 200)
