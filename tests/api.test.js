import request from "supertest";
import { app } from "../src/app.js";
import { deviceStorage } from "../src/storage.js";

describe("REST API Integration Tests", () => {
  beforeEach(() => {
    deviceStorage.clear();
  });

  afterAll(() => {
    deviceStorage.clear();
  });

  test("POST /devices registers a device with 201 Created", async () => {
    const res = await request(app)
      .post("/devices")
      .send({ id: "device-01", name: "Lab Device 01" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("device-01");
    expect(res.body.name).toBe("Lab Device 01");
    expect(res.body.status).toBe("OFFLINE");
    expect(res.body.last_heartbeat).toBeNull();
  });

  test("POST /devices returns 409 Conflict for existing device ID", async () => {
    await request(app)
      .post("/devices")
      .send({ id: "device-01", name: "Lab Device 01" });

    const res = await request(app)
      .post("/devices")
      .send({ id: "device-01", name: "Duplicate" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ConflictError");
  });

  test("POST /devices returns 400 Bad Request on invalid input", async () => {
    const res1 = await request(app).post("/devices").send({ id: "dev-01" });
    expect(res1.status).toBe(400);

    const res2 = await request(app).post("/devices").send({ id: "   ", name: "Name" });
    expect(res2.status).toBe(400);
  });

  test("POST /devices/:id/heartbeat records heartbeat and sets ONLINE", async () => {
    await request(app)
      .post("/devices")
      .send({ id: "device-01", name: "Lab Device 01" });

    const res = await request(app)
      .post("/devices/device-01/heartbeat")
      .send({
        status: "OK",
        cpu_usage: 42.0,
        signal_strength: -70.0,
        battery_level: 95.0,
      });

    expect(res.status).toBe(200);
    expect(res.body.device_id).toBe("device-01");
    expect(res.body.device_status).toBe("ONLINE");
    expect(res.body.received_at).toBeDefined();
  });

  test("POST /devices/:id/heartbeat returns 404 for unknown device", async () => {
    const res = await request(app)
      .post("/devices/ghost-device/heartbeat")
      .send({ status: "OK" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NotFoundError");
  });

  test("GET /devices lists all registered devices", async () => {
    await request(app).post("/devices").send({ id: "dev-01", name: "D1" });
    await request(app).post("/devices").send({ id: "dev-02", name: "D2" });

    await request(app).post("/devices/dev-01/heartbeat").send({});

    const res = await request(app).get("/devices");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);

    const d1 = res.body.find((d) => d.id === "dev-01");
    const d2 = res.body.find((d) => d.id === "dev-02");

    expect(d1.status).toBe("ONLINE");
    expect(d2.status).toBe("OFFLINE");
  });

  test("GET /devices?status=ONLINE filters properly", async () => {
    await request(app).post("/devices").send({ id: "dev-01", name: "D1" });
    await request(app).post("/devices").send({ id: "dev-02", name: "D2" });
    await request(app).post("/devices/dev-01/heartbeat").send({});

    const res = await request(app).get("/devices?status=ONLINE");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe("dev-01");
  });

  test("GET /devices/:id returns full details and telemetry", async () => {
    await request(app).post("/devices").send({ id: "dev-01", name: "Sensor" });
    await request(app).post("/devices/dev-01/heartbeat").send({
      status: "OK",
      cpu_usage: 34.5,
      battery_level: 88.0,
    });

    const res = await request(app).get("/devices/dev-01");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("dev-01");
    expect(res.body.status).toBe("ONLINE");
    expect(res.body.heartbeat_count).toBe(1);
    expect(res.body.latest_telemetry.cpu_usage).toBe(34.5);
    expect(res.body.latest_telemetry.battery_level).toBe(88.0);
  });

  test("GET /devices/:id returns 404 for non-existent device", async () => {
    const res = await request(app).get("/devices/missing-device");
    expect(res.status).toBe(404);
  });

  test("GET /summary returns total, online, and offline counts", async () => {
    const resEmpty = await request(app).get("/summary");
    expect(resEmpty.status).toBe(200);
    expect(resEmpty.body).toEqual({ total: 0, online: 0, offline: 0 });

    await request(app).post("/devices").send({ id: "dev-01", name: "D1" });
    await request(app).post("/devices").send({ id: "dev-02", name: "D2" });
    await request(app).post("/devices").send({ id: "dev-03", name: "D3" });

    await request(app).post("/devices/dev-01/heartbeat").send({});
    await request(app).post("/devices/dev-02/heartbeat").send({});

    const res = await request(app).get("/summary");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 3, online: 2, offline: 1 });
  });

  test("GET /health returns health info", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.timeout_seconds).toBe(30.0);
  });

  test("DELETE /devices/:id rejects deletion when fleet has 5 or fewer devices", async () => {
    // Register 5 devices
    for (let i = 1; i <= 5; i++) {
      await request(app).post("/devices").send({ id: `d-${i}`, name: `Dev ${i}` });
    }

    // Try deleting one of them -> should fail with 400
    const delRes = await request(app).delete("/devices/d-1");
    expect(delRes.status).toBe(400);
    expect(delRes.body.detail).toContain("Fleet must maintain a minimum of 5 devices");

    // Fleet count should still be 5
    const list = await request(app).get("/devices");
    expect(list.body.length).toBe(5);
  });

  test("DELETE /devices/:id permits deletion when fleet has more than 5 devices", async () => {
    // Register 6 devices
    for (let i = 1; i <= 6; i++) {
      await request(app).post("/devices").send({ id: `d-${i}`, name: `Dev ${i}` });
    }

    // Delete device 6 -> succeeds with 200
    const delRes = await request(app).delete("/devices/d-6");
    expect(delRes.status).toBe(200);
    expect(delRes.body.device_id).toBe("d-6");

    // Fleet count should now be 5
    const list = await request(app).get("/devices");
    expect(list.body.length).toBe(5);
    expect(list.body.some((d) => d.id === "d-6")).toBe(false);

    // Deleting again when 5 devices remain should be rejected
    const delAgain = await request(app).delete("/devices/d-5");
    expect(delAgain.status).toBe(400);
  });

  test("DELETE /devices/:id guarantees that 5 devices always remain ONLINE after deletion", async () => {
    // Register 6 devices
    for (let i = 1; i <= 6; i++) {
      await request(app).post("/devices").send({ id: `d-${i}`, name: `Dev ${i}` });
    }
    // Only 3 sent heartbeats originally
    await request(app).post("/devices/d-1/heartbeat").send({});
    await request(app).post("/devices/d-2/heartbeat").send({});
    await request(app).post("/devices/d-3/heartbeat").send({});

    // Delete d-1
    const delRes = await request(app).delete("/devices/d-1");
    expect(delRes.status).toBe(200);

    // Fleet summary must reflect exactly 5 devices total and all 5 ONLINE
    const summary = await request(app).get("/summary");
    expect(summary.body.total).toBe(5);
    expect(summary.body.online).toBe(5);
    expect(summary.body.offline).toBe(0);

    // All remaining devices must be ONLINE
    const list = await request(app).get("/devices");
    expect(list.body.length).toBe(5);
    list.body.forEach((d) => {
      expect(d.status).toBe("ONLINE");
    });
  });
});
