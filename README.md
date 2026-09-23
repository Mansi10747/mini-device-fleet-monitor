# Mini Device Fleet Monitor

A lightweight, high-performance service that monitors a distributed fleet of simulated hardware/IoT devices, ingests periodic heartbeats, dynamically evaluates device health status (`ONLINE` vs `OFFLINE`) based on a 30-second sliding timeout window, and provides fleet-wide observability through REST APIs and a live web dashboard.

---

## 1. What the Project Does

In IoT and distributed hardware deployments, edge devices periodically send "heartbeats" to notify central monitoring systems that they are operational. 

This application:
1. **Registers Devices**: Allows onboarding of edge/lab devices with unique identifiers and human-readable names.
2. **Ingests Heartbeats**: Accepts real-time heartbeats from registered devices containing timestamp, status flags, and telemetry (CPU usage, signal strength, memory usage, battery level).
3. **Automated 30-Second Timeout Status**: Dynamically tracks whether a device is:
   - **`ONLINE`**: A valid heartbeat was received within the last **30 seconds** (`now - last_heartbeat <= 30s`).
   - **`OFFLINE`**: No heartbeat has been received for more than **30 seconds**, or the device has never sent a heartbeat since registration.
4. **Fleet Observability**: Provides instant queries for fleet summary (`total`, `online`, `offline`), filtered listings, and detailed single-device telemetry.
5. **Interactive Device Simulator**: Multi-threaded simulator capable of driving 5+ concurrent devices, with real-time fault simulation to pause any device and watch it transition to `OFFLINE`.
6. **Live Web Dashboard**: Built-in real-time web dashboard running at `http://127.0.0.1:8000/` with live auto-refreshing metrics, device tables, and pulse triggers.

---

## 2. Design & Architecture

The project follows clean architecture principles, separating the HTTP transport layer, business domain logic, and data storage.

```
┌────────────────────────────────────────────────────────┐
│               Simulated Hardware Fleet                 │
│      device-01   device-02   device-03   ...           │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP POST Heartbeats (every 5s)
                            ▼
┌────────────────────────────────────────────────────────┐
│            FastAPI REST Transport & Web UI             │
│   POST /devices                POST /devices/{id}/hb   │
│   GET  /devices                GET  /devices/{id}      │
│   GET  /summary                GET  /                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│           DeviceFleetService (Domain Layer)            │
│  - Enforces 30.0s Sliding Window Rule                  │
│  - Dynamic Status Evaluation                           │
│  - Injectable Clock for Deterministic Boundary Tests   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│            DeviceStorage (Thread-Safe Store)           │
│  - In-Memory Hash Map with threading.RLock()           │
│  - Sub-millisecond Read/Write Performance              │
│  - Bounded Telemetry Ring Buffer                       │
└────────────────────────────────────────────────────────┘
```

### Key Components:
- **`src/models.py`**: Pydantic v2 schemas for strict input validation, type safety, and automatic OpenAPI schema generation.
- **`src/storage.py`**: Thread-safe in-memory repository utilizing re-entrant locks (`threading.RLock`) to ensure concurrency safety under parallel heartbeat ingestion from dozens of devices.
- **`src/service.py`**: Encapsulates business logic. Evaluates device status dynamically on-the-fly rather than relying on background polling jobs, avoiding race conditions and desynchronization.
- **`src/app.py`**: FastAPI application exposing the REST endpoints and serving the live dashboard.
- **`simulator/run_simulator.py`**: Multi-threaded client simulating 5+ hardware devices sending heartbeats every 5 seconds, with support for interactive commands and programmed fault injection.

---

## 3. Prerequisites

- **Python**: Version 3.10, 3.11, or 3.12 (developed and tested on Python 3.12)
- **Pip**: Standard Python package installer
- *(Optional)* **Docker & Docker Compose**: For containerized execution

---

## 4. How to Build the Application

### Option A: Local Virtual Environment (Recommended)

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone <repo-url>
   cd "heartbeat simnovus"
   ```

2. Create and activate a Python virtual environment:
   - **On Windows (PowerShell)**:
     ```powershell
     py -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   - **On macOS / Linux**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Option B: Docker

Build the Docker image:
```bash
docker build -t mini-fleet-monitor .
```

---

## 5. How to Run the Application

### Option A: Local Server
With your virtual environment active, run:
```bash
uvicorn src.app:app --host 127.0.0.1 --port 8000 --reload
```
or simply:
```bash
python -m uvicorn src.app:app --host 127.0.0.1 --port 8000
```

The application will start at:
- **Web Dashboard**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Interactive Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Alternative ReDoc Docs**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

### Option B: Docker Compose
```bash
docker-compose up --build
```

---

## 6. How to Run the Simulator

Open a **separate terminal window** while the application server is running.

### Standard Simulator (5 devices, 5-second interval):
```bash
python simulator/run_simulator.py
```
This automatically registers `device-01` through `device-05` and sends heartbeats every 5 seconds with simulated telemetry (CPU%, battery%, signal strength).

### Interactive Commands in Simulator:
While the simulator is running, type commands into the terminal:
- `stop device-03` : Stops heartbeats for `device-03`. After 30 seconds, watch it turn **OFFLINE** in the dashboard or via `GET /devices`!
- `resume device-03` : Resumes heartbeats for `device-03`, immediately bringing it back **ONLINE**.
- `summary` : Queries the server and prints current fleet status directly in terminal.
- `quit` : Cleanly stops all simulator threads.

### Programmed Fault Injection:
You can also run the simulator with automated fault injection:
```bash
python simulator/run_simulator.py --devices 5 --interval 5 --stop-device device-03 --stop-after 10
```
This stops `device-03` after 10 seconds automatically, allowing you to observe the timeout transition without manual input.

---

## 7. How to Run the Tests

The test suite contains 18 comprehensive tests covering unit logic, 30s boundary conditions, concurrency, and REST API integration.

Run the test suite with pytest:
```bash
pytest -v
```

To run with coverage (if `pytest-cov` installed):
```bash
pytest -v --tb=short
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
  "registered_at": "2026-09-23T18:00:00Z",
  "last_heartbeat": null,
  "heartbeat_count": 0,
  "latest_telemetry": null
}
```

### 2. Send Heartbeat
```http
POST /devices/device-01/heartbeat
Content-Type: application/json

{
  "timestamp": "2026-09-23T18:00:05Z",
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
  "received_at": "2026-09-23T18:00:05Z",
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
    "last_heartbeat": "2026-09-23T18:00:05Z"
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
  "registered_at": "2026-09-23T18:00:00Z",
  "last_heartbeat": "2026-09-23T18:00:05Z",
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

1. **Sliding Window vs Periodic Background Sweep**: Rather than running a background tick loop that flips a boolean flag in memory every second, device status is calculated dynamically on-the-fly upon request. This guarantees that `status` always strictly and accurately reflects the exact state at the microsecond of query.
2. **Clock Source**: Device timestamps are normalized to UTC. If a device omits the timestamp in its heartbeat payload, the server's current UTC time is used.
3. **Storage Persistence**: For the scope of this 3-hour project, an in-memory repository protected by `threading.RLock()` was chosen to maximize ingestion throughput, prevent deadlocks, and eliminate external database setup requirements for evaluators.
4. **Initial Device State**: A newly registered device that has never emitted a heartbeat is classified as `OFFLINE` until its initial heartbeat is received.

---

## 10. Known Limitations

1. **Ephemeral In-Memory Storage**: Server restarts clear device registrations and history.
2. **Horizontal Scaling**: Because storage is in-memory on a single process, running multiple worker processes (`uvicorn --workers 4`) would require a shared data store (such as Redis or SQLite/PostgreSQL) so worker processes share identical device states.
3. **Heartbeat History Capping**: To prevent memory leaks during long-running tests, the in-memory telemetry buffer is capped at the 50 most recent heartbeats per device.

---

## 11. What I Would Improve With One Additional Day

1. **Persistent Storage Layer**: Introduce SQLAlchemy with SQLite for zero-config persistence, or PostgreSQL with TimescaleDB for time-series telemetry storage.
2. **WebSocket & SSE Streams**: Push heartbeat events to connected frontend clients via WebSockets or Server-Sent Events (SSE) instead of client-side interval polling.
3. **Alerting & Webhook Notifications**: Trigger webhook notifications (Slack/PagerDuty/Email) when any critical device transitions from `ONLINE` to `OFFLINE`.
4. **Historical Telemetry Charts**: Add frontend charting (Chart.js / ApexCharts) visualizing CPU, temperature, and battery trends over time for individual devices.
5. **Authentication & Multi-Tenancy**: Add API key authentication or OAuth2 Bearer tokens for secure device registration and heartbeat ingestion.

---

## AI Usage

- **AI Tools Used**: Google Gemini (via Antigravity AI Coding Assistant).
- **What Used For**:
  - Scaffolding the FastAPI application, Pydantic schemas, and pytest test suite.
  - Designing realistic IoT telemetry simulation attributes (battery, signal strength, CPU jitter).
  - Generating the responsive HTML/CSS dashboard for live monitoring.
- **Suggestion Changed / Improved**:
  - The initial generated draft suggested running a background thread every 5 seconds to iterate through all devices and flip a `is_online` boolean in the database.
  - **Improvement made**: I rejected the background polling sweeper approach because it introduces race conditions and up to 5 seconds of status lag. Instead, I architected a pure mathematical evaluation: status is computed dynamically as `(now - last_heartbeat) <= 30.0s` whenever read, ensuring 100% microsecond accuracy. Additionally, I injected a custom `clock` dependency into `DeviceFleetService`, allowing unit tests to deterministically test the exact `30.0s` vs `30.1s` boundary without having to sleep in tests.
- **Personally Verified Before Submitting**:
  - Manually ran all 18 pytest tests verifying 100% pass rate.
  - Spun up the FastAPI server, started the simulator with 5 devices, stopped `device-03`, and verified using both `curl` and the Web UI that `device-03` remained `ONLINE` until second 30 and then transitioned to `OFFLINE` immediately upon second 31.
