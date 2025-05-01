from django.test import SimpleTestCase
from django.urls import reverse, resolve
from ..views.views import (
    field_op_list,
    field_op_detail,
    aid_request_list,
    aid_request_detail,
    aid_request_create,
    aid_request_update,
)

class TestUrls(SimpleTestCase):
    """Test URL configuration for aidrequests app."""

    def test_field_op_list_url_resolves(self):
        """Test field_op_list URL pattern."""
        url = reverse('field_op_list')
        self.assertEqual(resolve(url).func, field_op_list)
        self.assertEqual(url, '/field-ops/')

    def test_field_op_detail_url_resolves(self):
        """Test field_op_detail URL pattern."""
        url = reverse('field_op_detail', args=[1])
        self.assertEqual(resolve(url).func, field_op_detail)
        self.assertEqual(url, '/field-ops/1/')

    def test_aid_request_list_url_resolves(self):
        """Test aid_request_list URL pattern."""
        url = reverse('aid_request_list', kwargs={'field_op': 'test-op'})
        self.assertEqual(resolve(url).func, aid_request_list)
        self.assertEqual(url, '/field-ops/test-op/aid-requests/')

    def test_aid_request_detail_url_resolves(self):
        """Test aid_request_detail URL pattern."""
        url = reverse('aid_request_detail', kwargs={
            'field_op': 'test-op',
            'aid_request_id': 1
        })
        self.assertEqual(resolve(url).func, aid_request_detail)
        self.assertEqual(url, '/field-ops/test-op/aid-requests/1/')

    def test_aid_request_create_url_resolves(self):
        """Test aid_request_create URL pattern."""
        url = reverse('aid_request_create', kwargs={'field_op': 'test-op'})
        self.assertEqual(resolve(url).func, aid_request_create)
        self.assertEqual(url, '/field-ops/test-op/aid-requests/create/')

    def test_aid_request_update_url_resolves(self):
        """Test aid_request_update URL pattern."""
        url = reverse('aid_request_update', kwargs={
            'field_op': 'test-op',
            'aid_request_id': 1
        })
        self.assertEqual(resolve(url).func, aid_request_update)
        self.assertEqual(url, '/field-ops/test-op/aid-requests/1/update/')
