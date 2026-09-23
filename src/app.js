import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import {
  fleetService,
  DeviceAlreadyExistsError,
  DeviceNotFoundError,
  ValidationError,
} from "./service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(cors());
app.use(express.json());

// Serve static dashboard files
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: config.appName,
    version: config.appVersion,
    timeout_seconds: config.heartbeatTimeoutSeconds,
    timestamp: new Date().toISOString(),
  });
});

// 1. Register a Device
app.post("/devices", (req, res, next) => {
  try {
    const { id, name } = req.body || {};
    const device = fleetService.registerDevice({ id, name });
    return res.status(201).json(device);
  } catch (err) {
    next(err);
  }
});

// 2. Receive a Device Heartbeat
app.post("/devices/:id/heartbeat", (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const result = fleetService.recordHeartbeat(id, payload);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 3. List Devices (with optional status filter)
app.get("/devices", (req, res) => {
  const statusFilter = req.query.status ? String(req.query.status) : null;
  const devices = fleetService.listDevices(statusFilter);
  return res.status(200).json(devices);
});

// 4. Get Device Details
app.get("/devices/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const device = fleetService.getDevice(id);
    return res.status(200).json(device);
  } catch (err) {
    next(err);
  }
});

// Delete Device
app.delete("/devices/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const result = fleetService.deleteDevice(id);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 5. Fleet Summary
app.get("/summary", (req, res) => {
  const summary = fleetService.getSummary();
  return res.status(200).json(summary);
});

// Root route - serve dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Centralized error handler
app.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: "ValidationError", detail: err.message });
  }
  if (err instanceof DeviceAlreadyExistsError) {
    return res.status(409).json({ error: "ConflictError", detail: err.message });
  }
  if (err instanceof DeviceNotFoundError) {
    return res.status(404).json({ error: "NotFoundError", detail: err.message });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "InternalServerError", detail: err.message || "An unexpected error occurred" });
});
