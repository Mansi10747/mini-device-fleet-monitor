import { config } from "./config.js";
import { deviceStorage } from "./storage.js";

export class DeviceNotFoundError extends Error {
  constructor(id) {
    super(`Device with ID '${id}' not found`);
    this.name = "DeviceNotFoundError";
    this.statusCode = 404;
  }
}

export class DeviceAlreadyExistsError extends Error {
  constructor(id) {
    super(`Device with ID '${id}' already exists`);
    this.name = "DeviceAlreadyExistsError";
    this.statusCode = 409;
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

export class DeviceFleetService {
  constructor(storage = deviceStorage, timeoutSeconds = config.heartbeatTimeoutSeconds, clock = () => new Date()) {
    this.storage = storage;
    this.timeoutMs = timeoutSeconds * 1000;
    this.clock = clock;
  }

  /**
   * Evaluates if a device is ONLINE or OFFLINE.
   * Rule:
   *  - ONLINE if last heartbeat was received <= 30 seconds ago.
   *  - OFFLINE if no heartbeat has ever been received, or last heartbeat > 30s ago.
   * @param {string|null} lastHeartbeatIso
   * @returns {"ONLINE" | "OFFLINE"}
   */
  calculateStatus(lastHeartbeatIso) {
    if (!lastHeartbeatIso) {
      return "OFFLINE";
    }

    const lastHb = new Date(lastHeartbeatIso).getTime();
    const now = this.clock().getTime();
    const elapsed = now - lastHb;

    // Within timeout threshold (including small clock jitter tolerance up to 5s in future)
    if (elapsed >= -5000 && elapsed <= this.timeoutMs) {
      return "ONLINE";
    }

    return "OFFLINE";
  }

  /**
   * Registers a new device.
   * @param {object} param0
   * @param {string} param0.id
   * @param {string} param0.name
   */
  registerDevice({ id, name }) {
    if (!id || typeof id !== "string" || !id.trim()) {
      throw new ValidationError("Device ID must be a non-empty string");
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new ValidationError("Device name must be a non-empty string");
    }

    const trimmedId = id.trim();
    const trimmedName = name.trim();
    const now = this.clock();

    const record = this.storage.registerDevice(trimmedId, trimmedName, now);
    if (!record) {
      throw new DeviceAlreadyExistsError(trimmedId);
    }

    return {
      id: record.id,
      name: record.name,
      status: this.calculateStatus(record.last_heartbeat),
      registered_at: record.registered_at,
      last_heartbeat: record.last_heartbeat,
    };
  }

  /**
   * Records a heartbeat for a registered device.
   * @param {string} id
   * @param {object} payload
   */
  recordHeartbeat(id, payload = {}) {
    const existing = this.storage.getDevice(id);
    if (!existing) {
      throw new DeviceNotFoundError(id);
    }

    const now = this.clock();
    let receivedAt = now;

    if (payload.timestamp) {
      const parsed = new Date(payload.timestamp);
      if (!isNaN(parsed.getTime())) {
        receivedAt = parsed;
      }
    }

    const telemetry = {};
    if (payload.status !== undefined) telemetry.status = payload.status;
    if (payload.cpu_usage !== undefined) telemetry.cpu_usage = payload.cpu_usage;
    if (payload.memory_usage !== undefined) telemetry.memory_usage = payload.memory_usage;
    if (payload.signal_strength !== undefined) telemetry.signal_strength = payload.signal_strength;
    if (payload.battery_level !== undefined) telemetry.battery_level = payload.battery_level;

    const updated = this.storage.recordHeartbeat(id, receivedAt, telemetry);
    const currentStatus = this.calculateStatus(updated.last_heartbeat);

    return {
      message: "Heartbeat recorded successfully",
      device_id: id,
      received_at: updated.last_heartbeat,
      device_status: currentStatus,
    };
  }

  /**
   * Retrieves single device detail.
   * @param {string} id
   */
  getDevice(id) {
    const record = this.storage.getDevice(id);
    if (!record) {
      throw new DeviceNotFoundError(id);
    }

    return {
      id: record.id,
      name: record.name,
      status: this.calculateStatus(record.last_heartbeat),
      registered_at: record.registered_at,
      last_heartbeat: record.last_heartbeat,
      heartbeat_count: record.heartbeat_count,
      latest_telemetry: record.latest_telemetry,
    };
  }

  /**
   * Deletes a device from the fleet.
   * @param {string} id
   */
  deleteDevice(id) {
    const existing = this.storage.getDevice(id);
    if (!existing) {
      throw new DeviceNotFoundError(id);
    }
    this.storage.deleteDevice(id);
    return {
      message: `Device '${id}' deleted successfully`,
      device_id: id,
    };
  }

  /**
   * Lists all devices with evaluated statuses.
   * @param {string} [statusFilter]
   */
  listDevices(statusFilter = null) {
    const records = this.storage.listDevices();
    const result = [];

    for (const record of records) {
      const status = this.calculateStatus(record.last_heartbeat);
      if (statusFilter && status !== statusFilter.toUpperCase()) {
        continue;
      }

      result.push({
        id: record.id,
        name: record.name,
        status,
        last_heartbeat: record.last_heartbeat,
      });
    }

    // Sort by ID
    result.sort((a, b) => a.id.localeCompare(b.id));
    return result;
  }

  /**
   * Summarizes the fleet.
   */
  getSummary() {
    const records = this.storage.listDevices();
    const total = records.length;
    let online = 0;

    for (const record of records) {
      if (this.calculateStatus(record.last_heartbeat) === "ONLINE") {
        online += 1;
      }
    }

    const offline = total - online;
    return { total, online, offline };
  }
}

// Global singleton instance
export const fleetService = new DeviceFleetService();
