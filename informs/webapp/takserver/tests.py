from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import TakServer
from .cot import CoTEvent


class TakServerModelTests(TestCase):
    """Test the TakServer model"""

    def setUp(self):
        # Create a test certificate file
        self.cert_content = b"-----BEGIN CERTIFICATE-----\nMIIDsTCCApmgAwIBAgIUBekCqL\n-----END CERTIFICATE-----"
        self.cert_file = SimpleUploadedFile("test_cert.pem", self.cert_content, content_type="application/x-pem-file")

    def test_create_takserver(self):
        """Test creating a TakServer instance"""
        server = TakServer.objects.create(
            name="test-server",
            dns_name="test.example.com",
            cert_trust=self.cert_file,
            cert_private=self.cert_file,
            notes="Test server for unit tests"
        )

        self.assertEqual(TakServer.objects.count(), 1)
        self.assertEqual(server.name, "test-server")
        self.assertEqual(server.dns_name, "test.example.com")
        self.assertEqual(server.notes, "Test server for unit tests")

    def test_takserver_str(self):
        """Test the string representation of a TakServer"""
        server = TakServer.objects.create(
            name="test-server",
            dns_name="test.example.com",
            cert_trust=self.cert_file,
            cert_private=self.cert_file
        )

        self.assertEqual(str(server), "test-server")


class CoTEventTests(TestCase):
    """Test the CoTEvent functionality"""

    def test_cot_event_creation(self):
        """Test creating a CoT event"""
        event = CoTEvent(
            event_type="a-f-G-U-C",
            uid="test-uid",
            how="m-g",
            callsign="Test Callsign",
            lat=34.0,
            lon=-118.0,
            hae=0,
            ce=9999999.0,
            le=9999999.0
        )

        # Test event properties
        self.assertEqual(event.event_type, "a-f-G-U-C")
        self.assertEqual(event.callsign, "Test Callsign")
        self.assertEqual(event.lat, 34.0)
        self.assertEqual(event.lon, -118.0)

        # Test XML generation (basic validation)
        xml = event.to_xml()
        self.assertIn('event', xml)
        self.assertIn('point', xml)
        self.assertIn('detail', xml)
        self.assertIn('uid="test-uid"', xml)
