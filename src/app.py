from datetime import datetime, timezone
import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from src.config import settings
from src.models import (
    DeviceDetail,
    DeviceListItem,
    DeviceRegisterRequest,
    DeviceStatus,
    FleetSummary,
    HeartbeatPayload,
    HeartbeatResponse,
)
from src.service import (
    DeviceAlreadyExistsError,
    DeviceNotFoundError,
    fleet_service,
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Simnovus Mini Device Fleet Monitor API. "
        "Monitors connected devices and tracks their real-time ONLINE/OFFLINE statuses "
        "based on a 30-second heartbeat window."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for local UI and testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static directory path
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse, summary="Fleet Dashboard UI")
def get_dashboard():
    """Serves the live web dashboard UI, or fallback redirect/html."""
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse(
        content="""
        <html>
            <head><title>Mini Device Fleet Monitor</title></head>
            <body style="font-family: sans-serif; padding: 2rem;">
                <h1>Mini Device Fleet Monitor</h1>
                <p>API is running. Visit <a href="/docs">Swagger API Documentation</a> or <a href="/summary">Fleet Summary</a>.</p>
            </body>
        </html>
        """
    )


@app.get("/health", summary="Service Health Check")
def health_check():
    """Returns the operational status of the service."""
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
        "timeout_seconds": settings.heartbeat_timeout_seconds,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post(
    "/devices",
    response_model=DeviceDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new device",
)
def register_device(request: DeviceRegisterRequest):
    """
    Registers a new device into the fleet.
    Returns 201 Created on success, or 409 Conflict if the device ID is already registered.
    """
    try:
        record = fleet_service.register_device(request)
        return fleet_service.get_device(record.id)
    except DeviceAlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@app.post(
    "/devices/{id}/heartbeat",
    response_model=HeartbeatResponse,
    status_code=status.HTTP_200_OK,
    summary="Receive a device heartbeat",
)
def receive_heartbeat(id: str, payload: Optional[HeartbeatPayload] = None):
    """
    Records a periodic heartbeat from a registered device.
    Supports optional telemetry such as cpu_usage, signal_strength, battery_level, and custom metadata.
    Returns 404 Not Found if device is not registered.
    """
    payload = payload or HeartbeatPayload()
    try:
        record = fleet_service.record_heartbeat(id, payload)
        current_status = fleet_service.calculate_status(record.last_heartbeat)
        return HeartbeatResponse(
            message="Heartbeat recorded successfully",
            device_id=id,
            received_at=record.last_heartbeat,
            device_status=current_status,
        )
    except DeviceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@app.get(
    "/devices",
    response_model=List[DeviceListItem],
    status_code=status.HTTP_200_OK,
    summary="List all devices with current status",
)
def list_devices(
    status: Optional[DeviceStatus] = Query(
        None, description="Optional filter by status (ONLINE or OFFLINE)"
    )
):
    """
    Lists all registered devices along with their automatically evaluated ONLINE/OFFLINE status.
    Devices with no heartbeat in the last 30 seconds are marked OFFLINE.
    """
    return fleet_service.list_devices(status_filter=status)


@app.get(
    "/devices/{id}",
    response_model=DeviceDetail,
    status_code=status.HTTP_200_OK,
    summary="Get details for a single device",
)
def get_device(id: str):
    """
    Retrieves complete details for a specific device, including registration time,
    last heartbeat, heartbeat count, and latest telemetry payload.
    """
    try:
        return fleet_service.get_device(id)
    except DeviceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@app.get(
    "/summary",
    response_model=FleetSummary,
    status_code=status.HTTP_200_OK,
    summary="Fleet status summary",
)
def get_fleet_summary():
    """
    Provides a real-time summary of the fleet, counting total devices,
    online devices (heartbeat <= 30s ago), and offline devices.
    """
    return fleet_service.get_fleet_summary()
