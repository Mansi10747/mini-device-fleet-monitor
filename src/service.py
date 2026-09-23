from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional

from src.config import settings
from src.models import (
    DeviceDetail,
    DeviceListItem,
    DeviceRegisterRequest,
    DeviceStatus,
    FleetSummary,
    HeartbeatPayload,
)
from src.storage import DeviceRecord, DeviceStorage, device_storage


class DeviceNotFoundError(Exception):
    """Raised when a requested device is not found."""
    pass


class DeviceAlreadyExistsError(Exception):
    """Raised when attempting to register a device with an existing ID."""
    pass


class DeviceFleetService:
    """Core domain service managing fleet rules and heartbeat timeout logic."""

    def __init__(
        self,
        storage: Optional[DeviceStorage] = None,
        timeout_seconds: Optional[float] = None,
        clock: Optional[Callable[[], datetime]] = None,
    ):
        self.storage = storage or device_storage
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.heartbeat_timeout_seconds
        )
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def _ensure_utc(self, dt: datetime) -> datetime:
        """Ensures a datetime object is timezone-aware and in UTC."""
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    def calculate_status(self, last_heartbeat: Optional[datetime]) -> DeviceStatus:
        """
        Determines whether a device is ONLINE or OFFLINE.
        Rule:
          - ONLINE: Heartbeat received within the last 30 seconds (<= 30.0s).
          - OFFLINE: No heartbeat ever received, or last heartbeat > 30.0s ago.
        """
        if last_heartbeat is None:
            return DeviceStatus.OFFLINE

        current_time = self.clock()
        last_hb = self._ensure_utc(last_heartbeat)
        now = self._ensure_utc(current_time)

        elapsed = (now - last_hb).total_seconds()

        # If heartbeat is within timeout window (and not in the future beyond normal jitter)
        if 0.0 <= elapsed <= self.timeout_seconds:
            return DeviceStatus.ONLINE

        # Heartbeat timestamp in future (clock skew/jitter within small tolerance)
        if elapsed < 0.0 and abs(elapsed) <= 5.0:
            return DeviceStatus.ONLINE

        return DeviceStatus.OFFLINE

    def register_device(self, request: DeviceRegisterRequest) -> DeviceRecord:
        """Registers a new device in the fleet."""
        now = self.clock()
        record = self.storage.register_device(
            id=request.id, name=request.name, registered_at=now
        )
        if record is None:
            raise DeviceAlreadyExistsError(f"Device with ID '{request.id}' already exists")
        return record

    def record_heartbeat(
        self, device_id: str, payload: HeartbeatPayload
    ) -> DeviceRecord:
        """
        Records a heartbeat for a registered device.
        Throws DeviceNotFoundError if device is not registered.
        """
        now = self.clock()
        hb_timestamp = self._ensure_utc(payload.timestamp or now)

        telemetry: Dict = {
            "status": payload.status,
            "cpu_usage": payload.cpu_usage,
            "memory_usage": payload.memory_usage,
            "signal_strength": payload.signal_strength,
            "battery_level": payload.battery_level,
        }
        if payload.extra:
            telemetry.update(payload.extra)

        # Filter out None values for clean representation
        telemetry = {k: v for k, v in telemetry.items() if v is not None}

        record = self.storage.record_heartbeat(
            device_id=device_id,
            received_at=hb_timestamp,
            telemetry=telemetry,
        )
        if record is None:
            raise DeviceNotFoundError(f"Device with ID '{device_id}' not found")

        return record

    def get_device(self, device_id: str) -> DeviceDetail:
        """Retrieves details of a single device."""
        record = self.storage.get_device(device_id)
        if record is None:
            raise DeviceNotFoundError(f"Device with ID '{device_id}' not found")

        status = self.calculate_status(record.last_heartbeat)
        return DeviceDetail(
            id=record.id,
            name=record.name,
            status=status,
            registered_at=record.registered_at,
            last_heartbeat=record.last_heartbeat,
            heartbeat_count=record.heartbeat_count,
            latest_telemetry=record.latest_telemetry,
        )

    def list_devices(
        self, status_filter: Optional[DeviceStatus] = None
    ) -> List[DeviceListItem]:
        """Lists all registered devices and their current status."""
        records = self.storage.list_devices()
        result: List[DeviceListItem] = []
        for r in records:
            current_status = self.calculate_status(r.last_heartbeat)
            if status_filter and current_status != status_filter:
                continue
            result.append(
                DeviceListItem(
                    id=r.id,
                    name=r.name,
                    status=current_status,
                    last_heartbeat=r.last_heartbeat,
                )
            )
        # Sort by device ID for deterministic ordering
        result.sort(key=lambda x: x.id)
        return result

    def get_fleet_summary(self) -> FleetSummary:
        """Returns the summary count of fleet devices."""
        records = self.storage.list_devices()
        total = len(records)
        online = 0
        for r in records:
            if self.calculate_status(r.last_heartbeat) == DeviceStatus.ONLINE:
                online += 1
        offline = total - online
        return FleetSummary(total=total, online=online, offline=offline)


# Global singleton service
fleet_service = DeviceFleetService()
