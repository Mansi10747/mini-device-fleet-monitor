/**
 * In-memory storage repository for device registrations and heartbeats.
 */
export class DeviceStorage {
  constructor(maxHistoryPerDevice = 50) {
    this._devices = new Map();
    this._maxHistory = maxHistoryPerDevice;
  }

  /**
   * Registers a new device.
   * @param {string} id
   * @param {string} name
   * @param {Date} [registeredAt]
   * @returns {object|null} The registered device record, or null if ID already exists.
   */
  registerDevice(id, name, registeredAt = new Date()) {
    if (this._devices.has(id)) {
      return null;
    }

    const record = {
      id,
      name,
      registered_at: registeredAt.toISOString(),
      last_heartbeat: null,
      heartbeat_count: 0,
      latest_telemetry: null,
      heartbeat_history: [],
    };

    this._devices.set(id, record);
    return { ...record };
  }

  /**
   * Retrieves a device record by ID.
   * @param {string} id
   * @returns {object|null}
   */
  getDevice(id) {
    const record = this._devices.get(id);
    if (!record) return null;
    return { ...record };
  }

  /**
   * Returns a snapshot array of all device records.
   * @returns {object[]}
   */
  listDevices() {
    return Array.from(this._devices.values()).map((record) => ({ ...record }));
  }

  /**
   * Records a heartbeat for a registered device.
   * @param {string} id
   * @param {Date} receivedAt
   * @param {object} [telemetry]
   * @returns {object|null} Updated device record, or null if device not found.
   */
  recordHeartbeat(id, receivedAt, telemetry = null) {
    const record = this._devices.get(id);
    if (!record) return null;

    record.last_heartbeat = receivedAt.toISOString();
    record.heartbeat_count += 1;

    if (telemetry && Object.keys(telemetry).length > 0) {
      record.latest_telemetry = { ...telemetry };
      record.heartbeat_history.push({
        timestamp: record.last_heartbeat,
        data: telemetry,
      });

      if (record.heartbeat_history.length > this._maxHistory) {
        record.heartbeat_history.shift();
      }
    }

    return { ...record };
  }

  /**
   * Deletes a device from storage.
   * @param {string} id
   * @returns {boolean} True if removed, false if not found.
   */
  deleteDevice(id) {
    return this._devices.delete(id);
  }

  /**
   * Clears all stored records (useful for test isolation).
   */
  clear() {
    this._devices.clear();
  }

  /**
   * Total number of devices.
   */
  count() {
    return this._devices.size;
  }
}

// Global singleton instance
export const deviceStorage = new DeviceStorage();
