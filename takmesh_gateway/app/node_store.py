"""
Persistent storage for Meshtastic NodeInfo data.
Stores node metadata (callsigns, hardware, etc.) that survives container restarts.
"""
import json
import logging
import os
import threading
from dataclasses import dataclass, asdict
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Persistence path - stored in the data volume
DATA_DIR = Path(os.getenv("DATA_DIR", "/opt/app/data"))
NODE_STORE_FILE = DATA_DIR / "node_store.json"


@dataclass
class NodeInfo:
    """Stored information about a Meshtastic node."""
    node_id: str           # Hex node ID (e.g., "!abcd1234")
    short_name: str        # Short name (e.g., "ABC")
    long_name: str         # Long name (e.g., "Alpha Base Camp")
    hw_model: str = ""     # Hardware model
    role: str = ""         # Node role (router, client, etc.)
    first_seen: str = ""   # ISO timestamp
    last_seen: str = ""    # ISO timestamp
    last_position_lat: Optional[float] = None
    last_position_lon: Optional[float] = None
    battery_level: Optional[int] = None

    @property
    def callsign(self) -> str:
        """Get best available callsign."""
        if self.long_name:
            return self.long_name
        if self.short_name:
            return self.short_name
        return self.node_id


class NodeStore:
    """
    Thread-safe persistent store for Meshtastic node information.
    """

    def __init__(self, persist_path: Path = NODE_STORE_FILE):
        self._nodes: dict[str, NodeInfo] = {}
        self._lock = threading.Lock()
        self._persist_path = persist_path
        self._dirty = False

        # Load persisted data on init
        self._load_from_file()

    def _load_from_file(self) -> None:
        """Load node store from persisted file."""
        if not self._persist_path.exists():
            return

        try:
            with open(self._persist_path, 'r') as f:
                data = json.load(f)

            for node_id, node_data in data.items():
                self._nodes[node_id] = NodeInfo(
                    node_id=node_data.get('node_id', node_id),
                    short_name=node_data.get('short_name', ''),
                    long_name=node_data.get('long_name', ''),
                    hw_model=node_data.get('hw_model', ''),
                    role=node_data.get('role', ''),
                    first_seen=node_data.get('first_seen', ''),
                    last_seen=node_data.get('last_seen', ''),
                    last_position_lat=node_data.get('last_position_lat'),
                    last_position_lon=node_data.get('last_position_lon'),
                    battery_level=node_data.get('battery_level')
                )

            logger.info(f"Loaded {len(self._nodes)} nodes from {self._persist_path}")

        except Exception as e:
            logger.warning(f"Failed to load node store from {self._persist_path}: {e}")

    def save_to_file(self) -> bool:
        """Save node store to persistent file. Returns True if successful."""
        try:
            # Ensure directory exists
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)

            with self._lock:
                data = {node_id: asdict(node) for node_id, node in self._nodes.items()}
                self._dirty = False

            # Write atomically
            temp_path = self._persist_path.with_suffix('.tmp')
            with open(temp_path, 'w') as f:
                json.dump(data, f, indent=2)

            temp_path.rename(self._persist_path)
            logger.debug(f"Saved {len(data)} nodes to {self._persist_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to save node store to {self._persist_path}: {e}")
            return False

    def update_node(
        self,
        node_id: str,
        short_name: Optional[str] = None,
        long_name: Optional[str] = None,
        hw_model: Optional[str] = None,
        role: Optional[str] = None,
        position: Optional[tuple[float, float]] = None,
        battery_level: Optional[int] = None
    ) -> NodeInfo:
        """
        Update or create a node entry.
        Returns the updated NodeInfo.
        """
        now = datetime.now(UTC).isoformat()

        with self._lock:
            if node_id in self._nodes:
                node = self._nodes[node_id]
                # Update fields if provided
                if short_name:
                    node.short_name = short_name
                if long_name:
                    node.long_name = long_name
                if hw_model:
                    node.hw_model = hw_model
                if role:
                    node.role = role
                if position:
                    node.last_position_lat = position[0]
                    node.last_position_lon = position[1]
                if battery_level is not None:
                    node.battery_level = battery_level
                node.last_seen = now
            else:
                # Create new node
                node = NodeInfo(
                    node_id=node_id,
                    short_name=short_name or node_id[-4:].upper(),
                    long_name=long_name or "",
                    hw_model=hw_model or "",
                    role=role or "",
                    first_seen=now,
                    last_seen=now,
                    last_position_lat=position[0] if position else None,
                    last_position_lon=position[1] if position else None,
                    battery_level=battery_level
                )
                self._nodes[node_id] = node
                logger.info(f"New node discovered: {node_id} ({node.callsign})")

            self._dirty = True

        # Auto-save periodically
        if len(self._nodes) % 5 == 0:
            self.save_to_file()

        return node

    def get_node(self, node_id: str) -> Optional[NodeInfo]:
        """Get a node by ID."""
        with self._lock:
            return self._nodes.get(node_id)

    def get_all_nodes(self) -> list[dict]:
        """Get all nodes as a list of dicts."""
        with self._lock:
            return [asdict(node) for node in self._nodes.values()]

    def get_node_count(self) -> int:
        """Get total number of known nodes."""
        with self._lock:
            return len(self._nodes)

    def clear(self) -> None:
        """Clear all nodes."""
        with self._lock:
            self._nodes.clear()
            self._dirty = True
        self.save_to_file()

    @property
    def is_dirty(self) -> bool:
        """Check if store has unsaved changes."""
        with self._lock:
            return self._dirty


# Global node store instance
node_store = NodeStore()
