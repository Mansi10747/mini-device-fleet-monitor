from datetime import datetime, timezone
import threading
from typing import Any, Dict, List, Optional


class DeviceRecord:
    """Internal representation of a device in memory."""

    def __init__(self, id: str, name: str, registered_at: Optional[datetime] = None):
        self.id: str = id
        self.name: str = name
        self.registered_at: datetime = registered_at or datetime.now(timezone.utc)
        self.last_heartbeat: Optional[datetime] = None
        self.heartbeat_count: int = 0
        self.latest_telemetry: Optional[Dict[str, Any]] = None
        self.heartbeat_history: List[Dict[str, Any]] = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "registered_at": self.registered_at,
            "last_heartbeat": self.last_heartbeat,
            "heartbeat_count": self.heartbeat_count,
            "latest_telemetry": self.latest_telemetry,
        }


class DeviceStorage:
    """Thread-safe in-memory store for device registrations and heartbeats."""

    def __init__(self, max_history_per_device: int = 50):
        self._devices: Dict[str, DeviceRecord] = {}
        self._lock = threading.RLock()
        self._max_history = max_history_per_device

    def register_device(self, id: str, name: str, registered_at: Optional[datetime] = None) -> Optional[DeviceRecord]:
        """Registers a device. Returns the record, or None if device ID already exists."""
        with self._lock:
            if id in self._devices:
                return None
            record = DeviceRecord(id=id, name=name, registered_at=registered_at)
            self._devices[id] = record
            return record

    def get_device(self, id: str) -> Optional[DeviceRecord]:
        """Retrieves a device record by id."""
        with self._lock:
            return self._devices.get(id)

    def list_devices(self) -> List[DeviceRecord]:
        """Returns a snapshot list of all registered devices."""
        with self._lock:
            return list(self._devices.values())

    def record_heartbeat(
        self,
        device_id: str,
        received_at: datetime,
        telemetry: Optional[Dict[str, Any]] = None,
    ) -> Optional[DeviceRecord]:
        """
        Records a heartbeat for a registered device.
        Returns the updated DeviceRecord, or None if the device does not exist.
        """
        with self._lock:
            device = self._devices.get(device_id)
            if not device:
                return None

            device.last_heartbeat = received_at
            device.heartbeat_count += 1
            if telemetry:
                device.latest_telemetry = telemetry
                device.heartbeat_history.append({
                    "timestamp": received_at,
                    "data": telemetry
                })
                # Cap history size
                if len(device.heartbeat_history) > self._max_history:
                    device.heartbeat_history.pop(0)

            return device

    def clear(self) -> None:
        """Clears all devices from memory (primarily for testing)."""
        with self._lock:
            self._devices.clear()

    def count(self) -> int:
        """Returns total registered devices count."""
        with self._lock:
            return len(self._devices)


# Global singleton store
device_storage = DeviceStorage()
