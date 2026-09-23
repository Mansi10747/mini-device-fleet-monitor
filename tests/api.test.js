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

  test("DELETE /devices/:id deletes a registered device", async () => {
    await request(app).post("/devices").send({ id: "dev-to-delete", name: "Temporary" });

    // Verify it exists
    const beforeList = await request(app).get("/devices");
    expect(beforeList.body.some((d) => d.id === "dev-to-delete")).toBe(true);

    // Delete it
    const delRes = await request(app).delete("/devices/dev-to-delete");
    expect(delRes.status).toBe(200);
    expect(delRes.body.device_id).toBe("dev-to-delete");

    // Verify it no longer exists
    const afterList = await request(app).get("/devices");
    expect(afterList.body.some((d) => d.id === "dev-to-delete")).toBe(false);

    // Further DELETE returns 404
    const delAgain = await request(app).delete("/devices/dev-to-delete");
    expect(delAgain.status).toBe(404);
  });
});
