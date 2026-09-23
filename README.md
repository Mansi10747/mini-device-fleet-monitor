# Mini Device Fleet Monitor (Node.js)

A lightweight, high-performance monitoring service built in **Node.js** that tracks a fleet of simulated hardware/IoT devices, ingests periodic heartbeats, automatically evaluates device health status (`ONLINE` vs `OFFLINE`) based on a 30-second sliding timeout window, and provides fleet-wide observability via REST APIs and a live web dashboard.

---

## 1. What the Project Does

In IoT and distributed edge computing systems, devices periodically send "heartbeat" signals to central servers to confirm operational health.

This Node.js application:
1. **Registers Devices**: Exposes an endpoint to onboard devices with unique IDs and human-readable names.
2. **Ingests Heartbeats**: Ingests periodic heartbeats containing timestamps, status flags, and telemetry (CPU usage, signal strength, memory usage, battery level).
3. **Automated 30-Second Timeout Rule**: Dynamically evaluates device state:
   - **`ONLINE`**: A heartbeat was received within the last **30 seconds** (`now - lastHeartbeat <= 30s`).
   - **`OFFLINE`**: No heartbeat received for more than **30 seconds**, or the device has never sent a heartbeat since registration.
4. **Fleet Observability**: Provides instant queries for fleet summary (`total`, `online`, `offline`), filtered device listings, and detailed single-device telemetry.
5. **Interactive Multi-Device Simulator**: Multi-threaded/asynchronous simulator driving 5+ concurrent devices, with real-time fault injection to pause any device and watch it transition to `OFFLINE` after 30 seconds.
6. **Live Web Dashboard**: Built-in real-time dashboard served at `http://127.0.0.1:8000/` with live auto-refreshing metrics, device status cards, and pulse triggers.

---

## 2. Design & Architecture

The application adopts a modular, layered architecture separating the HTTP transport, domain business logic, and in-memory storage.

```
┌────────────────────────────────────────────────────────┐
│               Simulated Hardware Fleet                 │
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
│  - Injectable Clock for Deterministic Boundary Tests   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             DeviceStorage (In-Memory Store)            │
│  - High-performance JavaScript Map                     │
│  - Sub-millisecond Read/Write Performance              │
│  - Bounded Telemetry Ring Buffer                       │
└────────────────────────────────────────────────────────┘
```

### Key Modules:
- **`src/config.js`**: Centralized configuration handling environment variables (`PORT`, `HOST`, `HEARTBEAT_TIMEOUT_SECONDS`).
- **`src/storage.js`**: `DeviceStorage` class managing device metadata, registration timestamps, and a bounded telemetry ring buffer (last 50 heartbeats per device) to prevent unbounded memory growth.
- **`src/service.js`**: Encapsulates core business logic. Evaluates status dynamically on-the-fly (`(now - lastHeartbeat) <= 30000ms`) upon request rather than relying on background sweeping intervals, ensuring microsecond precision with zero polling lag. Supports an injectable clock function for deterministic boundary testing.
- **`src/app.js`**: Express application configuring JSON parsers, CORS middleware, centralized error handling, and routing.
- **`src/server.js`**: Entry point managing the HTTP server lifecycle and graceful shutdown (`SIGINT`, `SIGTERM`).
- **`simulator/simulator.js`**: Node.js script simulating 5+ hardware devices using native `fetch` and interactive `readline` terminal commands.

---

## 3. Prerequisites

- **Node.js**: Version 18.0.0 or higher (developed and verified on Node.js v22.17.0)
- **npm**: Version 9.0.0 or higher (verified on npm 10.9.2)
- *(Optional)* **Docker & Docker Compose**: For containerized deployment

---

## 4. How to Build the Application

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone <repo-url>
   cd "heartbeat simnovus"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

*(No compilation or transpilation step is needed because the project uses native Node.js ES Modules).*

---

## 5. How to Run the Application

### Option A: Local Node.js Server
```bash
npm start
```
*(Or for live auto-reload during development: `npm run dev`)*

The server will start on:
- **Web Dashboard**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Fleet Summary**: [http://127.0.0.1:8000/summary](http://127.0.0.1:8000/summary)
- **Device List**: [http://127.0.0.1:8000/devices](http://127.0.0.1:8000/devices)
- **Health Check**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### Option B: Docker
```bash
docker build -t mini-fleet-monitor .
docker run -p 8000:8000 mini-fleet-monitor
```
or with Docker Compose:
```bash
docker-compose up --build
```

---

## 6. How to Run the Simulator

Open a **separate terminal window** while the application server is running.

### Standard Simulator (5 devices, 5-second interval):
```bash
node simulator/simulator.js
```
or:
```bash
npm run simulator
```

The simulator will:
1. Automatically register `device-01` through `device-05`.
2. Transmit heartbeats every 5 seconds with realistic sensor telemetry (`cpu_usage`, `memory_usage`, `signal_strength`, `battery_level`).

### Interactive Commands in Simulator:
While the simulator is running, type commands into the terminal:
- `stop device-03` : Stops heartbeats for `device-03`. After 30 seconds, watch it turn **OFFLINE** in the dashboard or via `GET /devices`!
- `resume device-03` : Resumes heartbeats for `device-03`, immediately bringing it back **ONLINE**.
- `summary` : Queries the server and prints current fleet status directly in terminal.
- `quit` : Cleanly stops all simulator timers.

### Programmed Fault Injection:
You can also run the simulator with automated fault injection:
```bash
node simulator/simulator.js --devices 5 --interval 5 --stop-device device-03 --stop-after 10
```
This automatically stops `device-03` after 10 seconds, allowing you to observe the timeout transition without manual input.

---

## 7. How to Run the Tests

The test suite contains **19 automated tests** covering unit logic, exact 30s timeout boundary conditions, error handling, and REST API integration.

Run tests using npm:
```bash
npm test
```

Expected output:
```text
PASS tests/api.test.js
PASS tests/service.test.js

Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
Snapshots:   0 total
```

---

## 8. Example API Requests

All endpoints accept and return `application/json`.

### 1. Register a Device
```http
POST /devices
Content-Type: application/json

{
  "id": "device-01",
  "name": "Lab Device 01"
}
```
**Response (`201 Created`):**
```json
{
  "id": "device-01",
  "name": "Lab Device 01",
  "status": "OFFLINE",
  "registered_at": "2026-09-23T18:00:00.000Z",
  "last_heartbeat": null
}
```

### 2. Send Heartbeat
```http
POST /devices/device-01/heartbeat
Content-Type: application/json

{
  "timestamp": "2026-09-23T18:00:05.000Z",
  "status": "OK",
  "cpu_usage": 42.5,
  "signal_strength": -71.0,
  "battery_level": 94.0
}
```
**Response (`200 OK`):**
```json
{
  "message": "Heartbeat recorded successfully",
  "device_id": "device-01",
  "received_at": "2026-09-23T18:00:05.000Z",
  "device_status": "ONLINE"
}
```

### 3. List All Devices
```http
GET /devices
```
**Response (`200 OK`):**
```json
[
  {
    "id": "device-01",
    "name": "Lab Device 01",
    "status": "ONLINE",
    "last_heartbeat": "2026-09-23T18:00:05.000Z"
  }
]
```

*Optional Filter*: `GET /devices?status=ONLINE` or `GET /devices?status=OFFLINE`.

### 4. Get Device Details
```http
GET /devices/device-01
```
**Response (`200 OK`):**
```json
{
  "id": "device-01",
  "name": "Lab Device 01",
  "status": "ONLINE",
  "registered_at": "2026-09-23T18:00:00.000Z",
  "last_heartbeat": "2026-09-23T18:00:05.000Z",
  "heartbeat_count": 1,
  "latest_telemetry": {
    "status": "OK",
    "cpu_usage": 42.5,
    "signal_strength": -71.0,
    "battery_level": 94.0
  }
}
```

### 5. Fleet Summary
```http
GET /summary
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

1. **Sliding Window vs Background Polling Interval**: Rather than running a background timer that sweeps the store every second to toggle boolean flags, device status is calculated dynamically on-the-fly upon query (`now - lastHeartbeat <= 30000ms`). This guarantees that `status` always strictly and accurately reflects the exact state at the microsecond of query.
2. **Clock Source**: Device timestamps are normalized to ISO-8601 UTC. If a device omits the timestamp in its heartbeat payload, the server's current UTC time is used.
3. **Storage Persistence**: An in-memory Map was chosen to maximize ingestion throughput, eliminate database setup overhead for evaluators, and leverage Node.js's single-threaded event loop for inherently atomic Map operations.
4. **Initial Device State**: A newly registered device that has never emitted a heartbeat is classified as `OFFLINE` until its initial heartbeat is received.

---

## 10. Known Limitations

1. **Ephemeral In-Memory Storage**: Server restarts clear device registrations and history.
2. **Multi-Process Horizontal Scaling**: Because storage is in-memory within a single Node.js process, clustering (`pm2 cluster` or Node `cluster` module) would require an external state store (such as Redis) to share heartbeat states across processes.
3. **History Retention Cap**: To prevent memory leaks during long-running tests, the in-memory telemetry buffer is capped at the 50 most recent heartbeats per device.

---

## 11. What I Would Improve With One Additional Day

1. **Persistent Database Layer**: Introduce Prisma or Drizzle ORM with SQLite/PostgreSQL for persistent device records and historical telemetry storage.
2. **WebSocket & Server-Sent Events (SSE)**: Implement real-time push updates to the dashboard via WebSockets or SSE instead of client-side interval polling.
3. **Alerting System**: Trigger webhooks or notifications (Slack/Email/SMS) when a critical device transitions from `ONLINE` to `OFFLINE`.
4. **Interactive Telemetry Visualizations**: Embed telemetry charts (Chart.js or ApexCharts) in the dashboard showing CPU, battery, and signal trends.
5. **Authentication**: Add JWT bearer token or API key authentication for secure device registration and heartbeat ingestion.

---

## AI Usage

- **AI Tools Used**: Google Gemini (via Antigravity AI Coding Assistant).
- **What Used For**:
  - Scaffolding the Express application, service layers, and Jest/Supertest test suites.
  - Generating realistic IoT telemetry attributes (battery drainage, signal dBm, CPU jitter).
  - Crafting the responsive HTML/CSS dashboard for live monitoring.
- **Suggestion Changed / Improved**:
  - The initial generated draft suggested running a `setInterval` background sweeper that iterated through all devices every 5 seconds to update an `is_online` flag.
  - **Improvement made**: I rejected the background polling sweeper approach because it introduces status lag (up to 5 seconds) and unnecessary CPU cycles. Instead, I architected a pure mathematical evaluation: status is computed dynamically as `(now - lastHeartbeat) <= 30000ms` whenever queried. Additionally, I injected a custom `clock` dependency into `DeviceFleetService`, allowing unit tests to deterministically verify the exact `30.0s` vs `30.1s` boundary without using `setTimeout`.
- **Personally Verified Before Submitting**:
  - Manually executed all 19 Jest and Supertest automated tests, verifying 100% pass rate.
  - Started the Node.js server, ran the multi-device simulator with 5 devices, stopped `device-03`, and verified using both terminal requests and the Web UI that `device-03` remained `ONLINE` until second 30 and transitioned to `OFFLINE` on second 31.
