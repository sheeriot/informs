import json
import os
from datetime import datetime

import httpx
from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.sessions.models import Session
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.template.response import TemplateResponse
from django.urls import reverse_lazy, reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django_q.tasks import async_task, fetch

from .models import TakServer, MQTTGateway
from .forms import TakServerForm, MQTTGatewayForm
from .timezone_utils import parse_iso_to_local, format_timestamp_info

# TAKMesh Gateway API URL (internal Docker network)
TAKMESH_API_URL = getattr(settings, 'TAKMESH_API_URL', 'http://takmesh:8090')


def format_payload_json(payload: dict) -> str:
    """
    Format JSON payload with logical field ordering and pretty formatting.

    Orders fields logically:
    1. Message type and identifiers (type, timestamp, from, sender, to, id)
    2. RF/Mesh fields (hops_away, hop_start, rssi, snr, channel)
    3. Nested objects (payload, position, etc.)
    4. Other fields

    Args:
        payload: Raw payload dictionary

    Returns:
        Formatted JSON string with logical ordering and proper indentation
    """
    if not isinstance(payload, dict):
        return json.dumps(payload, indent=2)

    # Define field order priority (lower number = earlier in output)
    field_order = {
        'type': 1,
        'timestamp': 2,
        'from': 3,
        'sender': 4,
        'to': 5,
        'id': 6,
        'hops_away': 7,
        'hop_start': 8,
        'rssi': 9,
        'snr': 10,
        'channel': 11,
        'payload': 20,  # Nested objects come later
        'position': 21,
    }

    # Separate fields by priority
    ordered_fields = []
    nested_fields = []
    other_fields = []

    for key, value in payload.items():
        priority = field_order.get(key, 99)
        if priority < 20:
            ordered_fields.append((priority, key, value))
        elif isinstance(value, (dict, list)):
            nested_fields.append((priority, key, value))
        else:
            other_fields.append((priority, key, value))

    # Sort each group
    ordered_fields.sort(key=lambda x: (x[0], x[1]))
    nested_fields.sort(key=lambda x: (x[0], x[1]))
    other_fields.sort(key=lambda x: (x[0], x[1]))

    # Build ordered dictionary
    ordered_payload = {}
    for _, key, value in ordered_fields:
        ordered_payload[key] = value
    for _, key, value in nested_fields:
        ordered_payload[key] = value
    for _, key, value in other_fields:
        ordered_payload[key] = value

    # Format with indentation
    return json.dumps(ordered_payload, indent=2, ensure_ascii=False)


class TakServerListView(LoginRequiredMixin, PermissionRequiredMixin, ListView):
    """List all TAK Servers."""
    permission_required = 'takserver.view_takserver'
    model = TakServer
    template_name = 'takserver/takserver_list.html'
    context_object_name = 'takservers'

    def get_queryset(self):
        return TakServer.objects.all().prefetch_related('field_ops')


class TakServerDetailView(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    """View TAK Server details."""
    permission_required = 'takserver.view_takserver'
    model = TakServer
    template_name = 'takserver/takserver_detail.html'
    context_object_name = 'takserver'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        takserver = self.object

        # Check if certificate files exist
        context['cert_trust_exists'] = (
            takserver.cert_trust and
            os.path.exists(takserver.cert_trust.path)
        )
        context['cert_private_exists'] = (
            takserver.cert_private and
            os.path.exists(takserver.cert_private.path)
        )

        # Get associated field ops
        context['field_ops'] = takserver.field_ops.all()

        return context


class TakServerCreateView(LoginRequiredMixin, PermissionRequiredMixin, CreateView):
    """Create a new TAK Server."""
    permission_required = 'takserver.add_takserver'
    model = TakServer
    form_class = TakServerForm
    template_name = 'takserver/takserver_form.html'

    def get_success_url(self):
        return reverse('takserver_detail', kwargs={'pk': self.object.pk})

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['action'] = 'Create'
        return context


class TakServerUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    """Update an existing TAK Server."""
    permission_required = 'takserver.change_takserver'
    model = TakServer
    form_class = TakServerForm
    template_name = 'takserver/takserver_form.html'

    def get_success_url(self):
        next_url = self.request.GET.get('next')
        if next_url:
            return next_url
        return reverse('takserver_detail', kwargs={'pk': self.object.pk})

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['action'] = 'Update'
        return context


@login_required
@permission_required('takserver.view_takserver')
@require_http_methods(["POST"])
def send_test_cot(request, pk):
    """
    Send a test COT message to verify TAK Server connectivity.
    Uses the first associated FieldOp to send a field marker.
    """
    takserver = get_object_or_404(TakServer, pk=pk)

    # Get the first associated FieldOp
    field_op = takserver.field_ops.first()
    if not field_op:
        return JsonResponse({
            'status': 'error',
            'message': 'No Field Op is associated with this TAK Server. '
                       'Please assign a Field Op first.'
        })

    # Check if COT is disabled for this field op
    if field_op.disable_cot:
        return JsonResponse({
            'status': 'error',
            'message': f'COT is disabled for Field Op "{field_op.name}". '
                       'Enable it first to send test messages.'
        })

    try:
        # Parse optional test message from request
        try:
            data = json.loads(request.body)
            test_message = data.get('message', '')
        except (json.JSONDecodeError, ValueError):
            test_message = ''

        from .timezone_utils import now_utc
        timestamp_now = now_utc().strftime('%Y%m%d-%H%M%S')
        task_title = f"TAK-Test-{takserver.name}_{timestamp_now}"

        # Queue the COT send task
        task_id = async_task(
            'aidrequests.tasks.send_cot_task',
            field_op_slug=field_op.slug,
            mark_type='field',
            task_name=task_title
        )

        return JsonResponse({
            'status': 'success',
            'task_id': task_id,
            'message': f'Test COT queued for {field_op.name}',
            'field_op': field_op.slug
        })

    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': f'Error sending test COT: {str(e)}'
        })


@login_required
@permission_required('takserver.view_takserver')
@require_http_methods(["GET"])
def check_test_status(request, pk):
    """Check the status of a test COT task."""
    task_id = request.GET.get('task_id')
    if not task_id:
        return JsonResponse({
            'status': 'error',
            'message': 'No task ID provided.'
        })

    try:
        task = fetch(task_id)
        if task is None:
            return JsonResponse({
                'status': 'PENDING',
                'message': 'Task is queued or running...'
            })
        elif task.success:
            return JsonResponse({
                'status': 'SUCCESS',
                'message': task.result or 'Test COT sent successfully!'
            })
        else:
            return JsonResponse({
                'status': 'FAILURE',
                'message': task.result or 'Task failed.'
            })
    except Exception as e:
        return JsonResponse({
            'status': 'ERROR',
            'message': str(e)
        })


# =============================================================================
# MQTT Gateway Views
# =============================================================================

def _get_gateway_status():
    """Helper to get gateway status from takmesh API."""
    try:
        # Increased timeout - service may be slow to respond
        # Try health endpoint first (simpler, faster)
        with httpx.Client(timeout=10.0) as client:
            # Try /health first as it's simpler and faster
            try:
                health_response = client.get(f"{TAKMESH_API_URL}/health", timeout=5.0)
                if health_response.status_code != 200:
                    return None
            except httpx.TimeoutException:
                return None
            except Exception:
                return None

            # If health works, try /status
            response = client.get(f"{TAKMESH_API_URL}/status", timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                return data
    except (httpx.TimeoutException, httpx.ConnectError, Exception):
        pass
    return None


def _push_gateway_config(gateway: MQTTGateway) -> dict:
    """
    Push gateway configuration to the takmesh container.
    Called when an MQTTGateway is created or updated.
    Returns dict with success status and message.
    """
    import os

    if not gateway.is_enabled:
        return {'success': True, 'message': 'Gateway is disabled, config not pushed'}

    # Build config payload from the gateway model
    config_data = {
        'mqtt_host': gateway.mqtt_host,
        'mqtt_port': gateway.mqtt_port,
        'mqtt_username': gateway.mqtt_username or None,
        'mqtt_password': gateway.mqtt_password or None,
        'mqtt_subscribe_topic': gateway.mqtt_subscribe_topic,
        'mesh_channel': gateway.mesh_channel,
        'gateway_uid': gateway.gateway_uid,
        'gateway_callsign': gateway.gateway_callsign,
    }

    # Add TAK server config from the linked TakServer
    if gateway.takserver:
        config_data['tak_host'] = gateway.takserver.dns_name
        # TAK streaming port (default 8089)
        config_data['tak_port'] = 8089
        # Certificate paths from TakServer model
        config_data['tak_cert_path'] = f'/opt/app/certs/certprivate/{gateway.takserver.cert_private.name}'
        config_data['tak_ca_path'] = f'/opt/app/certs/certtrust/{gateway.takserver.cert_trust.name}'

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{TAKMESH_API_URL}/config",
                json=config_data
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'message': 'Configuration pushed to gateway',
                    'data': data
                }
            else:
                return {
                    'success': False,
                    'message': f'API error: {response.status_code}'
                }
    except httpx.ConnectError:
        return {
            'success': False,
            'message': 'Cannot connect to TAKMesh gateway service'
        }
    except Exception as e:
        return {
            'success': False,
            'message': f'Error: {str(e)}'
        }


class MQTTGatewayListView(LoginRequiredMixin, PermissionRequiredMixin, ListView):
    """List all MQTT Gateways."""
    permission_required = 'takserver.view_mqttgateway'
    model = MQTTGateway
    template_name = 'takserver/mqttgateway_list.html'
    context_object_name = 'gateways'

    def get_queryset(self):
        return MQTTGateway.objects.select_related('takserver').all()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Get gateway status from API
        context['gateway_status'] = _get_gateway_status()
        return context


class MQTTGatewayDetailView(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    """View MQTT Gateway details."""
    permission_required = 'takserver.view_mqttgateway'
    model = MQTTGateway
    template_name = 'takserver/mqttgateway_detail.html'
    context_object_name = 'gateway'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gateway = self.object

        # TAK server name for forwarding label
        context['tak_server_name'] = gateway.takserver.name if gateway.takserver else 'TAK'

        # Construct WebSocket URL for real-time message streaming
        # WebSocket is proxied through nginx at /ws/ path (see README.md)
        # Browser connects via wss://domain.com/ws/messages, nginx proxies to takmesh:8090
        protocol = 'wss:' if self.request.is_secure() else 'ws:'
        host = self.request.get_host().split(':')[0]  # Remove port if present
        # Use same host/port as Django app, nginx handles WebSocket upgrade and proxying
        context['websocket_url'] = f"{protocol}//{host}/ws/messages"

        # Azure Maps key for embedded maps
        context['azure_maps_key'] = settings.AZURE_MAPS_KEY

        return context


class MQTTGatewayCreateView(LoginRequiredMixin, PermissionRequiredMixin, CreateView):
    """Create a new MQTT Gateway."""
    permission_required = 'takserver.add_mqttgateway'
    model = MQTTGateway
    form_class = MQTTGatewayForm
    template_name = 'takserver/mqttgateway_form.html'

    def get_success_url(self):
        return reverse('mqttgateway_detail', kwargs={'pk': self.object.pk})

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['action'] = 'Create'
        return context

    def get_template_names(self):
        if self.request.htmx:
            return ['takserver/partials/_mqttgateway_form_modal.html']
        return [self.template_name]

    def form_valid(self, form):
        response = super().form_valid(form)
        # Push config to takmesh container
        _push_gateway_config(self.object)
        if self.request.htmx:
            # Return a redirect trigger for HTMX
            return HttpResponse(
                status=204,
                headers={
                    'HX-Redirect': self.get_success_url()
                }
            )
        return response


class MQTTGatewayUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    """Update an existing MQTT Gateway."""
    permission_required = 'takserver.change_mqttgateway'
    model = MQTTGateway
    form_class = MQTTGatewayForm
    template_name = 'takserver/mqttgateway_form.html'

    def get_success_url(self):
        return reverse('mqttgateway_detail', kwargs={'pk': self.object.pk})

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['action'] = 'Update'
        return context

    def get_template_names(self):
        if self.request.htmx:
            return ['takserver/partials/_mqttgateway_form_modal.html']
        return [self.template_name]

    def form_valid(self, form):
        response = super().form_valid(form)
        # Push config to takmesh container
        _push_gateway_config(self.object)
        if self.request.htmx:
            return HttpResponse(
                status=204,
                headers={
                    'HX-Redirect': self.get_success_url()
                }
            )
        return response


class MQTTGatewayDeleteView(LoginRequiredMixin, PermissionRequiredMixin, DeleteView):
    """Delete an MQTT Gateway."""
    permission_required = 'takserver.delete_mqttgateway'
    model = MQTTGateway
    template_name = 'takserver/partials/_mqttgateway_delete_modal.html'
    success_url = reverse_lazy('mqttgateway_list')

    def delete(self, request, *args, **kwargs):
        response = super().delete(request, *args, **kwargs)
        if request.htmx:
            return HttpResponse(
                status=204,
                headers={
                    'HX-Redirect': str(self.success_url)
                }
            )
        return response


@login_required
@permission_required('takserver.view_mqttgateway')
@require_http_methods(["GET"])
def mqttgateway_status(request, pk):
    """HTMX endpoint to get gateway status badge and body (combined)."""
    gateway = get_object_or_404(MQTTGateway, pk=pk)
    status = _get_gateway_status()

    return render(request, 'takserver/partials/_mqttgateway_status.html', {
        'gateway': gateway,
        'gateway_status': status
    })


@login_required
@permission_required('takserver.view_mqttgateway')
@require_http_methods(["POST"])
def mqttgateway_test_connection(request, pk):
    """HTMX endpoint to test MQTT broker connection directly (not through gateway).
    Tests connection, publishes a test message, and subscribes to verify round-trip."""
    gateway = get_object_or_404(MQTTGateway, pk=pk)

    result = {
        'success': False,
        'message': 'Unknown error',
        'gateway': gateway,
        'test_type': 'direct',
        'details': {}
    }

    # Test MQTT broker connection directly using paho-mqtt
    try:
        import paho.mqtt.client as mqtt
        import socket
        import time
        import uuid

        # Create MQTT client with unique ID
        test_client_id = f"informs-test-{uuid.uuid4().hex[:8]}"
        client = mqtt.Client(client_id=test_client_id, protocol=mqtt.MQTTv311)

        # Set credentials if provided
        if gateway.mqtt_username:
            client.username_pw_set(gateway.mqtt_username, gateway.mqtt_password or '')

        # Set connection callback
        connected = {'status': False, 'error': None}
        messages_received = []
        subscribe_confirmed = False

        def on_connect(client, userdata, flags, rc, properties=None):
            if rc == 0:
                connected['status'] = True
            else:
                connected['error'] = f"Connection refused (code {rc})"

        def on_connect_fail(client, userdata):
            connected['error'] = "Connection failed"

        def on_subscribe(client, userdata, mid, granted_qos, properties=None):
            nonlocal subscribe_confirmed
            subscribe_confirmed = True

        def on_message(client, userdata, msg):
            messages_received.append({
                'topic': msg.topic,
                'payload': msg.payload.decode(),
                'timestamp': time.time()
            })

        client.on_connect = on_connect
        client.on_connect_fail = on_connect_fail
        client.on_subscribe = on_subscribe
        client.on_message = on_message

        # Attempt connection with timeout
        try:
            connect_start = time.time()
            client.connect_async(gateway.mqtt_host, gateway.mqtt_port, keepalive=60)
            client.loop_start()

            # Wait for connection (max 5 seconds)
            timeout = 5.0
            start_time = time.time()
            while not connected['status'] and connected['error'] is None:
                if (time.time() - start_time) >= timeout:
                    connected['error'] = "Connection timeout"
                    break
                time.sleep(0.1)

            connect_time = (time.time() - connect_start) * 1000  # milliseconds

            if not connected['status']:
                error_msg = connected['error'] or "Connection timeout"
                result['message'] = f"Failed to connect to {gateway.mqtt_host}:{gateway.mqtt_port}: {error_msg}"
                result['error'] = error_msg
                result['details']['connect_time_ms'] = round(connect_time, 2)
                client.loop_stop()
                try:
                    client.disconnect()
                except:
                    pass
                return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)

            # Test publish/subscribe round-trip
            test_topic = f"informs/test/{test_client_id}"
            test_message = f"test-{time.time()}"

            # Subscribe to test topic
            subscribe_start = time.time()
            result_code, mid = client.subscribe(test_topic, qos=1)

            # Wait for subscription confirmation
            subscribe_timeout = 2.0
            subscribe_start_time = time.time()
            while not subscribe_confirmed and (time.time() - subscribe_start_time) < subscribe_timeout:
                time.sleep(0.1)

            subscribe_time = (time.time() - subscribe_start) * 1000

            if not subscribe_confirmed:
                result['message'] = f"Connected but subscription failed"
                result['error'] = "Subscription timeout"
                result['details']['connect_time_ms'] = round(connect_time, 2)
                result['details']['subscribe_time_ms'] = round(subscribe_time, 2)
                client.loop_stop()
                try:
                    client.disconnect()
                except:
                    pass
                return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)

            # Publish test message
            publish_start = time.time()
            publish_info = client.publish(test_topic, test_message, qos=1)
            publish_info.wait_for_publish(timeout=2.0)
            publish_time = (time.time() - publish_start) * 1000

            # Wait for message to be received (max 2 seconds)
            message_timeout = 2.0
            message_start_time = time.time()
            while len(messages_received) == 0 and (time.time() - message_start_time) < message_timeout:
                time.sleep(0.1)

            round_trip_time = (time.time() - publish_start) * 1000 if messages_received else None

            client.loop_stop()
            try:
                client.disconnect()
            except:
                pass

            # Build result
            if len(messages_received) > 0:
                result['success'] = True
                result['message'] = f"Successfully connected to MQTT broker {gateway.mqtt_host}:{gateway.mqtt_port}"
                result['details'] = {
                    'connect_time_ms': round(connect_time, 2),
                    'subscribe_time_ms': round(subscribe_time, 2),
                    'publish_time_ms': round(publish_time, 2),
                    'round_trip_time_ms': round(round_trip_time, 2) if round_trip_time else None,
                    'messages_received': len(messages_received)
                }
            else:
                result['success'] = True
                result['message'] = f"Connected to MQTT broker but test message not received (may be normal)"
                result['details'] = {
                    'connect_time_ms': round(connect_time, 2),
                    'subscribe_time_ms': round(subscribe_time, 2),
                    'publish_time_ms': round(publish_time, 2),
                    'round_trip_time_ms': None,
                    'messages_received': 0
                }

        except socket.gaierror as e:
            result['message'] = f"Cannot resolve hostname {gateway.mqtt_host}: {str(e)}"
            result['error'] = str(e)
        except socket.timeout:
            result['message'] = f"Connection to {gateway.mqtt_host}:{gateway.mqtt_port} timed out"
            result['error'] = "Connection timeout"
        except ConnectionRefusedError:
            result['message'] = f"Connection refused by {gateway.mqtt_host}:{gateway.mqtt_port}. Is the MQTT broker running?"
            result['error'] = "Connection refused"
        except Exception as e:
            result['message'] = f"Error connecting to MQTT broker: {str(e)}"
            result['error'] = str(e)

    except ImportError:
        result['message'] = "MQTT testing library (paho-mqtt) not available. Please install paho-mqtt."
        result['error'] = "Library not installed"
    except Exception as e:
        result['message'] = f"Unexpected error: {str(e)}"
        result['error'] = str(e)

    return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)


@login_required
@permission_required('takserver.view_mqttgateway')
@require_http_methods(["POST"])
def mqttgateway_test_via_gateway(request, pk):
    """HTMX endpoint to test MQTT connection via TAKMesh gateway API."""
    gateway = get_object_or_404(MQTTGateway, pk=pk)

    result = {
        'success': False,
        'message': 'Unknown error',
        'gateway': gateway,
        'test_type': 'gateway'
    }

    # First, check if takmesh service is available
    try:
        with httpx.Client(timeout=3.0) as client:
            health_response = client.get(f"{TAKMESH_API_URL}/health")
            if health_response.status_code != 200:
                result['message'] = f"TAKMesh service returned status {health_response.status_code}"
                return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)
    except httpx.TimeoutException:
        result['message'] = "TAKMesh gateway service is not responding. Is the container running?"
        return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)
    except httpx.ConnectError:
        result['message'] = "Cannot connect to TAKMesh gateway service. Is the container running?"
        return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)
    except Exception as e:
        result['message'] = f"Error checking service availability: {str(e)}"
        return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)

    # Service is available, now test MQTT connection via gateway
    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                f"{TAKMESH_API_URL}/test/mqtt",
                json={
                    'host': gateway.mqtt_host,
                    'port': gateway.mqtt_port,
                    'username': gateway.mqtt_username or None,
                    'password': gateway.mqtt_password or None,
                    'timeout': 10
                }
            )
            if response.status_code == 200:
                data = response.json()
                result['success'] = data.get('success', False)
                result['message'] = data.get('message', 'Test completed')
                result['error'] = data.get('error')
            else:
                result['message'] = f"API error: {response.status_code}"
                if response.status_code == 500:
                    try:
                        error_data = response.json()
                        result['error'] = error_data.get('detail', 'Server error')
                    except:
                        result['error'] = 'Server error'
    except httpx.TimeoutException:
        result['message'] = "MQTT connection test timed out. The broker may be unreachable or slow to respond."
    except httpx.ConnectError:
        result['message'] = "Cannot connect to TAKMesh gateway service"
    except Exception as e:
        result['message'] = f"Error: {str(e)}"

    return render(request, 'takserver/partials/_mqttgateway_test_result.html', result)


def _extract_location_from_payload(payload: dict) -> tuple[float, float] | None:
    """Extract latitude and longitude from Meshtastic payload."""
    if not payload:
        return None

    pos_data = payload.get("payload", {})
    if "position" in pos_data:
        pos_data = pos_data["position"]

    # Handle Meshtastic format (latitude_i/longitude_i in 1e7 format)
    if "latitude_i" in pos_data and "longitude_i" in pos_data:
        lat = pos_data["latitude_i"] / 1e7
        lon = pos_data["longitude_i"] / 1e7
        if lat != 0.0 and lon != 0.0:
            return (lat, lon)

    # Handle standard format
    lat = pos_data.get("latitude", 0)
    lon = pos_data.get("longitude", 0)
    if lat != 0.0 and lon != 0.0:
        return (lat, lon)

    return None


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers using Haversine formula."""
    from math import radians, sin, cos, sqrt, atan2

    R = 6371  # Earth radius in kilometers

    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)

    a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c


def _extract_callsign_from_summary(summary: str) -> str | None:
    """Extract callsign from message summary.

    Handles multiple formats:
    - MQTT: "Callsign @ lat, lon" or "[Callsign] text"
    - TAK: "Callsign - Description" (e.g., "KDTZipad - Friendly Ground")
    """
    if not summary:
        return None

    # TAK format: "Callsign - Description"
    if ' - ' in summary:
        callsign = summary.split(' - ')[0].strip()
        return callsign if callsign else None

    # MQTT format: "Callsign @ lat, lon" or "[Callsign] text"
    parts = summary.split()
    if parts:
        # Remove brackets if present
        callsign = parts[0].strip('[]')
        return callsign if callsign else None
    return None


@login_required
@permission_required('takserver.view_mqttgateway')
@require_http_methods(["GET"])
def mqttgateway_messages(request, pk, buffer):
    """HTMX endpoint to get messages from a specific buffer."""
    gateway = get_object_or_404(MQTTGateway, pk=pk)

    # Get limit from query params (None = show all)
    limit_param = request.GET.get('limit')
    limit = int(limit_param) if limit_param else None
    msg_type = request.GET.get('type')  # position, text, chat

    messages = []
    stats = {}
    error = None
    forwarding_state = {}

    try:
        params = {}
        if limit:
            params['limit'] = limit
        if msg_type:
            params['msg_type'] = msg_type

        with httpx.Client(timeout=10.0) as client:
            # Get forwarding state
            try:
                status_resp = client.get(f"{TAKMESH_API_URL}/status", timeout=2.0)
                if status_resp.status_code == 200:
                    forwarding_state = status_resp.json().get('forwarding', {})
            except Exception:
                forwarding_state = {}

            # Get messages from specific buffer
            response = client.get(
                f"{TAKMESH_API_URL}/messages/{buffer}",
                params=params
            )
            if response.status_code == 200:
                data = response.json()
                messages = data.get('messages', [])
                stats = data.get('stats', {})

                # Fetch output buffer to correlate with input messages
                output_messages = {}
                try:
                    output_resp = client.get(f"{TAKMESH_API_URL}/messages/output", timeout=5.0)
                    if output_resp.status_code == 200:
                        output_data = output_resp.json()
                        # Index output messages by correlation_id for fast lookup
                        for out_msg in output_data.get('messages', []):
                            corr_id = out_msg.get('correlation_id')
                            if corr_id:
                                output_messages[corr_id] = out_msg
                except Exception as e:
                    # If output fetch fails, continue without it
                    pass

                # Process messages in chronological order (oldest first) for time diff calculation
                # Messages come newest first, so reverse for processing, then reverse back
                messages_reversed = list(reversed(messages))

                # Enrich messages with location data, distances, and time differences
                last_positions = {}  # Track last position per callsign
                last_timestamps = {}  # Track last timestamp per callsign (previous message)
                previous_date = None

                for idx, msg in enumerate(messages_reversed):
                    payload = msg.get('payload', {})
                    topic = msg.get('topic', '')

                    # Extract device_id and gateway_id for MQTT messages
                    if msg.get('source') == 'mqtt':
                        # Use device_id from message if available (newer messages), otherwise extract from payload
                        if 'device_id' not in msg or not msg.get('device_id'):
                            from_id = payload.get('from')
                            device_id = None
                            if from_id:
                                try:
                                    if isinstance(from_id, int):
                                        device_id = f"!{from_id:08x}".upper()
                                    else:
                                        device_id = f"!{int(from_id):08x}".upper()
                                except (ValueError, TypeError):
                                    device_id = str(from_id) if from_id else None
                            msg['device_id'] = device_id

                        # Use gateway_id from message if available (newer messages), otherwise extract from payload sender or topic
                        if 'gateway_id' not in msg or not msg.get('gateway_id'):
                            # Try sender field first (the gateway that sent it to MQTT)
                            gateway_id = payload.get('sender')
                            if not gateway_id and topic:
                                # Fallback to topic extraction
                                parts = topic.split('/')
                                if len(parts) >= 6 and parts[4] == 'json':
                                    gateway_id = parts[5]
                            msg['gateway_id'] = gateway_id
                    else:
                        msg['device_id'] = None
                        msg['gateway_id'] = None

                    # Extract callsign for tracking
                    # For TAK messages, use payload.callsign directly (more reliable)
                    # For MQTT messages, extract from summary
                    if msg.get('source') == 'tak' and payload.get('callsign'):
                        callsign = payload.get('callsign')
                    else:
                        callsign = _extract_callsign_from_summary(msg.get('summary', ''))
                    msg['callsign'] = callsign

                    # Style gateway_id (sender) in summary with monospace font
                    gateway_id = msg.get('gateway_id')
                    summary = msg.get('summary', '')
                    if gateway_id and summary:
                        from django.utils.html import escape
                        from django.utils.safestring import mark_safe
                        escaped_summary = escape(summary)  # Escape the summary first
                        escaped_gw = escape(gateway_id)
                        # Replace @gateway_id with styled version
                        # Handle patterns: @gateway_id, @ gateway_id, @gateway_id (with spaces)
                        styled_gw = f'<span class="font-monospace text-muted">@{escaped_gw}</span>'
                        # Replace all occurrences of @gateway_id (with or without space after @)
                        import re
                        pattern = re.compile(r'@\s*' + re.escape(escaped_gw) + r'(?=\s|$)', re.IGNORECASE)
                        escaped_summary = pattern.sub(styled_gw, escaped_summary)
                        msg['summary'] = mark_safe(escaped_summary)
                        msg['summary_html'] = True  # Mark as HTML-safe

                    # Extract location - different for MQTT vs TAK messages
                    if msg.get('source') == 'tak':
                        # TAK/CoT messages have lat/lon directly in payload
                        lat = payload.get('lat')
                        lon = payload.get('lon')
                        if lat is not None and lon is not None and lat != 0.0 and lon != 0.0:
                            location = (float(lat), float(lon))
                        else:
                            location = None
                    else:
                        # MQTT messages use Meshtastic format
                        location = _extract_location_from_payload(payload)

                    # Parse and convert timestamp to local timezone using centralized utility
                    timestamp_str = msg.get('timestamp', '')
                    dt_local = parse_iso_to_local(timestamp_str)
                    if dt_local:
                        timestamp_info = format_timestamp_info(dt_local)
                        msg['timestamp_dt'] = dt_local
                        msg['timestamp_iso'] = timestamp_info['iso']
                        msg['timestamp_tz'] = timestamp_info['tz']
                        msg['timestamp_offset'] = timestamp_info['offset']
                        msg['timestamp_hms'] = timestamp_info['hms']
                        msg['timestamp_date'] = dt_local.strftime('%Y-%m-%d')

                        # Track date changes (don't mark first message as changed)
                        if idx == 0:
                            previous_date = msg['timestamp_date']
                            msg['date_changed'] = False
                        else:
                            msg['date_changed'] = (msg['timestamp_date'] != previous_date)
                            if msg['date_changed']:
                                previous_date = msg['timestamp_date']
                            else:
                                previous_date = msg['timestamp_date']

                        # Calculate time difference from previous message from same callsign
                        # (previous message is stored in last_timestamps)
                        if callsign and callsign in last_timestamps:
                            time_diff = (dt_local - last_timestamps[callsign]).total_seconds()
                            # Only show positive differences (time moves forward)
                            if time_diff > 0:
                                if time_diff < 60:
                                    msg['time_diff_str'] = f"{int(time_diff)}s"
                                elif time_diff < 3600:
                                    msg['time_diff_str'] = f"{int(time_diff // 60)}m"
                                elif time_diff < 86400:
                                    msg['time_diff_str'] = f"{int(time_diff // 3600)}h"
                                else:
                                    msg['time_diff_str'] = f"{int(time_diff // 86400)}d"
                            else:
                                msg['time_diff_str'] = None
                        else:
                            msg['time_diff_str'] = None

                        # Update last timestamp for this callsign (for next message)
                        if callsign:
                            last_timestamps[callsign] = dt_local
                    else:
                        # Fallback if parsing fails
                        msg['timestamp_dt'] = None
                        msg['timestamp_iso'] = timestamp_str if timestamp_str else '-'
                        msg['timestamp_tz'] = ''
                        msg['timestamp_offset'] = ''
                        msg['timestamp_hms'] = timestamp_str[11:19] if len(timestamp_str) >= 19 else (timestamp_str if timestamp_str else '-')
                        msg['timestamp_date'] = timestamp_str[:10] if len(timestamp_str) >= 10 else None
                        msg['date_changed'] = False
                        msg['time_diff_str'] = None

                    # Use pre-formatted JSON from Redis (required)
                    if 'formatted_payload_json' not in msg or not msg['formatted_payload_json']:
                        # If missing, format on the fly (shouldn't happen with new messages)
                        msg['payload_json'] = format_payload_json(payload)
                    else:
                        msg['payload_json'] = msg['formatted_payload_json']

                    # Extract text message content for chat bubble display
                    if msg.get('msg_type') in ('text', 'chat'):
                        text_content = None
                        if isinstance(payload, dict):
                            # Check nested payload.text for MQTT messages
                            if 'payload' in payload and isinstance(payload['payload'], dict):
                                text_content = payload['payload'].get('text')
                            # Also check direct text field
                            if not text_content:
                                text_content = payload.get('text') or payload.get('message')
                        if text_content:
                            # Clean up control characters
                            import re
                            clean_text = re.sub(r'[\u0000-\u001F\u007F-\u009F]', '', str(text_content)).strip()
                            msg['text_content'] = clean_text if clean_text else None
                        else:
                            msg['text_content'] = None
                    else:
                        msg['text_content'] = None
                    msg['payload_raw'] = payload  # Keep raw dict for any other use

                    if location:
                        msg['latitude'] = location[0]
                        msg['longitude'] = location[1]
                        msg['has_location'] = True

                        # Calculate distance from last position for same callsign
                        if callsign and callsign in last_positions:
                            prev_lat, prev_lon = last_positions[callsign]
                            distance_km = _haversine_distance(
                                prev_lat, prev_lon,
                                location[0], location[1]
                            )
                            msg['distance_km'] = round(distance_km, 2)
                            msg['distance_m'] = round(distance_km * 1000, 0)
                        else:
                            msg['distance_km'] = None
                            msg['distance_m'] = None

                        # Update last position for this callsign
                        if callsign:
                            last_positions[callsign] = location
                    else:
                        msg['has_location'] = False
                        msg['latitude'] = None
                        msg['longitude'] = None
                        msg['distance_km'] = None
                        msg['distance_m'] = None

                    # Link output data using correlation_id
                    corr_id = msg.get('correlation_id')
                    if corr_id and corr_id in output_messages:
                        out = output_messages[corr_id]
                        msg['output'] = out
                        msg['output_filtered'] = out.get('filtered', False)
                        msg['output_filtered_reason'] = out.get('filtered_reason')
                        msg['output_sent'] = out.get('sent', False)
                        msg['output_send_result'] = out.get('send_result')
                        msg['output_channel'] = out.get('outbound_channel')
                        msg['output_cot'] = out.get('generated_cot')
                        msg['output_cot_uid'] = out.get('cot_uid')
                        msg['output_cot_type'] = out.get('cot_type')
                        msg['output_send_timestamp'] = out.get('send_timestamp')
                    else:
                        msg['output'] = None
                        msg['output_filtered'] = None
                        msg['output_filtered_reason'] = None
                        msg['output_sent'] = None
                        msg['output_send_result'] = None
                        msg['output_channel'] = None
                        msg['output_cot'] = None
                        msg['output_cot_uid'] = None
                        msg['output_cot_type'] = None
                        msg['output_send_timestamp'] = None

                # Reverse messages back to newest-first for display
                messages = list(reversed(messages_reversed))

                # Get current date with timezone info for display above table
                if messages and messages[0].get('timestamp_dt'):
                    dt = messages[0]['timestamp_dt']
                    display_date = dt.strftime('%Y-%m-%d')
                    display_time = dt.strftime('%H:%M:%S')
                    display_tz = dt.strftime('%Z') or (dt.tzname() if dt.tzinfo else 'UTC')
                    offset = dt.utcoffset()
                    if offset:
                        offset_seconds = offset.total_seconds()
                        offset_hours = int(offset_seconds // 3600)
                        offset_mins = int((offset_seconds % 3600) // 60)
                        display_offset = f"{offset_hours:+03d}{abs(offset_mins):02d}"
                    else:
                        display_offset = '+0000'
                else:
                    from .timezone_utils import now_utc
                    from django.utils import timezone as django_timezone
                    dt = django_timezone.localtime(now_utc())
                    display_date = dt.strftime('%Y-%m-%d')
                    display_time = dt.strftime('%H:%M:%S')
                    display_tz = dt.strftime('%Z') or (dt.tzname() if dt.tzinfo else 'UTC')
                    offset = dt.utcoffset()
                    if offset:
                        offset_seconds = offset.total_seconds()
                        offset_hours = int(offset_seconds // 3600)
                        offset_mins = int((offset_seconds % 3600) // 60)
                        display_offset = f"{offset_hours:+03d}{abs(offset_mins):02d}"
                    else:
                        display_offset = '+0000'
            else:
                error = f"API error: {response.status_code}"

            # Get forwarding state from status endpoint
            try:
                status_resp = client.get(f"{TAKMESH_API_URL}/status", timeout=2.0)
                if status_resp.status_code == 200:
                    forwarding_state = status_resp.json().get('forwarding', {})
            except Exception:
                forwarding_state = {}

    except httpx.ConnectError:
        error = "Cannot connect to TAKMesh gateway service"
    except Exception as e:
        error = str(e)

    # Convert forwarding_state dict to object-like structure for template
    class ForwardingState:
        def __init__(self, state_dict):
            self.mesh2tak_enabled = state_dict.get('mesh2tak_enabled', False)
            self.tak2mesh_enabled = state_dict.get('tak2mesh_enabled', False)

    forwarding = ForwardingState(forwarding_state)

    return render(request, 'takserver/partials/_mqttgateway_buffer.html', {
        'gateway': gateway,
        'buffer': buffer,
        'messages': messages,
        'stats': stats,
        'forwarding': forwarding,
        'current_limit': limit,
        'error': error,
        'display_date': display_date if 'display_date' in locals() else None,
        'display_time': display_time if 'display_time' in locals() else None,
        'display_tz': display_tz if 'display_tz' in locals() else None,
        'display_offset': display_offset if 'display_offset' in locals() else None,
        'azure_maps_key': settings.AZURE_MAPS_KEY
    })


@login_required
@permission_required('takserver.change_mqttgateway')
@require_http_methods(["POST"])
def mqttgateway_toggle(request, pk):
    """HTMX endpoint to start/stop gateway."""
    gateway = get_object_or_404(MQTTGateway, pk=pk)

    action = request.POST.get('action', 'start')
    result = {'success': False, 'message': 'Unknown error'}

    try:
        with httpx.Client(timeout=10.0) as client:
            if action == 'stop':
                response = client.post(f"{TAKMESH_API_URL}/stop")
            else:
                response = client.post(f"{TAKMESH_API_URL}/start")

            if response.status_code == 200:
                data = response.json()
                result['success'] = True
                result['message'] = data.get('message', f'Gateway {action} requested')
            else:
                result['message'] = f"API error: {response.status_code}"
    except httpx.ConnectError:
        result['message'] = "Cannot connect to TAKMesh gateway service"
    except Exception as e:
        result['message'] = str(e)

    # Return updated status
    status = _get_gateway_status()
    return render(request, 'takserver/partials/_mqttgateway_status.html', {
        'gateway': gateway,
        'gateway_status': status,
        'toggle_result': result
    })


@login_required
@permission_required('takserver.change_mqttgateway')
@require_http_methods(["POST"])
def mqttgateway_sync_config(request, pk):
    """HTMX endpoint to push/sync config to takmesh container."""
    gateway = get_object_or_404(MQTTGateway, pk=pk)

    result = _push_gateway_config(gateway)

    return render(request, 'takserver/partials/_mqttgateway_sync_result.html', {
        'gateway': gateway,
        'result': result
    })


@csrf_exempt
@require_http_methods(["GET"])
def validate_websocket_session(request):
    """
    Validate Django session for WebSocket authentication.
    Called by FastAPI/TAKMesh Gateway before accepting WebSocket connections.
    
    Accepts sessionid as query parameter or cookie.
    
    CSRF exempt because this is an internal API call from FastAPI (not from browser).
    
    Returns:
        JsonResponse with 'valid': True/False and 'user_id' if valid
    """
    # Get session key from query param (FastAPI will pass it) or cookie
    session_key = request.GET.get('sessionid') or request.COOKIES.get('sessionid')
    
    if not session_key:
        return JsonResponse({
            'valid': False,
            'error': 'No session ID provided'
        }, status=401)
    
    try:
        # Use Django's session framework to validate
        from django.contrib.sessions.backends.file import SessionStore
        session_store = SessionStore(session_key=session_key)
        
        # Check if session exists and is valid
        if session_store.exists(session_key):
            # Load session data
            session_data = session_store.load()
            
            # Check if session has user_id (logged in)
            user_id = session_data.get('_auth_user_id')
            
            if user_id:
                # Session is valid and user is authenticated
                return JsonResponse({
                    'valid': True,
                    'user_id': user_id,
                    'session_key': session_key
                })
            else:
                return JsonResponse({
                    'valid': False,
                    'error': 'Session not authenticated'
                }, status=401)
        else:
            return JsonResponse({
                'valid': False,
                'error': 'Session not found'
            }, status=401)
            
    except Exception as e:
        # Log full error details for debugging
        logger.error(f"Session validation error: {e}", exc_info=True)
        return JsonResponse({
            'valid': False,
            'error': f'Session validation failed: {str(e)}'
        }, status=500)


@login_required
@permission_required('takserver.view_mqttgateway')
@require_http_methods(["POST"])
def mqttgateway_verify_message(request, pk, correlation_id):
    """HTMX endpoint to verify a COT message by correlation_id."""
    gateway = get_object_or_404(MQTTGateway, pk=pk)

    try:
        with httpx.Client(timeout=10.0) as client:
            # Call TAKMesh API verification endpoint
            response = client.post(
                f"{TAKMESH_API_URL}/messages/verify/{correlation_id}",
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                return JsonResponse({
                    'status': 'success',
                    'verified': data.get('verified', False),
                    'method': data.get('method'),
                    'timestamp': data.get('timestamp') or data.get('cot_received_timestamp'),
                    'message': 'Verification completed'
                })
            else:
                return JsonResponse({
                    'status': 'error',
                    'verified': False,
                    'message': f"API error: {response.status_code}"
                }, status=response.status_code)

    except httpx.ConnectError:
        return JsonResponse({
            'status': 'error',
            'verified': False,
            'message': 'Cannot connect to TAKMesh gateway service'
        }, status=503)
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'verified': False,
            'message': str(e)
        }, status=500)


@login_required
@permission_required('takserver.view_mqttgateway')
@require_http_methods(["GET", "POST"])
def mqttgateway_forwarding(request, pk):
    """
    HTMX endpoint for forwarding state.
    GET: Return current state
    POST: Toggle state
    """
    gateway = get_object_or_404(MQTTGateway, pk=pk)
    direction = request.GET.get('direction', 'mqtt')

    forwarding_state = {}
    error = None

    try:
        with httpx.Client(timeout=5.0) as client:
            if request.method == 'POST':
                # Check change permission for POST
                if not request.user.has_perm('takserver.change_mqttgateway'):
                    error = "Permission denied"
                else:
                    # Get current state and toggle
                    status_resp = client.get(f"{TAKMESH_API_URL}/status")
                    if status_resp.status_code == 200:
                        current = status_resp.json().get('forwarding', {})
                        if direction == 'mqtt':
                            payload = {'mesh2tak': not current.get('mesh2tak_enabled', False)}
                        else:
                            payload = {'tak2mesh': not current.get('tak2mesh_enabled', False)}

                        response = client.post(f"{TAKMESH_API_URL}/forwarding", json=payload)
                        if response.status_code == 200:
                            forwarding_state = response.json().get('forwarding', {})
            else:
                # GET: just fetch current state
                response = client.get(f"{TAKMESH_API_URL}/status")
                if response.status_code == 200:
                    forwarding_state = response.json().get('forwarding', {})

    except httpx.ConnectError:
        error = "Service unavailable"
    except Exception as e:
        error = str(e)

    # Map direction to state and label
    if direction == 'mqtt':
        enabled = forwarding_state.get('mesh2tak_enabled', False)
        label = f"Fwd to {gateway.takserver.name}" if gateway.takserver else "Fwd to TAK"
    else:
        enabled = forwarding_state.get('tak2mesh_enabled', False)
        label = "Fwd to Mesh"

    return render(request, 'takserver/partials/_mqttgateway_forwarding_toggle.html', {
        'gateway': gateway,
        'direction': direction,
        'enabled': enabled,
        'label': label,
        'error': error
    })
