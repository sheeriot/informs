from django.test import SimpleTestCase
from django.urls import reverse, resolve
from ..views.field_op_list import FieldOpListView
from ..views.field_op import FieldOpDetailView
from ..views.aid_request_list import AidRequestListView
from ..views.aid_request_detail import AidRequestDetailView
from ..views.aid_request import AidRequestCreateView, AidRequestUpdateView


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

    def test_aid_request_update_url_resolves(self):
        """Test aid_request_update URL pattern."""
        url = reverse('aid_request_update', kwargs={
            'field_op': 'test-op',
            'pk': 1
        })
        self.assertEqual(resolve(url).func.view_class, AidRequestUpdateView)
