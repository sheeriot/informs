"""
Configuration for Takmesh Gateway.
Loads settings from:
1. Persisted config file (pushed from Django)
2. Environment variables (fallback/defaults)
"""
import json
import logging
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# Config persistence path - stored in the data volume
CONFIG_FILE_PATH = Path(os.getenv("CONFIG_FILE_PATH", "/opt/app/data/gateway_config.json"))

logger = logging.getLogger(__name__)


@dataclass
class Config:
    """Gateway configuration."""

    # MQTT Settings
    mqtt_host: str = field(default_factory=lambda: os.getenv("MQTT_HOST", ""))
    mqtt_port: int = field(default_factory=lambda: int(os.getenv("MQTT_PORT", "1883")))
    mqtt_username: Optional[str] = field(default_factory=lambda: os.getenv("MQTT_USERNAME"))
    mqtt_password: Optional[str] = field(default_factory=lambda: os.getenv("MQTT_PASSWORD"))

    # TAK Server Settings
    tak_host: str = field(default_factory=lambda: os.getenv("TAK_HOST", ""))
    tak_port: int = field(default_factory=lambda: int(os.getenv("TAK_PORT", "8089")))
    tak_cert_path: str = field(default_factory=lambda: os.getenv("TAK_CERT_PATH", "/opt/app/certs/client.pem"))
    tak_ca_path: str = field(default_factory=lambda: os.getenv("TAK_CA_PATH", "/opt/app/certs/truststore.pem"))
    tak_check_hostname: bool = field(default_factory=lambda: os.getenv("TAK_CHECK_HOSTNAME", "false").lower() == "true")

    # Meshtastic Settings
    mesh_channel: str = field(default_factory=lambda: os.getenv("MESH_CHANNEL", "takmesh"))
    mqtt_subscribe_topic: str = field(default_factory=lambda: os.getenv("MQTT_SUBSCRIBE_TOPIC", "msh/US/SOA/2/json/takmesh/#"))

    # Gateway Identity
    gateway_uid: str = field(default_factory=lambda: os.getenv("GATEWAY_UID", "takmesh-gateway"))
    gateway_callsign: str = field(default_factory=lambda: os.getenv("GATEWAY_CALLSIGN", "TAKMESH"))

    # Operational Settings
    debug: bool = field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")
    reconnect_delay: int = field(default_factory=lambda: int(os.getenv("RECONNECT_DELAY", "5")))
    cot_stale_seconds: int = field(default_factory=lambda: int(os.getenv("COT_STALE_SECONDS", "3600")))

    # Config source tracking
    _config_source: str = field(default="env", repr=False)

    def validate(self) -> list[str]:
        """Validate configuration and return list of errors."""
        errors = []

        if not self.tak_host:
            errors.append("TAK_HOST is required")

        if not os.path.exists(self.tak_cert_path):
            errors.append(f"TAK_CERT_PATH not found: {self.tak_cert_path}")

        if not os.path.exists(self.tak_ca_path):
            errors.append(f"TAK_CA_PATH not found: {self.tak_ca_path}")

        return errors

    def log_config(self, logger) -> None:
        """Log configuration (masking sensitive values)."""
        logger.info("Takmesh Gateway Configuration:")
        logger.info(f"  Config Source: {self._config_source}")
        logger.info(f"  MQTT: {self.mqtt_host}:{self.mqtt_port}")
        logger.info(f"  MQTT Auth: {'Yes' if self.mqtt_username else 'No'}")
        logger.info(f"  TAK Server: {self.tak_host}:{self.tak_port}")
        logger.info(f"  TAK Cert: {self.tak_cert_path}")
        logger.info(f"  TAK CA: {self.tak_ca_path}")
        logger.info(f"  Mesh Channel: {self.mesh_channel}")
        logger.info(f"  Subscribe Topic: {self.mqtt_subscribe_topic}")
        logger.info(f"  Gateway UID: {self.gateway_uid}")
        logger.info(f"  Debug: {self.debug}")

    def save_to_file(self) -> bool:
        """
        Save current configuration to persistent file.
        Returns True if successful.
        """
        try:
            # Ensure directory exists
            CONFIG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)

            # Convert to dict, excluding private fields
            config_dict = {
                k: v for k, v in asdict(self).items()
                if not k.startswith('_')
            }

            # Write atomically (write to temp, then rename)
            temp_path = CONFIG_FILE_PATH.with_suffix('.tmp')
            with open(temp_path, 'w') as f:
                json.dump(config_dict, f, indent=2)

            temp_path.rename(CONFIG_FILE_PATH)
            logger.info(f"Configuration saved to {CONFIG_FILE_PATH}")
            return True

        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False

    def update_from_dict(self, data: dict) -> list[str]:
        """
        Update configuration from a dictionary (e.g., from Django API).
        Returns list of updated field names.
        Always persists config when called (Django is source of truth).
        """
        updated = []

        field_mapping = {
            'mqtt_host': str,
            'mqtt_port': int,
            'mqtt_username': str,
            'mqtt_password': str,
            'mqtt_subscribe_topic': str,
            'tak_host': str,
            'tak_port': int,
            'tak_cert_path': str,
            'tak_ca_path': str,
            'mesh_channel': str,
            'gateway_uid': str,
            'gateway_callsign': str,
        }

        for field_name, field_type in field_mapping.items():
            if field_name in data and data[field_name] is not None:
                try:
                    new_value = field_type(data[field_name])
                    if getattr(self, field_name) != new_value:
                        updated.append(field_name)
                    # Always set the value from Django
                    setattr(self, field_name, new_value)
                except (ValueError, TypeError):
                    pass

        # Always save when receiving config from Django (source of truth)
        self._config_source = "django"
        self.save_to_file()

        return updated


def load_config() -> Config:
    """
    Load configuration with priority:
    1. Persisted config file (from Django)
    2. Environment variables (fallback)
    """
    config = Config()

    # Try to load from persisted file first
    if CONFIG_FILE_PATH.exists():
        try:
            with open(CONFIG_FILE_PATH, 'r') as f:
                saved_config = json.load(f)

            # Apply saved values
            for key, value in saved_config.items():
                if hasattr(config, key) and not key.startswith('_'):
                    setattr(config, key, value)

            config._config_source = "file"
            logger.info(f"Loaded configuration from {CONFIG_FILE_PATH}")

        except Exception as e:
            logger.warning(f"Failed to load config file: {e}, using env defaults")
            config._config_source = "env"
    else:
        logger.info("No persisted config found, using environment variables")
        config._config_source = "env"

    return config


# Global config instance - loaded on import
config = load_config()


class ForwardingState:
    """
    Runtime state for forwarding toggles.
    These are NOT persisted - they reset on container restart.
    """

    def __init__(self):
        self._mesh2tak_enabled = True
        self._tak2mesh_enabled = True
        self._lock = __import__('threading').Lock()

    @property
    def mesh2tak_enabled(self) -> bool:
        """Is Mesh to TAK forwarding enabled?"""
        with self._lock:
            return self._mesh2tak_enabled

    @mesh2tak_enabled.setter
    def mesh2tak_enabled(self, value: bool):
        with self._lock:
            self._mesh2tak_enabled = value

    @property
    def tak2mesh_enabled(self) -> bool:
        """Is TAK to Mesh forwarding enabled?"""
        with self._lock:
            return self._tak2mesh_enabled

    @tak2mesh_enabled.setter
    def tak2mesh_enabled(self, value: bool):
        with self._lock:
            self._tak2mesh_enabled = value

    def get_state(self) -> dict:
        """Get current forwarding state."""
        with self._lock:
            return {
                "mesh2tak_enabled": self._mesh2tak_enabled,
                "tak2mesh_enabled": self._tak2mesh_enabled
            }

    def set_state(self, mesh2tak: bool = None, tak2mesh: bool = None) -> dict:
        """Set forwarding state. Returns updated state."""
        with self._lock:
            if mesh2tak is not None:
                self._mesh2tak_enabled = mesh2tak
            if tak2mesh is not None:
                self._tak2mesh_enabled = tak2mesh
            return {
                "mesh2tak_enabled": self._mesh2tak_enabled,
                "tak2mesh_enabled": self._tak2mesh_enabled
            }


# Global forwarding state
forwarding = ForwardingState()
