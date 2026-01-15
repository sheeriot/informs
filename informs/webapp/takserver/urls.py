from django.urls import path

from .views import (
    # TAK Server views
    TakServerListView,
    TakServerDetailView,
    TakServerCreateView,
    TakServerUpdateView,
    send_test_cot,
    check_test_status,
    # MQTT Gateway views
    MQTTGatewayListView,
    MQTTGatewayDetailView,
    MQTTGatewayCreateView,
    MQTTGatewayUpdateView,
    MQTTGatewayDeleteView,
    mqttgateway_status,
    mqttgateway_test_connection,
    mqttgateway_test_via_gateway,
    mqttgateway_messages,
    mqttgateway_toggle,
    mqttgateway_sync_config,
    mqttgateway_forwarding,
    mqttgateway_verify_message,
    validate_websocket_session,
)

urlpatterns = [
    # TAK Server URLs
    path('', TakServerListView.as_view(), name='takserver_list'),
    path('create/', TakServerCreateView.as_view(), name='takserver_create'),
    path('<int:pk>/', TakServerDetailView.as_view(), name='takserver_detail'),
    path('<int:pk>/edit/', TakServerUpdateView.as_view(), name='takserver_update'),
    path('<int:pk>/test-cot/', send_test_cot, name='takserver_test_cot'),
    path('<int:pk>/test-status/', check_test_status, name='takserver_test_status'),

    # MQTT Gateway URLs
    path('mqtt/', MQTTGatewayListView.as_view(), name='mqttgateway_list'),
    path('mqtt/create/', MQTTGatewayCreateView.as_view(), name='mqttgateway_create'),
    path('mqtt/<int:pk>/', MQTTGatewayDetailView.as_view(), name='mqttgateway_detail'),
    path('mqtt/<int:pk>/edit/', MQTTGatewayUpdateView.as_view(), name='mqttgateway_update'),
    path('mqtt/<int:pk>/delete/', MQTTGatewayDeleteView.as_view(), name='mqttgateway_delete'),
    path('mqtt/<int:pk>/status/', mqttgateway_status, name='mqttgateway_status'),
    path('mqtt/<int:pk>/test/', mqttgateway_test_connection, name='mqttgateway_test'),
    path('mqtt/<int:pk>/test-gateway/', mqttgateway_test_via_gateway, name='mqttgateway_test_gateway'),
    path('mqtt/<int:pk>/messages/<str:buffer>/', mqttgateway_messages, name='mqttgateway_messages'),
    path('mqtt/<int:pk>/toggle/', mqttgateway_toggle, name='mqttgateway_toggle'),
    path('mqtt/<int:pk>/sync/', mqttgateway_sync_config, name='mqttgateway_sync'),
    path('mqtt/<int:pk>/forwarding/', mqttgateway_forwarding, name='mqttgateway_forwarding'),
    path('mqtt/<int:pk>/verify/<str:correlation_id>/', mqttgateway_verify_message, name='mqttgateway_verify_message'),
    
    # WebSocket session validation (for FastAPI/TAKMesh Gateway)
    path('api/validate-session/', validate_websocket_session, name='validate_websocket_session'),
]
