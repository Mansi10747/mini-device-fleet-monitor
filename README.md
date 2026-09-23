# Mini Device Fleet Monitor (Node.js)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v22-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21.0-blue.svg)](https://expressjs.com/)
[![Jest](https://img.shields.io/badge/Tested%20with-Jest-red.svg)](https://jestjs.io/)
[![License](https://img.shields.io/badge/License-ISC-lightgrey.svg)]()

A robust, production-grade monitoring application built in **Node.js** for the **Simnovus Campus Hiring Round 2** engineering assessment. The system ingests periodic heartbeats from a fleet of simulated hardware/IoT devices, automatically tracks their operational status (`ONLINE` vs `OFFLINE`) based on a 30-second sliding timeout window, and provides fleet-wide observability via REST APIs and an interactive real-time web dashboard.

---

## Table of Contents
1. [What the Project Does](#1-what-the-project-does)
2. [Design and Architecture](#2-design-and-architecture)
3. [Prerequisites](#3-prerequisites)
4. [How to Build the Application](#4-how-to-build-the-application)
5. [How to Run the Application](#5-how-to-run-the-application)
6. [How to Run the Simulator](#6-how-to-run-the-simulator)
7. [How to Run the Tests](#7-how-to-run-the-tests)
8. [Example API Requests](#8-example-api-requests)
9. [Assumptions Made](#9-assumptions-made)
10. [Known Limitations](#10-known-limitations)
11. [What I Would Improve With One Additional Day](#11-what-i-would-improve-with-one-additional-day)
12. [AI Usage](#12-ai-usage)
13. [Project Directory Structure](#13-project-directory-structure)

---

## 1. What the Project Does

In edge hardware and IoT deployments (such as 4G/5G testbeds, remote sensors, and lab equipment), devices periodically transmit a "heartbeat" message to notify central telemetry systems that they are alive and operational.

This project delivers:
- **Device Onboarding**: An API to register devices with unique alphanumeric IDs and human-readable names.
- **Heartbeat Ingestion**: Accepts periodic HTTP POST heartbeats containing UTC timestamps, status codes, and multi-metric sensor telemetry (CPU usage, memory usage, battery percentage, signal strength).
- **Automated 30-Second Timeout Status**:
  - **`ONLINE`**: A valid heartbeat has been received within the last **30 seconds** (`now - last_heartbeat <= 30s`).
  - **`OFFLINE`**: No heartbeat has been received for more than **30 seconds**, or the device has never sent a heartbeat since initial registration.
- **Fleet Observability**: Provides aggregated fleet statistics (`total`, `online`, `offline`), individual device inspection, and filtered listings.
- **Hardware Fleet Simulator**: An asynchronous multi-device simulation program that simulates 5+ hardware devices transmitting heartbeats every 5 seconds, featuring interactive fault simulation to halt any device and watch it transition to `OFFLINE` after 30 seconds.
- **Live Interactive Dashboard**: An embedded, modern single-page dashboard at `http://127.0.0.1:8000/` with live auto-sync, second-by-second countdown timers (`Timeout in 25s`), clickable device ID details popup, and manual heartbeat trigger pulses.

---

## 2. Design and Architecture

The application adopts a clean, layered architectural pattern, strictly separating transport (HTTP/REST), business domain logic, and data storage.

```
┌────────────────────────────────────────────────────────┐
│             Simulated Hardware Fleet                   │
│      device-01   device-02   device-03   ...           │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP POST Heartbeats (every 5s)
                            ▼
┌────────────────────────────────────────────────────────┐
│            Express REST Transport & Web UI             │
│   POST /devices                POST /devices/:id/hb    │
│   GET  /devices                GET  /devices/:id       │
│   GET  /summary                GET  /                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          DeviceFleetService (Domain Layer)             │
│  - Enforces 30.0s Sliding Window Rule                  │
│  - Dynamic Status Evaluation                           │
│  - Injectable Clock for Deterministic Testing          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             DeviceStorage (In-Memory Store)            │
│  - High-performance JavaScript Map (O(1) lookups)      │
│  - Single-threaded event loop atomic access            │
│  - Bounded ring buffer for telemetry history           │
└────────────────────────────────────────────────────────┘
```

### Architectural Highlights

#### 1. Dynamic Evaluation vs. Background Sweepers
Many systems implement timeouts using a background timer (`setInterval`) that periodically sweeps all devices and toggles a stored `is_online` boolean.
* **Why we rejected the sweeper approach**:
  - Introduces latency: If the sweeper runs every 5 seconds, a device that times out at second 30.1 might not be flagged as `OFFLINE` until second 35 (up to 5 seconds of stale state).
  - Unnecessary CPU consumption continuously scanning idle devices.
* **Our production approach (Dynamic Evaluation)**:
  - Device status is computed on-the-fly at the exact microsecond of read access:
    $$\text{Status} = \begin{cases} \text{ONLINE} & \text{if } (\text{now} - \text{last\_heartbeat}) \le 30000\text{ ms} \\ \text{OFFLINE} & \text{otherwise} \end{cases}$$
  - Guarantees 100% microsecond precision, zero stale data, and zero background CPU overhead.

#### 2. Injectable Clock Pattern for Deterministic Testing
`DeviceFleetService` accepts an injectable clock function (`clock = () => new Date()`). In production, this uses system time. In automated unit tests, we inject a mock clock to advance time deterministically (e.g. advance by 30.1s instantly) to verify the exact boundary without `setTimeout` delays.

#### 3. Thread-Safe In-Memory Storage & Bounded Ring Buffer
- Stored using native JavaScript `Map` structures, guaranteeing $O(1)$ read and write performance.
- Because Node.js utilizes a single-threaded event loop, synchronous `Map` mutations are inherently atomic and immune to multi-threaded race conditions.
- To prevent memory exhaustion during long-running tests, the telemetry buffer per device is capped at the **latest 50 heartbeats** (`_maxHistory = 50`), automatically purging older entries.

---

## 3. Prerequisites

- **Node.js**: Version **18.0.0** or higher (tested and verified on Node.js **v22.17.0**).
- **npm**: Version **9.0.0** or higher (verified on npm **10.9.2**).
- *(Optional)* **Docker & Docker Compose**: For containerized execution.

---

## 4. How to Build the Application

1. Clone the repository and navigate into the project root:
   ```bash
   git clone <YOUR_GIT_REPO_URL>
   cd "heartbeat simnovus"
   ```

2. Install all required production and development dependencies:
   ```bash
   npm install
   ```

*(Note: No build/transpilation step is required because this project is written using native modern Node.js ES Modules).*

---

## 5. How to Run the Application

### Option A: Local Node.js Server (Recommended)
Start the application server:
```bash
npm start
```
*(Or run in development watch mode with auto-reload: `npm run dev`)*

The server will initialize on port **8000**:
```text
======================================================
  Mini Device Fleet Monitor v1.0.0
  Running on http://127.0.0.1:8000
  Heartbeat Timeout Threshold: 30 seconds
======================================================
```

Direct URLs:
- **Interactive Web Dashboard**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Fleet Summary API**: [http://127.0.0.1:8000/summary](http://127.0.0.1:8000/summary)
- **Device List API**: [http://127.0.0.1:8000/devices](http://127.0.0.1:8000/devices)
- **Health Check API**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### Option B: Docker Container
Build and run via Docker:
```bash
docker build -t mini-device-fleet-monitor .
docker run -p 8000:8000 mini-device-fleet-monitor
```

Or run via Docker Compose:
```bash
docker-compose up --build
```

---

## 6. How to Run the Simulator

Open a **second terminal window** (while the application server is running).

### Standard Simulator (5 devices, 5s interval):
```bash
npm run simulator
```
or:
```bash
node simulator/simulator.js
```

What the simulator does:
1. Automatically registers `device-01` through `device-05` if not already registered.
2. Begins transmitting heartbeats every 5 seconds for each device with randomized sensor telemetry (CPU usage, signal strength, memory usage, battery level).

### Interactive Terminal Commands
While the simulator is running, type commands into the terminal prompt:

| Command | Action |
|---|---|
| `stop <device-id>` | Stops heartbeats for a device (e.g. `stop device-03`). Watch it turn **`OFFLINE`** after 30s! |
| `resume <device-id>` | Resumes heartbeats for that device (e.g. `resume device-03`). Turns it back **`ONLINE`**! |
| `summary` | Fetches and prints the current server fleet summary directly to the terminal. |
| `quit` | Cleanly shuts down all simulator device timers. |

### Programmed Fault Injection (Automated Verification)
To automate the verification without manual typing, run:
```bash
node simulator/simulator.js --devices 5 --interval 5 --stop-device device-03 --stop-after 10
```
This automatically stops `device-03` after 10 seconds. You can observe `device-03` transition to `OFFLINE` at second 30 while the other 4 devices stay `ONLINE`.

---

## 7. How to Run the Tests

The project includes a comprehensive automated test suite consisting of **19 tests** across unit testing and API integration testing.

Run the test suite with npm:
```bash
npm test
```

### Test Coverage Highlights:
- **`tests/service.test.js`** (Unit & Boundary Tests):
  - Device registration and duplicate rejection (`DeviceAlreadyExistsError`).
  - Validation rules for empty or whitespace-only IDs and names (`ValidationError`).
  - Heartbeat on unknown device (`DeviceNotFoundError`).
  - Newly registered device initial `OFFLINE` state.
  - **Exact 30-Second Boundary Verification**:
    - `t = 0s`: Heartbeat received $\rightarrow$ `ONLINE`
    - `t = 15s`: Within window $\rightarrow$ `ONLINE`
    - `t = 30.0s`: Threshold boundary $\rightarrow$ `ONLINE`
    - `t = 30.1s`: Exceeded 30 seconds $\rightarrow$ `OFFLINE`
    - `t = 60.0s`: Exceeded $\rightarrow$ `OFFLINE`
    - New heartbeat received at `t = 60s` $\rightarrow$ transitions back to `ONLINE`.
  - Fleet summary calculations and status filtering (`ONLINE` / `OFFLINE`).
- **`tests/api.test.js`** (REST Integration Tests with Supertest):
  - `POST /devices` (201 Created, 409 Conflict, 400 Bad Request).
  - `POST /devices/:id/heartbeat` (200 OK with `device_status`, 404 Not Found).
  - `GET /devices` (List verification and `?status=` query filtering).
  - `GET /devices/:id` (Full detail inspection with telemetry).
  - `GET /summary` (Aggregated total, online, and offline counts).
  - `GET /health` (Operational healthcheck).

---

## 8. Example API Requests

All requests and responses use standard `application/json`.

### 1. Register a Device
```bash
curl -X POST http://127.0.0.1:8000/devices \
  -H "Content-Type: application/json" \
  -d '{"id": "device-01", "name": "Lab Device 01"}'
```
**Response (`201 Created`):**
```json
{
  "id": "device-01",
  "name": "Lab Device 01",
  "status": "OFFLINE",
  "registered_at": "2026-09-24T04:28:44.123Z",
  "last_heartbeat": null
}
```

### 2. Send Device Heartbeat
```bash
curl -X POST http://127.0.0.1:8000/devices/device-01/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-09-24T04:28:50.000Z",
    "status": "OK",
    "cpu_usage": 42.3,
    "memory_usage": 61.2,
    "battery_level": 94.0,
    "signal_strength": -71.0
  }'
```
**Response (`200 OK`):**
```json
{
  "message": "Heartbeat recorded successfully",
  "device_id": "device-01",
  "received_at": "2026-09-24T04:28:50.000Z",
  "device_status": "ONLINE"
}
```

### 3. List All Devices
```bash
curl http://127.0.0.1:8000/devices
```
**Response (`200 OK`):**
```json
[
  {
    "id": "device-01",
    "name": "Lab Device 01",
    "status": "ONLINE",
    "last_heartbeat": "2026-09-24T04:28:50.000Z"
  }
]
```
*Optional Status Filter*:
```bash
curl "http://127.0.0.1:8000/devices?status=ONLINE"
```

### 4. Get Device Details
```bash
curl http://127.0.0.1:8000/devices/device-01
```
**Response (`200 OK`):**
```json
{
  "id": "device-01",
  "name": "Lab Device 01",
  "status": "ONLINE",
  "registered_at": "2026-09-24T04:28:44.123Z",
  "last_heartbeat": "2026-09-24T04:28:50.000Z",
  "heartbeat_count": 1,
  "latest_telemetry": {
    "status": "OK",
    "cpu_usage": 42.3,
    "memory_usage": 61.2,
    "battery_level": 94.0,
    "signal_strength": -71.0
  }
}
```

### 5. Fleet Summary
```bash
curl http://127.0.0.1:8000/summary
```
**Response (`200 OK`):**
```json
{
  "total": 5,
  "online": 4,
  "offline": 1
}
```

---

## 9. Assumptions Made

1. **Sliding Window Resolution**: Device status is calculated dynamically on-the-fly upon every read query (`now - lastHeartbeat <= 30000ms`). This ensures that status strictly reflects the real-time state of the device at the exact millisecond of query, without background polling skew.
2. **Clock Source & Skew**: Timestamps are parsed and normalized to UTC. Small client clock jitter (up to 5s in the future) is tolerated without falsely marking devices as offline. If a client omits the timestamp in its heartbeat payload, the server's current UTC time is used.
3. **Storage Persistence**: For the scope of this 3-hour evaluation, an in-memory `Map` was selected. This provides sub-millisecond ingestion throughput and zero external database setup for the evaluator.
4. **Initial Device State**: A newly registered device that has never transmitted a heartbeat is considered `OFFLINE` until its initial heartbeat arrives.
5. **Single Process Architecture**: The application runs within a single Node.js runtime process.

---

## 10. Known Limitations

1. **Process Volatility**: Because data resides in RAM, stopping or restarting the server process resets device registrations and telemetry history.
2. **Horizontal Clustering**: To scale horizontally across multiple Node.js worker processes (e.g. `pm2 cluster`), an external shared caching layer such as Redis would be required so worker processes share identical heartbeat state.
3. **History Capping**: To prevent unbounded memory growth during long continuous testing runs, each device retains only its latest 50 heartbeat telemetry events in memory.

---

## 11. What I Would Improve With One Additional Day

1. **Persistent Database Layer**: Integrate SQLite (via Prisma or Drizzle ORM) for zero-config file persistence, or PostgreSQL with TimescaleDB for time-series telemetry querying.
2. **Real-time WebSockets / SSE**: Push heartbeat events directly to the browser dashboard using WebSockets or Server-Sent Events (SSE) instead of client-side interval polling.
3. **Alerting & Webhook Notifications**: Implement automated webhook alerts (Slack/Email/PagerDuty) that fire immediately when a mission-critical device goes `OFFLINE`.
4. **Historical Telemetry Visualizations**: Embed interactive telemetry charts (using Chart.js or ApexCharts) inside the device detail popup to visualize CPU, memory, and battery trends over time.
5. **Device Authentication**: Implement API Key or JWT token authentication to ensure only authorized hardware devices can emit heartbeats.

---

## 12. AI Usage

*As required by the Simnovus project evaluation guidelines, this section outlines the utilization of AI assistance:*

- **AI Tools Used**: Google Gemini (via Antigravity AI Coding Assistant).
- **What Used For**:
  - Scaffolding the Express.js architecture and Jest/Supertest automated test suites.
  - Designing realistic hardware telemetry jitter (battery drainage, fluctuating signal dBm, CPU spikes).
  - Building the responsive HTML/CSS dashboard and clickable device details modal popup.
- **One Suggestion Changed / Improved**:
  - The initial generated draft suggested a background `setInterval` loop that iterated through all devices every 5 seconds to toggle an `is_online` boolean property.
  - **Improvement made**: I rejected the background polling sweeper approach because it creates status latency (up to 5 seconds of stale status) and wastes idle CPU cycles. Instead, I architected a pure mathematical evaluation: status is computed on-the-fly (`now - lastHeartbeat <= 30000ms`) upon every request. Furthermore, I injected a configurable `clock` dependency into `DeviceFleetService`, allowing unit tests to deterministically test the exact `30.0s` vs `30.1s` boundary in milliseconds without `setTimeout`.
- **One Thing Personally Verified Before Submitting**:
  - I personally ran `npm test` verifying that all 19 automated tests passed. I then launched the Node.js server, started the 5-device simulator, stopped `device-03` via `stop device-03`, and watched the dashboard to verify that `device-03` stayed `ONLINE` through second 30 and flipped to `OFFLINE` at second 31 while the other 4 devices remained `ONLINE`.

---

## 13. Project Directory Structure

```text
heartbeat-simnovus/
├── README.md                 # Complete project documentation
├── package.json              # Dependencies, scripts, and Jest configuration
├── package-lock.json         # Pinned dependency tree
├── Dockerfile                # Production container specification
├── docker-compose.yml        # Docker compose service definition
├── .gitignore                # Git ignore rules
│
├── src/
│   ├── config.js             # Environment settings & configuration
│   ├── storage.js            # In-memory storage repository (Map) with history cap
│   ├── service.js            # Core business logic & 30s timeout engine
│   ├── app.js                # Express REST API routes & centralized error handling
│   ├── server.js             # Server HTTP listener & graceful shutdown handlers
│   └── public/
│       └── index.html        # Real-time Web Dashboard with clickable modal & live countdown
│
├── simulator/
│   └── simulator.js          # 5+ device simulator with interactive CLI fault injection
│
└── tests/
    ├── service.test.js       # Unit tests (boundary tests, timeout rules, mock clock)
    └── api.test.js           # REST API integration tests (Supertest)
```
