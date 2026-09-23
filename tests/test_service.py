from datetime import datetime, timedelta, timezone
import threading
import pytest

from src.models import (
    DeviceRegisterRequest,
    DeviceStatus,
    HeartbeatPayload,
)
from src.service import (
    DeviceAlreadyExistsError,
    DeviceFleetService,
    DeviceNotFoundError,
)
from src.storage import DeviceStorage


def test_device_registration():
    """Test standard device registration."""
    storage = DeviceStorage()
    service = DeviceFleetService(storage=storage)

    req = DeviceRegisterRequest(id="dev-01", name="Lab Device 1")
    dev = service.register_device(req)

    assert dev.id == "dev-01"
    assert dev.name == "Lab Device 1"
    assert storage.count() == 1


def test_duplicate_device_registration_error():
    """Test registering an existing device ID raises DeviceAlreadyExistsError."""
    storage = DeviceStorage()
    service = DeviceFleetService(storage=storage)

    req = DeviceRegisterRequest(id="dev-01", name="Lab Device 1")
    service.register_device(req)

    with pytest.raises(DeviceAlreadyExistsError):
        service.register_device(req)


def test_heartbeat_unknown_device_raises_error():
    """Test sending heartbeat to unregistered device raises DeviceNotFoundError."""
    storage = DeviceStorage()
    service = DeviceFleetService(storage=storage)

    with pytest.raises(DeviceNotFoundError):
        service.record_heartbeat("non-existent", HeartbeatPayload())


def test_status_newly_registered_is_offline():
    """A device registered but having received no heartbeat should be OFFLINE."""
    storage = DeviceStorage()
    service = DeviceFleetService(storage=storage)

    service.register_device(DeviceRegisterRequest(id="dev-01", name="Device 1"))
    detail = service.get_device("dev-01")

    assert detail.status == DeviceStatus.OFFLINE
    assert detail.last_heartbeat is None
    assert detail.heartbeat_count == 0


def test_30_second_timeout_boundary():
    """
    Test exact 30-second timeout boundary using an injectable controllable clock.
    - At t=0s: Heartbeat sent -> Status is ONLINE
    - At t=15s: Status is ONLINE
    - At t=30.0s: Status is ONLINE (inclusive boundary)
    - At t=30.1s: Status transitions to OFFLINE
    - At t=60.0s: Status remains OFFLINE
    """
    base_time = datetime(2026, 9, 23, 12, 0, 0, tzinfo=timezone.utc)
    current_time = base_time

    def mock_clock() -> datetime:
        return current_time

    storage = DeviceStorage()
    service = DeviceFleetService(storage=storage, timeout_seconds=30.0, clock=mock_clock)

    service.register_device(DeviceRegisterRequest(id="dev-01", name="Device 1"))

    # t = 0: Heartbeat received
    service.record_heartbeat("dev-01", HeartbeatPayload())
    assert service.get_device("dev-01").status == DeviceStatus.ONLINE

    # t = 15s: Still ONLINE
    current_time = base_time + timedelta(seconds=15)
    assert service.get_device("dev-01").status == DeviceStatus.ONLINE

    # t = 30.0s: Exactly on 30s threshold -> ONLINE
    current_time = base_time + timedelta(seconds=30.0)
    assert service.get_device("dev-01").status == DeviceStatus.ONLINE

    # t = 30.1s: Exceeded 30 seconds -> OFFLINE
    current_time = base_time + timedelta(seconds=30.1)
    assert service.get_device("dev-01").status == DeviceStatus.OFFLINE

    # t = 60s: Still OFFLINE
    current_time = base_time + timedelta(seconds=60)
    assert service.get_device("dev-01").status == DeviceStatus.OFFLINE

    # New heartbeat at t = 60s -> transitions back to ONLINE
    service.record_heartbeat("dev-01", HeartbeatPayload())
    assert service.get_device("dev-01").status == DeviceStatus.ONLINE


def test_fleet_summary_calculation():
    """Verify fleet summary correctly tallies total, online, and offline counts."""
    base_time = datetime(2026, 9, 23, 12, 0, 0, tzinfo=timezone.utc)
    current_time = base_time

    storage = DeviceStorage()
    service = DeviceFleetService(storage=storage, timeout_seconds=30.0, clock=lambda: current_time)

    # Register 4 devices
    for i in range(1, 5):
        service.register_device(DeviceRegisterRequest(id=f"dev-0{i}", name=f"Device {i}"))

    # dev-01: Heartbeat at t=0
    service.record_heartbeat("dev-01", HeartbeatPayload())

    # dev-02: Heartbeat at t=0
    service.record_heartbeat("dev-02", HeartbeatPayload())

    # dev-03 and dev-04: Never sent heartbeat

    summary = service.get_fleet_summary()
    assert summary.total == 4
    assert summary.online == 2
    assert summary.offline == 2

    # Advance time to t=35s
    current_time = base_time + timedelta(seconds=35)

    # Send heartbeat only for dev-02 at t=35s
    service.record_heartbeat("dev-02", HeartbeatPayload())

    summary_after = service.get_fleet_summary()
    assert summary_after.total == 4
    assert summary_after.online == 1  # Only dev-02 is online
    assert summary_after.offline == 3  # dev-01 timed out, dev-03 & dev-04 never sent hb


def test_concurrent_heartbeats():
    """Verify thread-safety of storage under concurrent heartbeats."""
    storage = DeviceStorage()
    service = DeviceFleetService(storage=storage)

    # Register 10 devices
    for i in range(10):
        service.register_device(DeviceRegisterRequest(id=f"dev-{i}", name=f"Device {i}"))

    def worker(dev_id: str, count: int):
        for _ in range(count):
            service.record_heartbeat(
                dev_id,
                HeartbeatPayload(status="OK", cpu_usage=25.0)
            )

    threads = []
    # 10 devices, each receiving 50 heartbeats across concurrent threads
    for i in range(10):
        t = threading.Thread(target=worker, args=(f"dev-{i}", 50))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # Verify all 10 devices recorded exactly 50 heartbeats
    for i in range(10):
        dev = service.get_device(f"dev-{i}")
        assert dev.heartbeat_count == 50
        assert dev.status == DeviceStatus.ONLINE
