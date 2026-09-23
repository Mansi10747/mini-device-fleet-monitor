from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient


def test_api_register_device(client: TestClient):
    """Test POST /devices succeeds with 201 Created."""
    response = client.post(
        "/devices",
        json={"id": "device-01", "name": "Lab Device 01"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "device-01"
    assert data["name"] == "Lab Device 01"
    assert data["status"] == "OFFLINE"
    assert data["last_heartbeat"] is None


def test_api_register_device_duplicate(client: TestClient):
    """Test POST /devices with existing ID returns 409 Conflict."""
    payload = {"id": "device-01", "name": "Lab Device 01"}
    resp1 = client.post("/devices", json=payload)
    assert resp1.status_code == 201

    resp2 = client.post("/devices", json=payload)
    assert resp2.status_code == 409
    assert "already exists" in resp2.json()["detail"]


def test_api_register_device_invalid_payload(client: TestClient):
    """Test POST /devices with invalid or empty fields returns 422 Unprocessable Entity."""
    # Missing name
    resp1 = client.post("/devices", json={"id": "device-01"})
    assert resp1.status_code == 422

    # Whitespace only ID
    resp2 = client.post("/devices", json={"id": "   ", "name": "Valid Name"})
    assert resp2.status_code == 422


def test_api_receive_heartbeat_success(client: TestClient):
    """Test POST /devices/{id}/heartbeat records heartbeat and sets status to ONLINE."""
    # First register
    client.post("/devices", json={"id": "device-01", "name": "Lab Device 01"})

    # Send heartbeat
    hb_payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "OK",
        "cpu_usage": 35.5,
        "signal_strength": -65.0,
    }
    resp = client.post("/devices/device-01/heartbeat", json=hb_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["device_id"] == "device-01"
    assert data["device_status"] == "ONLINE"
    assert "received_at" in data


def test_api_receive_heartbeat_unknown_device(client: TestClient):
    """Test POST /devices/{id}/heartbeat on unknown device returns 404 Not Found."""
    resp = client.post("/devices/unknown-dev/heartbeat", json={"status": "OK"})
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_api_list_devices(client: TestClient):
    """Test GET /devices returns array of devices with current statuses."""
    # Register 2 devices
    client.post("/devices", json={"id": "dev-01", "name": "Device One"})
    client.post("/devices", json={"id": "dev-02", "name": "Device Two"})

    # Send heartbeat only to dev-01
    client.post("/devices/dev-01/heartbeat", json={})

    resp = client.get("/devices")
    assert resp.status_code == 200
    devices = resp.json()
    assert len(devices) == 2

    dev1 = next(d for d in devices if d["id"] == "dev-01")
    dev2 = next(d for d in devices if d["id"] == "dev-02")

    assert dev1["status"] == "ONLINE"
    assert dev1["last_heartbeat"] is not None
    assert dev2["status"] == "OFFLINE"
    assert dev2["last_heartbeat"] is None


def test_api_list_devices_filter_status(client: TestClient):
    """Test GET /devices?status=ONLINE filters correctly."""
    client.post("/devices", json={"id": "dev-01", "name": "Device One"})
    client.post("/devices", json={"id": "dev-02", "name": "Device Two"})
    client.post("/devices/dev-01/heartbeat", json={})

    resp_online = client.get("/devices?status=ONLINE")
    assert resp_online.status_code == 200
    items = resp_online.json()
    assert len(items) == 1
    assert items[0]["id"] == "dev-01"

    resp_offline = client.get("/devices?status=OFFLINE")
    assert resp_offline.status_code == 200
    items = resp_offline.json()
    assert len(items) == 1
    assert items[0]["id"] == "dev-02"


def test_api_get_device_detail(client: TestClient):
    """Test GET /devices/{id} returns full device details and telemetry."""
    client.post("/devices", json={"id": "dev-01", "name": "Sensor Node"})
    client.post(
        "/devices/dev-01/heartbeat",
        json={"status": "OK", "cpu_usage": 48.0, "battery_level": 92.5},
    )

    resp = client.get("/devices/dev-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "dev-01"
    assert data["name"] == "Sensor Node"
    assert data["status"] == "ONLINE"
    assert data["heartbeat_count"] == 1
    assert data["latest_telemetry"]["cpu_usage"] == 48.0
    assert data["latest_telemetry"]["battery_level"] == 92.5


def test_api_get_device_detail_not_found(client: TestClient):
    """Test GET /devices/{id} for non-existent ID returns 404."""
    resp = client.get("/devices/ghost-device")
    assert resp.status_code == 404


def test_api_fleet_summary(client: TestClient):
    """Test GET /summary returns counts of total, online, and offline devices."""
    # Initially empty
    resp0 = client.get("/summary")
    assert resp0.status_code == 200
    assert resp0.json() == {"total": 0, "online": 0, "offline": 0}

    # Register 3 devices, heartbeat 2
    client.post("/devices", json={"id": "d-1", "name": "D1"})
    client.post("/devices", json={"id": "d-2", "name": "D2"})
    client.post("/devices", json={"id": "d-3", "name": "D3"})

    client.post("/devices/d-1/heartbeat", json={})
    client.post("/devices/d-2/heartbeat", json={})

    resp = client.get("/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["online"] == 2
    assert data["offline"] == 1


def test_api_health_endpoint(client: TestClient):
    """Test GET /health returns service health information."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["timeout_seconds"] == 30.0
