from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field, field_validator


class DeviceStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"


class DeviceRegisterRequest(BaseModel):
    """Payload to register a new device."""
    id: str = Field(..., min_length=1, max_length=64, description="Unique identifier for the device")
    name: str = Field(..., min_length=1, max_length=128, description="Human-readable name of the device")

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Device ID cannot be empty or whitespace only")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Device name cannot be empty or whitespace only")
        return v


class HeartbeatPayload(BaseModel):
    """Payload received during a device heartbeat."""
    timestamp: Optional[datetime] = Field(
        default=None,
        description="ISO 8601 timestamp of heartbeat. Defaults to server UTC time if omitted."
    )
    status: Optional[str] = Field(
        default="OK",
        description="Device internal status flag (e.g. OK, WARNING, ERROR)"
    )
    cpu_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="CPU usage percentage")
    memory_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Memory usage percentage")
    signal_strength: Optional[float] = Field(default=None, description="Signal strength in dBm")
    battery_level: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Battery level percentage")
    extra: Optional[Dict[str, Any]] = Field(default=None, description="Additional custom metadata")


class HeartbeatResponse(BaseModel):
    """Response returned upon receiving a heartbeat."""
    message: str = "Heartbeat recorded successfully"
    device_id: str
    received_at: datetime
    device_status: DeviceStatus


class DeviceListItem(BaseModel):
    """Item representation in the list devices endpoint."""
    id: str
    name: str
    status: DeviceStatus
    last_heartbeat: Optional[datetime] = None


class DeviceDetail(BaseModel):
    """Detailed device representation."""
    id: str
    name: str
    status: DeviceStatus
    registered_at: datetime
    last_heartbeat: Optional[datetime] = None
    heartbeat_count: int = 0
    latest_telemetry: Optional[Dict[str, Any]] = None


class FleetSummary(BaseModel):
    """Fleet status summary."""
    total: int
    online: int
    offline: int
