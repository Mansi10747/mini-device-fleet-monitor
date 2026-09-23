import {
  DeviceFleetService,
  DeviceAlreadyExistsError,
  DeviceNotFoundError,
  ValidationError,
} from "../src/service.js";
import { DeviceStorage } from "../src/storage.js";

describe("DeviceFleetService Unit Tests", () => {
  let storage;
  let service;

  beforeEach(() => {
    storage = new DeviceStorage();
    service = new DeviceFleetService(storage, 30.0);
  });

  test("registers a device successfully", () => {
    const dev = service.registerDevice({ id: "dev-01", name: "Lab Device 01" });
    expect(dev.id).toBe("dev-01");
    expect(dev.name).toBe("Lab Device 01");
    expect(dev.status).toBe("OFFLINE");
    expect(dev.last_heartbeat).toBeNull();
    expect(storage.count()).toBe(1);
  });

  test("throws DeviceAlreadyExistsError on duplicate ID", () => {
    service.registerDevice({ id: "dev-01", name: "Lab Device 01" });
    expect(() => {
      service.registerDevice({ id: "dev-01", name: "Duplicate" });
    }).toThrow(DeviceAlreadyExistsError);
  });

  test("throws ValidationError on empty or missing fields", () => {
    expect(() => service.registerDevice({ id: "", name: "Valid" })).toThrow(ValidationError);
    expect(() => service.registerDevice({ id: "   ", name: "Valid" })).toThrow(ValidationError);
    expect(() => service.registerDevice({ id: "dev-01", name: "" })).toThrow(ValidationError);
  });

  test("throws DeviceNotFoundError for heartbeat to unregistered device", () => {
    expect(() => {
      service.recordHeartbeat("ghost-dev", { status: "OK" });
    }).toThrow(DeviceNotFoundError);
  });

  test("marks newly registered device without heartbeats as OFFLINE", () => {
    service.registerDevice({ id: "dev-01", name: "Device 1" });
    const detail = service.getDevice("dev-01");
    expect(detail.status).toBe("OFFLINE");
    expect(detail.last_heartbeat).toBeNull();
    expect(detail.heartbeat_count).toBe(0);
  });

  test("evaluates exact 30-second timeout boundary with mock clock", () => {
    const baseTime = new Date("2026-09-23T12:00:00.000Z");
    let currentTime = new Date(baseTime);

    const mockClock = () => currentTime;
    const testService = new DeviceFleetService(storage, 30.0, mockClock);

    testService.registerDevice({ id: "dev-01", name: "Device 1" });

    // t = 0s: Heartbeat received
    testService.recordHeartbeat("dev-01", { status: "OK" });
    expect(testService.getDevice("dev-01").status).toBe("ONLINE");

    // t = 15s: Halfway through -> ONLINE
    currentTime = new Date(baseTime.getTime() + 15 * 1000);
    expect(testService.getDevice("dev-01").status).toBe("ONLINE");

    // t = 30.0s: Exact threshold boundary -> ONLINE
    currentTime = new Date(baseTime.getTime() + 30 * 1000);
    expect(testService.getDevice("dev-01").status).toBe("ONLINE");

    // t = 30.1s: Past 30 seconds -> OFFLINE
    currentTime = new Date(baseTime.getTime() + 30.1 * 1000);
    expect(testService.getDevice("dev-01").status).toBe("OFFLINE");

    // t = 60s: Still OFFLINE
    currentTime = new Date(baseTime.getTime() + 60 * 1000);
    expect(testService.getDevice("dev-01").status).toBe("OFFLINE");

    // Send new heartbeat at t = 60s -> transitions back to ONLINE
    testService.recordHeartbeat("dev-01", { status: "OK" });
    expect(testService.getDevice("dev-01").status).toBe("ONLINE");
  });

  test("calculates fleet summary accurately", () => {
    const baseTime = new Date("2026-09-23T12:00:00.000Z");
    let currentTime = new Date(baseTime);

    const testService = new DeviceFleetService(storage, 30.0, () => currentTime);

    // Register 4 devices
    testService.registerDevice({ id: "dev-01", name: "D1" });
    testService.registerDevice({ id: "dev-02", name: "D2" });
    testService.registerDevice({ id: "dev-03", name: "D3" });
    testService.registerDevice({ id: "dev-04", name: "D4" });

    // Heartbeat dev-01 and dev-02
    testService.recordHeartbeat("dev-01", {});
    testService.recordHeartbeat("dev-02", {});

    const s1 = testService.getSummary();
    expect(s1.total).toBe(4);
    expect(s1.online).toBe(2);
    expect(s1.offline).toBe(2);

    // Advance time by 35s
    currentTime = new Date(baseTime.getTime() + 35 * 1000);
    // dev-02 sends new heartbeat, dev-01 does not
    testService.recordHeartbeat("dev-02", {});

    const s2 = testService.getSummary();
    expect(s2.total).toBe(4);
    expect(s2.online).toBe(1); // Only dev-02
    expect(s2.offline).toBe(3); // dev-01 timed out, dev-03 & dev-04 never sent hb
  });

  test("filters devices list by status", () => {
    service.registerDevice({ id: "dev-01", name: "D1" });
    service.registerDevice({ id: "dev-02", name: "D2" });

    service.recordHeartbeat("dev-01", {});

    const onlineDevices = service.listDevices("ONLINE");
    expect(onlineDevices.length).toBe(1);
    expect(onlineDevices[0].id).toBe("dev-01");

    const offlineDevices = service.listDevices("OFFLINE");
    expect(offlineDevices.length).toBe(1);
    expect(offlineDevices[0].id).toBe("dev-02");
  });
});
