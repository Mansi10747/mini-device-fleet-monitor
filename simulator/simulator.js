#!/usr/bin/env node
/**
 * Mini Device Fleet Simulator (Node.js)
 * Simulates 5+ IoT hardware devices sending periodic heartbeats to the Monitor API.
 * Supports interactive fault injection to pause any device and observe the 30-second OFFLINE transition.
 */

import readline from "readline";

// Parse CLI flags
const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
};

const BASE_URL = getArg("--url", "http://127.0.0.1:8000").replace(/\/$/, "");
const NUM_DEVICES = Math.max(5, parseInt(getArg("--devices", "5"), 10));
const INTERVAL_SECONDS = parseFloat(getArg("--interval", "5.0"));
const STOP_DEVICE_ID = getArg("--stop-device", null);
const STOP_AFTER_SECONDS = getArg("--stop-after", null) ? parseFloat(getArg("--stop-after", "0")) : null;

class SimulatedDevice {
  constructor(id, name, baseUrl, intervalSec) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.intervalMs = intervalSec * 1000;
    this.isRunning = true;
    this.heartbeatCount = 0;
    this.batteryLevel = +(85 + Math.random() * 15).toFixed(1);
    this.timer = null;
  }

  async register() {
    try {
      const res = await fetch(`${this.baseUrl}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: this.id, name: this.name }),
      });

      const now = new Date().toLocaleTimeString();
      if (res.status === 201) {
        console.log(`[${now}] [REGISTERED] ${this.id} (${this.name})`);
        return true;
      } else if (res.status === 409) {
        console.log(`[${now}] [ALREADY REGISTERED] ${this.id}`);
        return true;
      } else {
        const text = await res.text();
        console.error(`[${now}] [REGISTER ERROR] ${this.id}: ${res.status} - ${text}`);
        return false;
      }
    } catch (err) {
      console.error(`[ERROR] Could not connect to API server at ${this.baseUrl}: ${err.message}`);
      return false;
    }
  }

  async sendHeartbeat() {
    if (!this.isRunning) return;

    this.batteryLevel = Math.max(5, +(this.batteryLevel - (0.01 + Math.random() * 0.04)).toFixed(1));
    const payload = {
      timestamp: new Date().toISOString(),
      status: "OK",
      cpu_usage: +(10 + Math.random() * 55).toFixed(1),
      memory_usage: +(25 + Math.random() * 50).toFixed(1),
      signal_strength: +(-85 + Math.random() * 35).toFixed(1),
      battery_level: this.batteryLevel,
    };

    try {
      const res = await fetch(`${this.baseUrl}/devices/${this.id}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const now = new Date().toLocaleTimeString();
      if (res.status === 200) {
        this.heartbeatCount += 1;
        const data = await res.json();
        console.log(
          `[${now}] [HEARTBEAT #${this.heartbeatCount}] ${this.id} -> HTTP 200 ` +
          `(Status: ${data.device_status}, CPU: ${payload.cpu_usage}%, Signal: ${payload.signal_strength} dBm)`
        );
      } else {
        const text = await res.text();
        console.error(`[${now}] [HEARTBEAT FAILED] ${this.id}: ${res.status} - ${text}`);
      }
    } catch (err) {
      console.error(`[ERROR] Heartbeat transmission failed for ${this.id}: ${err.message}`);
    }
  }

  start() {
    // Send immediate initial heartbeat, then periodic intervals
    this.sendHeartbeat();
    this.timer = setInterval(() => {
      if (this.isRunning) {
        this.sendHeartbeat();
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }
}

class FleetSimulator {
  constructor() {
    this.devices = new Map();
    this.rl = null;
  }

  async setup() {
    console.log(`=== Mini Device Fleet Simulator (Node.js) ===`);
    console.log(`Target API: ${BASE_URL}`);
    console.log(`Simulated Devices: ${NUM_DEVICES}`);
    console.log(`Heartbeat Interval: ${INTERVAL_SECONDS}s`);
    console.log(`---------------------------------------------`);

    for (let i = 1; i <= NUM_DEVICES; i++) {
      const id = `device-${String(i).padStart(2, "0")}`;
      const name = `Simulated Sensor ${String(i).padStart(2, "0")}`;
      const dev = new SimulatedDevice(id, name, BASE_URL, INTERVAL_SECONDS);
      this.devices.set(id, dev);
      await dev.register();
    }
  }

  async printSummary() {
    try {
      const res = await fetch(`${BASE_URL}/summary`);
      if (res.ok) {
        const s = await res.json();
        console.log(
          `\n>>> [SERVER FLEET SUMMARY] Total: ${s.total} | ONLINE: ${s.online} | OFFLINE: ${s.offline} <<<\n`
        );
      }
    } catch (err) {
      console.error(`Failed to fetch fleet summary: ${err.message}`);
    }
  }

  start() {
    for (const dev of this.devices.values()) {
      dev.start();
    }

    console.log(`\nAll ${NUM_DEVICES} devices are running and sending heartbeats.`);
    console.log(`Interactive Commands:`);
    console.log(`  stop <device-id>    - Stop sending heartbeats (simulating device failure)`);
    console.log(`  resume <device-id>  - Resume sending heartbeats`);
    console.log(`  summary             - Fetch & print current fleet summary`);
    console.log(`  quit                - Exit simulator\n`);

    // Programmed fault injection if passed via CLI
    if (STOP_DEVICE_ID && STOP_AFTER_SECONDS) {
      setTimeout(() => {
        const dev = this.devices.get(STOP_DEVICE_ID);
        if (dev) {
          dev.isRunning = false;
          console.log(
            `\n[! FAULT INJECTED !] Stopped heartbeats for '${STOP_DEVICE_ID}'. ` +
            `Watch it transition to OFFLINE after 30 seconds!\n`
          );
        }
      }, STOP_AFTER_SECONDS * 1000);
    }

    this.startCli();
  }

  startCli() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on("line", async (line) => {
      const parts = line.trim().split(/\s+/);
      const action = parts[0]?.toLowerCase();
      const target = parts[1];

      if (action === "quit" || action === "exit") {
        this.shutdown();
      } else if (action === "stop") {
        if (this.devices.has(target)) {
          this.devices.get(target).isRunning = false;
          console.log(`[ACTION] Stopped heartbeats for '${target}'. It will turn OFFLINE in 30 seconds.`);
        } else {
          console.log(`[ERROR] Device '${target}' not found. Available: ${Array.from(this.devices.keys()).join(", ")}`);
        }
      } else if (action === "resume") {
        if (this.devices.has(target)) {
          this.devices.get(target).isRunning = true;
          this.devices.get(target).sendHeartbeat();
          console.log(`[ACTION] Resumed heartbeats for '${target}'. It is now ONLINE.`);
        } else {
          console.log(`[ERROR] Device '${target}' not found.`);
        }
      } else if (action === "summary") {
        await this.printSummary();
      } else if (action) {
        console.log(`Unknown command '${action}'. Commands: stop <id>, resume <id>, summary, quit`);
      }
    });
  }

  shutdown() {
    console.log("\nStopping simulator...");
    for (const dev of this.devices.values()) {
      dev.stop();
    }
    if (this.rl) this.rl.close();
    process.exit(0);
  }
}

const sim = new FleetSimulator();
await sim.setup();
sim.start();

process.on("SIGINT", () => sim.shutdown());
process.on("SIGTERM", () => sim.shutdown());
