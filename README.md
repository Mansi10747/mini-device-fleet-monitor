# Mini Device Fleet Monitor

A small Node.js application for monitoring a fleet of simulated devices through periodic heartbeats.

This project was developed for the **Simnovus Campus Hiring Round 2**. The system registers devices, receives heartbeats and telemetry, dynamically determines whether devices are `ONLINE` or `OFFLINE` using a 30-second timeout, exposes REST APIs, provides a browser dashboard, and includes a Node.js device simulator for demonstrating failure and recovery.

> **Implementation note:** The canonical implementation for this submission is **Node.js + Express**. The commands, architecture, tests, and simulator documented below refer to the Node.js implementation.

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Assignment Requirements Coverage](#2-assignment-requirements-coverage)
- [3. Features](#3-features)
- [4. Technology Stack](#4-technology-stack)
- [5. Architecture](#5-architecture)
- [6. Project Structure](#6-project-structure)
- [7. Device Lifecycle](#7-device-lifecycle)
- [8. Online and Offline Logic](#8-online-and-offline-logic)
- [9. REST API](#9-rest-api)
  - [9.1 Health Check](#91-health-check)
  - [9.2 Register a Device](#92-register-a-device)
  - [9.3 Send a Heartbeat](#93-send-a-heartbeat)
  - [9.4 List Devices](#94-list-devices)
  - [9.5 Get Device Details](#95-get-device-details)
  - [9.6 Fleet Summary](#96-fleet-summary)
- [10. HTTP Status Codes and Error Handling](#10-http-status-codes-and-error-handling)
- [11. Web Dashboard](#11-web-dashboard)
- [12. Device Simulator](#12-device-simulator)
- [13. Testing](#13-testing)
- [14. Installation and Setup](#14-installation-and-setup)
- [15. Running the Application](#15-running-the-application)
- [16. Running the Simulator](#16-running-the-simulator)
- [17. Demonstrating the 30-Second Timeout](#17-demonstrating-the-30-second-timeout)
- [18. API Examples](#18-api-examples)
- [19. Configuration](#19-configuration)
- [20. Docker](#20-docker)
- [21. Design Decisions](#21-design-decisions)
- [22. Assumptions](#22-assumptions)
- [23. Known Limitations](#23-known-limitations)
- [24. Optional Improvements](#24-optional-improvements)
- [25. AI Usage](#25-ai-usage)
- [26. Git and Commit History](#26-git-and-commit-history)
- [27. Troubleshooting](#27-troubleshooting)
- [28. Submission Checklist](#28-submission-checklist)

---

# 1. Project Overview

The **Mini Device Fleet Monitor** is a lightweight monitoring service for a simulated fleet of devices.

Each registered device periodically sends a heartbeat to the server. The server stores the most recent heartbeat and associated telemetry for every device.

The key monitoring rule is:

- A device is **`ONLINE`** when its most recent heartbeat is within the last **30 seconds**.
- A device is **`OFFLINE`** when no heartbeat has ever been received or the most recent heartbeat is older than **30 seconds**.

The status is calculated when the application is queried rather than being maintained by a separate periodic status-update job.

The application consists of:

1. A Node.js/Express REST API.
2. An in-memory device repository.
3. A domain/service layer containing the monitoring logic.
4. A browser-based fleet dashboard.
5. A Node.js simulator that represents at least five devices.
6. Automated unit and API integration tests.
7. Optional Docker support.

---

# 2. Assignment Requirements Coverage

The project requirements are implemented as follows:

| Requirement | Implementation |
|---|---|
| Register a device | `POST /devices` |
| Receive heartbeat | `POST /devices/:id/heartbeat` |
| List devices | `GET /devices` |
| Get device details | `GET /devices/:id` |
| Fleet summary | `GET /summary` |
| 30-second timeout | Dynamic status calculation in `src/service.js` |
| At least 5 simulated devices | `simulator/simulator.js` |
| Stop a device and observe `OFFLINE` | Simulator `stop <device-id>` command |
| Automated tests | Jest + Supertest |
| Registration tests | `tests/service.test.js`, `tests/api.test.js` |
| Heartbeat tests | `tests/service.test.js`, `tests/api.test.js` |
| Status tests | `tests/service.test.js`, `tests/api.test.js` |
| Exact timeout behavior | Mock-clock test at 30.0s and 30.1s |
| README documentation | This file |
| Meaningful Git history | Git repository history |
| AI usage disclosure | [AI Usage](#25-ai-usage) |

The assignment explicitly prioritizes a small, working, well-tested implementation over unnecessary complexity. This project therefore uses an in-memory repository and avoids introducing a database or other infrastructure that is not required for the core exercise.

---

# 3. Features

## Core functionality

- Device registration with unique IDs.
- Input validation for device ID and name.
- Duplicate-device detection.
- Heartbeat ingestion.
- Optional telemetry ingestion.
- Dynamic `ONLINE` / `OFFLINE` status.
- Fleet-wide status summary.
- Individual device details.
- Device filtering by status.
- Device heartbeat count.
- Latest telemetry information.
- Bounded heartbeat history in memory.
- Health-check endpoint.
- Centralized HTTP error handling.

## Simulator

- Simulates five or more devices.
- Sends heartbeats every five seconds by default.
- Generates changing telemetry values.
- Supports interactive device failure simulation.
- Supports device recovery.
- Supports automated fault injection from command-line arguments.

## Dashboard

The browser dashboard provides:

- Total device count.
- Online device count.
- Offline device count.
- All/Online/Offline filtering.
- Device search.
- Last-heartbeat display.
- Timeout countdown.
- Manual heartbeat/pulse action.
- Clickable device IDs for detailed device information.
- Telemetry display.
- Automatic refresh.

---

# 4. Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| Express.js | REST API and static-file server |
| JavaScript ES Modules | Application code |
| `cors` | CORS middleware |
| Jest | Automated testing |
| Supertest | HTTP API integration testing |
| Native `fetch` | Simulator HTTP requests |
| HTML/CSS/JavaScript | Dashboard |
| Docker | Optional containerized execution |

## Runtime requirement

The application requires:

- **Node.js 18 or newer**
- npm compatible with the installed Node.js version

Node.js 18+ is used because the simulator relies on the built-in `fetch` API.

---

# 5. Architecture

The application is divided into simple layers so that HTTP handling, business logic, and storage are not tightly coupled.

```text
                         ┌──────────────────────┐
                         │  Simulated Devices   │
                         │  simulator.js        │
                         └──────────┬───────────┘
                                    │
                                    │ POST heartbeat
                                    ▼
┌─────────────────────────────────────────────────────────┐
│                    Express Application                  │
│                       src/app.js                        │
│                                                         │
│  POST /devices                                          │
│  POST /devices/:id/heartbeat                            │
│  GET  /devices                                          │
│  GET  /devices/:id                                      │
│  GET  /summary                                          │
│  GET  /health                                           │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ DeviceFleetService   │
                │    src/service.js    │
                │                      │
                │ - validation         │
                │ - heartbeat logic    │
                │ - status calculation │
                │ - summary            │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │   DeviceStorage      │
                │   src/storage.js     │
                │                      │
                │ JavaScript Map       │
                │ In-memory repository │
                └──────────────────────┘

                           ▲
                           │ GET /devices
                           │ GET /summary
                           │ GET /devices/:id
                           │
                ┌──────────────────────┐
                │   Web Dashboard      │
                │ src/public/index.html│
                └──────────────────────┘
```

## 5.1 Application layers

### `src/config.js`

Centralizes configuration:

- Application name.
- Application version.
- HTTP port.
- Host.
- Heartbeat timeout.

### `src/app.js`

Responsible for:

- Creating the Express application.
- JSON parsing.
- CORS.
- Serving the dashboard.
- Defining REST endpoints.
- Translating domain errors into HTTP responses.

### `src/server.js`

Responsible for:

- Starting the HTTP server.
- Printing startup information.
- Handling `SIGINT`.
- Handling `SIGTERM`.
- Gracefully closing the HTTP server.

### `src/service.js`

Contains the core monitoring behavior:

- Device validation.
- Registration.
- Duplicate detection.
- Heartbeat handling.
- Status calculation.
- Device listing.
- Device detail retrieval.
- Fleet summary.

### `src/storage.js`

Provides the in-memory repository.

A JavaScript `Map` is used for efficient device lookup by ID.

Each device record contains information such as:

```text
id
name
registered_at
last_heartbeat
heartbeat_count
latest_telemetry
heartbeat_history
```

Telemetry history is limited to 50 entries per device.

---

# 6. Project Structure

```text
heartbeat simnovus/
│
├── README.md
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── test_smoke.js
│
├── assets/
│   ├── dashboard.png
│   
├── src/
│   ├── app.js
│   ├── config.js
│   ├── server.js
│   ├── service.js
│   ├── storage.js
│   │
│   └── public/
│       └── index.html
│
├── simulator/
│   └── simulator.js
│
└── tests/
    ├── api.test.js
    └── service.test.js
```

### Important note about the current archive

The working archive also contains some older Python-related files. They are **not used by the Node.js package scripts, server, simulator, or Jest tests documented here**.

For the final hiring submission, it is recommended to remove unused Python files so that the repository communicates one clear implementation choice: **Node.js**.

---

# 7. Device Lifecycle

A device moves through the following logical lifecycle:

```text
             POST /devices
                   │
                   ▼
          ┌─────────────────┐
          │    REGISTERED   │
          │    OFFLINE      │
          └────────┬────────┘
                   │
                   │ heartbeat
                   ▼
          ┌─────────────────┐
          │     ONLINE      │
          └────────┬────────┘
                   │
             no heartbeat
                > 30s
                   │
                   ▼
          ┌─────────────────┐
          │     OFFLINE     │
          └────────┬────────┘
                   │
             new heartbeat
                   │
                   ▼
          ┌─────────────────┐
          │     ONLINE      │
          └─────────────────┘
```

A newly registered device is `OFFLINE` because it has not yet demonstrated that it is communicating with the monitoring service.

---

# 8. Online and Offline Logic

The timeout is configured as **30 seconds by default**.

The service evaluates the most recent heartbeat:

```text
elapsed = current_time - last_heartbeat
```

Then:

```text
if no heartbeat:
    OFFLINE

if elapsed <= 30 seconds:
    ONLINE

if elapsed > 30 seconds:
    OFFLINE
```

The implementation treats the exact 30-second boundary as `ONLINE`.

Therefore:

```text
0.0 seconds  → ONLINE
15.0 seconds → ONLINE
30.0 seconds → ONLINE
30.1 seconds → OFFLINE
60.0 seconds → OFFLINE
```

When another heartbeat is received, the device immediately becomes `ONLINE` again.

## Why status is calculated dynamically

The project does not maintain a separate `is_online` flag using a background timer.

Instead, the status is derived from the latest heartbeat whenever data is requested.

This has several advantages:

- No background status-sweeper is required.
- No stale status flag needs to be synchronized.
- The timeout boundary can be tested deterministically.
- CPU work is performed when status information is actually requested.
- The dashboard always receives status based on the current time.

The service accepts an injectable clock, which allows the automated tests to simulate 15 seconds, 30 seconds, and 30.1 seconds without actually waiting in real time.

---

# 9. REST API

Base URL when running locally:

```text
http://127.0.0.1:8000
```

All API payloads use JSON.

---

## 9.1 Health Check

### Request

```http
GET /health
```

### Example

```bash
curl http://127.0.0.1:8000/health
```

### Response

```json
{
  "status": "healthy",
  "service": "Mini Device Fleet Monitor",
  "version": "1.0.0",
  "timeout_seconds": 30,
  "timestamp": "2026-09-24T10:30:00.000Z"
}
```

This endpoint is useful for checking whether the server is running and exposing the active timeout configuration.

---

## 9.2 Register a Device

### Endpoint

```http
POST /devices
```

### Request body

```json
{
  "id": "device-01",
  "name": "Lab Device 01"
}
```

### Example

```bash
curl -X POST http://127.0.0.1:8000/devices \
  -H "Content-Type: application/json" \
  -d '{"id":"device-01","name":"Lab Device 01"}'
```

### Successful response

HTTP status:

```text
201 Created
```

Example:

```json
{
  "id": "device-01",
  "name": "Lab Device 01",
  "status": "OFFLINE",
  "registered_at": "2026-09-24T10:30:00.000Z",
  "last_heartbeat": null
}
```

A device starts as `OFFLINE` until its first heartbeat is received.

### Validation

The device ID must be a non-empty string.

The device name must be a non-empty string.

Whitespace is trimmed.

### Duplicate ID

Registering the same ID twice returns:

```text
409 Conflict
```

---

# 9.3 Send a Heartbeat

### Endpoint

```http
POST /devices/:id/heartbeat
```

### Request body

The basic heartbeat can contain:

```json
{
  "timestamp": "2026-09-24T10:30:10.000Z",
  "status": "OK"
}
```

Telemetry fields supported by the current implementation include:

```json
{
  "timestamp": "2026-09-24T10:30:10.000Z",
  "status": "OK",
  "cpu_usage": 42.3,
  "memory_usage": 61.2,
  "battery_level": 94.0,
  "signal_strength": -71.0
}
```

### Example

```bash
curl -X POST http://127.0.0.1:8000/devices/device-01/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "status":"OK",
    "cpu_usage":42.3,
    "memory_usage":61.2,
    "battery_level":94,
    "signal_strength":-71
  }'
```

### Successful response

HTTP status:

```text
200 OK
```

Example:

```json
{
  "message": "Heartbeat recorded successfully",
  "device_id": "device-01",
  "received_at": "2026-09-24T10:30:10.000Z",
  "device_status": "ONLINE"
}
```

### Unknown device

Sending a heartbeat for an unregistered device returns:

```text
404 Not Found
```

The device must be registered before it can send a heartbeat.

---

# 9.4 List Devices

### Endpoint

```http
GET /devices
```

### Example

```bash
curl http://127.0.0.1:8000/devices
```

### Response

```json
[
  {
    "id": "device-01",
    "name": "Lab Device 01",
    "status": "ONLINE",
    "last_heartbeat": "2026-09-24T10:30:10.000Z"
  },
  {
    "id": "device-02",
    "name": "Lab Device 02",
    "status": "OFFLINE",
    "last_heartbeat": null
  }
]
```

Devices are sorted by ID for deterministic output.

## Filter by status

The API supports:

```http
GET /devices?status=ONLINE
```

or:

```http
GET /devices?status=OFFLINE
```

Example:

```bash
curl "http://127.0.0.1:8000/devices?status=ONLINE"
```

---

# 9.5 Get Device Details

### Endpoint

```http
GET /devices/:id
```

### Example

```bash
curl http://127.0.0.1:8000/devices/device-01
```

### Response

```json
{
  "id": "device-01",
  "name": "Lab Device 01",
  "status": "ONLINE",
  "registered_at": "2026-09-24T10:30:00.000Z",
  "last_heartbeat": "2026-09-24T10:30:10.000Z",
  "heartbeat_count": 1,
  "latest_telemetry": {
    "status": "OK",
    "cpu_usage": 42.3,
    "memory_usage": 61.2,
    "battery_level": 94,
    "signal_strength": -71
  }
}
```

If the device does not exist:

```text
404 Not Found
```

The dashboard uses this endpoint when the operator opens the device details view.

---

# 9.6 Fleet Summary

### Endpoint

```http
GET /summary
```

### Example

```bash
curl http://127.0.0.1:8000/summary
```

### Response

```json
{
  "total": 5,
  "online": 4,
  "offline": 1
}
```

The counts are calculated from the current status of every registered device.

---

# 10. HTTP Status Codes and Error Handling

The application uses centralized error handling.

| Situation | HTTP status |
|---|---:|
| Successful registration | `201` |
| Successful heartbeat | `200` |
| Successful GET request | `200` |
| Invalid device data | `400` |
| Duplicate device ID | `409` |
| Unknown device | `404` |
| Unexpected server error | `500` |

Example validation error:

```json
{
  "error": "ValidationError",
  "detail": "Device ID must be a non-empty string"
}
```

Example duplicate registration:

```json
{
  "error": "ConflictError",
  "detail": "Device with ID 'device-01' already exists"
}
```

Example unknown device:

```json
{
  "error": "NotFoundError",
  "detail": "Device with ID 'device-99' not found"
}
```

---

# 11. Web Dashboard

The dashboard is served directly by the Express application.

Open:

```text
http://127.0.0.1:8000/
```

The dashboard provides an operator-oriented view of the fleet.

## Main dashboard sections

### Fleet summary

Displays:

- Total devices.
- Online devices.
- Offline devices.

### Device filters

The table can be filtered by:

- All devices.
- Online devices.
- Offline devices.

### Search

Devices can be searched by ID or name.

### Device table

The table displays:

- Device ID.
- Device name.
- Current status.
- Last heartbeat.
- Telemetry/metrics.
- Actions.

### Timeout countdown

For an online device, the dashboard shows the remaining time before the 30-second timeout.

For example:

```text
Timeout in 26s
```

When the device stops sending heartbeats and the timeout is exceeded, the status changes to:

```text
OFFLINE
```

### Device details

The device ID can be selected to view the details returned by:

```http
GET /devices/:id
```

### Manual heartbeat

The `Send Pulse` action allows a heartbeat to be sent manually from the dashboard.

### Automatic synchronization

The dashboard periodically refreshes fleet data so that heartbeat and timeout changes are visible without manually reloading the page.

---

# 12. Device Simulator

The simulator is implemented in:

```text
simulator/simulator.js
```

It uses Node.js native `fetch` to communicate with the monitoring server.

By default it creates five devices:

```text
device-01
device-02
device-03
device-04
device-05
```

Each device sends a heartbeat every five seconds.

The simulator also generates telemetry values such as:

- CPU usage.
- Memory usage.
- Battery level.
- Signal strength.

This provides changing data for the dashboard.

---

# 13. Testing

The project uses:

- **Jest** for the test runner.
- **Supertest** for REST API integration tests.

Run:

```bash
npm test
```

The current Node.js test suite contains:

```text
2 test suites
19 tests
```

The tests were executed against the uploaded project and currently pass:

```text
Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
```

## 13.1 Service/unit tests

`tests/service.test.js` covers:

1. Successful device registration.
2. Duplicate device IDs.
3. Invalid/missing device fields.
4. Heartbeat for an unknown device.
5. Newly registered devices being `OFFLINE`.
6. Exact 30-second timeout behavior.
7. Fleet summary calculation.
8. Device status filtering.

## 13.2 API integration tests

`tests/api.test.js` covers:

1. `POST /devices`.
2. Duplicate registration.
3. Invalid registration.
4. `POST /devices/:id/heartbeat`.
5. Unknown-device heartbeat.
6. `GET /devices`.
7. Online filtering.
8. `GET /devices/:id`.
9. Unknown device details.
10. `GET /summary`.
11. `GET /health`.

## 13.3 Exact timeout test

The test suite uses a mock clock rather than sleeping for 30 real seconds.

The test verifies:

```text
t = 0s     → ONLINE
t = 15s    → ONLINE
t = 30.0s  → ONLINE
t = 30.1s  → OFFLINE
t = 60s    → OFFLINE
new HB     → ONLINE
```

This keeps the tests fast and makes the timeout rule deterministic.

---

# 14. Installation and Setup

## Prerequisites

Install:

- Node.js 18+
- npm

Verify:

```bash
node --version
npm --version
```

Example:

```text
v22.x.x
10.x.x
```

## Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd "heartbeat simnovus"
```

## Install dependencies

```bash
npm install
```

For a clean CI-style installation using the lockfile:

```bash
npm ci
```

---

# 15. Running the Application

## Start normally

```bash
npm start
```

The server listens on:

```text
http://127.0.0.1:8000
```

You should see output similar to:

```text
======================================================
  Mini Device Fleet Monitor v1.0.0
  Running on http://127.0.0.1:8000
  Heartbeat Timeout Threshold: 30 seconds
======================================================
```

Open the dashboard in a browser:

```text
http://127.0.0.1:8000/
```

## Development mode

```bash
npm run dev
```

This uses Node.js watch mode to restart the server when source files change.

---

# 16. Running the Simulator

Keep the server running and open another terminal.

Run:

```bash
npm run simulator
```

This is equivalent to:

```bash
node simulator/simulator.js
```

The simulator registers five devices and starts sending heartbeats.

Expected behavior:

```text
All 5 devices are running and sending heartbeats.
```

## Interactive commands

While the simulator is running:

### Stop a device

```text
stop device-03
```

The simulator stops sending heartbeats for that device.

### Resume a device

```text
resume device-03
```

The simulator immediately sends a new heartbeat and resumes periodic heartbeats.

### View summary

```text
summary
```

### Exit

```text
quit
```

---

# 17. Demonstrating the 30-Second Timeout

This is the most important behavior to demonstrate during evaluation.

## Step 1: Start the server

```bash
npm start
```

## Step 2: Open the dashboard

```text
http://127.0.0.1:8000/
```

## Step 3: Start the simulator

In another terminal:

```bash
npm run simulator
```

You should see five devices become `ONLINE`.

## Step 4: Stop one device

In the simulator terminal:

```text
stop device-03
```

The simulator will stop sending heartbeats for `device-03`.

The other devices continue sending heartbeats.

## Step 5: Observe the countdown

The dashboard continues to show `device-03` as `ONLINE` until the most recent heartbeat becomes older than 30 seconds.

After the timeout:

```text
device-03 → OFFLINE
```

The fleet summary should change from:

```json
{
  "total": 5,
  "online": 5,
  "offline": 0
}
```

to:

```json
{
  "total": 5,
  "online": 4,
  "offline": 1
}
```

## Step 6: Recover the device

Run:

```text
resume device-03
```

The simulator sends a heartbeat and the device becomes:

```text
ONLINE
```

again.

---

# 18. API Examples

## Register

```bash
curl -X POST http://127.0.0.1:8000/devices \
  -H "Content-Type: application/json" \
  -d '{"id":"device-01","name":"Lab Device 01"}'
```

## Heartbeat

```bash
curl -X POST http://127.0.0.1:8000/devices/device-01/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "status":"OK",
    "cpu_usage":42.3,
    "memory_usage":61.2,
    "battery_level":94,
    "signal_strength":-71
  }'
```

## List devices

```bash
curl http://127.0.0.1:8000/devices
```

## Online devices only

```bash
curl "http://127.0.0.1:8000/devices?status=ONLINE"
```

## Offline devices only

```bash
curl "http://127.0.0.1:8000/devices?status=OFFLINE"
```

## Device details

```bash
curl http://127.0.0.1:8000/devices/device-01
```

## Fleet summary

```bash
curl http://127.0.0.1:8000/summary
```

## Health

```bash
curl http://127.0.0.1:8000/health
```

---

# 19. Configuration

Configuration is controlled using environment variables.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | HTTP server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `HEARTBEAT_TIMEOUT_SECONDS` | `30.0` | Heartbeat timeout |

## Linux/macOS

```bash
PORT=8080 HEARTBEAT_TIMEOUT_SECONDS=45 npm start
```

## Windows PowerShell

```powershell
$env:PORT="8080"
$env:HEARTBEAT_TIMEOUT_SECONDS="45"
npm start
```

Then the application will use a 45-second timeout.

For the hiring assignment, the default 30-second value should normally be retained.

---

# 20. Docker

Docker support is included as an optional deployment method.

## Build

```bash
docker build -t mini-device-fleet-monitor .
```

## Run

```bash
docker run -p 8000:8000 mini-device-fleet-monitor
```

Open:

```text
http://127.0.0.1:8000/
```

## Docker Compose

```bash
docker-compose up --build
```

The Compose configuration exposes:

```text
8000:8000
```

and sets:

```text
PORT=8000
HOST=0.0.0.0
HEARTBEAT_TIMEOUT_SECONDS=30.0
```

---

# 21. Design Decisions

## 21.1 In-memory storage

The project uses a JavaScript `Map` rather than a database.

Reasons:

- The assignment is time-limited.
- The required behavior does not require persistence.
- Device lookup is simple and fast.
- There is no external database setup for the evaluator.
- The implementation remains easy to understand.

The trade-off is that all data is lost when the process stops.

## 21.2 Dynamic status calculation

The application calculates status from the latest heartbeat rather than maintaining a mutable online/offline flag.

This prevents the stored status from becoming stale.

## 21.3 Injectable clock

The service accepts a clock function:

```javascript
() => new Date()
```

Tests can replace this with a controlled clock.

This makes timeout testing deterministic.

## 21.4 Bounded telemetry history

The storage layer keeps at most 50 telemetry history records per device.

This prevents unlimited memory growth during long simulator runs.

## 21.5 Separation of concerns

The project separates:

```text
HTTP handling
      ↓
Business logic
      ↓
Storage
```

This makes the service easier to test independently of Express.

---

# 22. Assumptions

1. The application runs as a single Node.js process.
2. Device state is stored in memory.
3. A newly registered device is `OFFLINE` until it sends a heartbeat.
4. The 30-second boundary is inclusive:
   - exactly 30 seconds → `ONLINE`
   - greater than 30 seconds → `OFFLINE`
5. Device IDs are unique.
6. Device IDs and names must be non-empty strings.
7. The simulator communicates with the API over HTTP.
8. The default simulator heartbeat interval is five seconds.
9. Telemetry fields are optional.
10. The current deployment does not require authentication because authentication is outside the scope of the exercise.
11. The current implementation uses an in-memory repository, so persistence across server restarts is not expected.
12. The Node.js implementation is the submission implementation; unused legacy Python files are not part of the documented execution path.

---

# 23. Known Limitations

## In-memory data

Restarting the server clears:

- Registered devices.
- Heartbeat timestamps.
- Telemetry.
- Heartbeat history.

## Single-process storage

Multiple server instances would not share the same device state.

A distributed deployment would require shared storage such as Redis or a database.

## No authentication

Any client that can access the server can call the device APIs.

Authentication was not required by the assignment.

## Polling dashboard

The dashboard periodically requests current state instead of receiving push events over WebSockets/SSE.

## Bounded telemetry history

Only the latest 50 telemetry entries per device are retained.

This is intentional to keep memory usage bounded.

---

# 24. Optional Improvements

If additional development time were available, the following could be added.

## 24.1 Persistent storage

Use SQLite/PostgreSQL or another persistent database to preserve devices and telemetry across restarts.

## 24.2 Real-time push updates

Replace dashboard polling with WebSockets or Server-Sent Events.

## 24.3 Authentication

Add API keys or bearer-token authentication so only authorized devices/operators can access the service.

## 24.4 Alerts

Notify an operator when a device changes from `ONLINE` to `OFFLINE`.

Possible integrations include:

- Email.
- Slack.
- Webhooks.
- Pager/incident-management systems.

## 24.5 Historical telemetry charts

Display CPU, memory, battery, and signal trends for an individual device.

## 24.6 Structured logging

Add structured JSON logs with:

- Timestamp.
- Request ID.
- Device ID.
- Endpoint.
- Status code.
- Error information.

## 24.7 Container and deployment improvements

Add:

- Production health checks.
- Resource limits.
- CI/CD.
- Container image scanning.
- Deployment configuration.

These are intentionally not required for the core three-hour exercise.

---

# 25. AI Usage

AI tools were used during development, in accordance with the assignment's AI policy.

## AI tools used

- Google Gemini via the Antigravity AI coding assistant.
- ChatGPT for development assistance and review.

## What AI was used for

AI assistance was used for:

- Project structure and initial scaffolding.
- Express.js API implementation.
- Jest/Supertest test structure.
- Simulator logic.
- Telemetry generation.
- Dashboard HTML/CSS/JavaScript.
- Documentation and code review.

## Example of an AI-generated approach that was improved

An initial approach considered maintaining an explicit online/offline flag and periodically scanning all devices with a background timer.

The implementation was instead structured around dynamic status calculation:

```text
current time - last heartbeat <= timeout
```

This avoids maintaining a second piece of state that could become stale and makes the timeout boundary easier to test.

A controllable clock was also introduced into the service so the tests can verify:

```text
30.0 seconds → ONLINE
30.1 seconds → OFFLINE
```

without waiting 30 seconds in real time.

## Verification

The Node.js automated test suite was executed against the project and the current result is:

```text
2 test suites passed
19 tests passed
0 tests failed
```

The implementation should still be reviewed and understood by the candidate before submission, especially the timeout logic, simulator behavior, API responses, and test cases.

---

# 26. Git and Commit History

The assignment evaluates Git usage as part of the engineering process.

Meaningful commits should describe logical stages of development.

Recommended commit sequence:

```text
Initial Node.js project setup
Implement device registration API
Implement heartbeat ingestion
Implement 30-second status calculation
Add device listing and summary APIs
Add device detail endpoint
Add simulator
Add automated tests
Add dashboard
Improve error handling
Add Docker support
Complete README documentation
```

Avoid using a single vague commit such as:

```text
final project
```

for the entire implementation.

A reviewer should be able to understand how the project evolved.

---

# 27. Troubleshooting

## Server does not start

Check Node.js:

```bash
node --version
```

Then reinstall dependencies:

```bash
npm ci
```

Try:

```bash
npm start
```

## Port 8000 is already in use

Change the port:

### PowerShell

```powershell
$env:PORT="8080"
npm start
```

### Linux/macOS

```bash
PORT=8080 npm start
```

Then open:

```text
http://127.0.0.1:8080/
```

## Simulator cannot connect

Make sure the server is running first:

```bash
npm start
```

Then, in another terminal:

```bash
npm run simulator
```

## Device remains offline

Check that:

1. The device was registered.
2. The simulator is running.
3. Heartbeat requests return HTTP 200.
4. The device ID matches the registered ID.
5. The server is running on the same URL configured by the simulator.

## Tests fail after modifying code

Run:

```bash
npm test
```

Run the live smoke test only after starting the server:

```bash
npm start
```

In another terminal:

```bash
npm run smoke
```

The smoke test registers five devices, sends heartbeats to four, and verifies the expected summary.

---

# 28. Submission Checklist

Before submitting the repository, verify every item below.

## Application

- [ ] `npm install` / `npm ci` works.
- [ ] `npm start` starts the server.
- [ ] Dashboard opens at `/`.
- [ ] `POST /devices` works.
- [ ] `POST /devices/:id/heartbeat` works.
- [ ] `GET /devices` works.
- [ ] `GET /devices/:id` works.
- [ ] `GET /summary` works.
- [ ] `GET /health` works.
- [ ] Unknown devices return `404`.
- [ ] Duplicate IDs return `409`.
- [ ] Invalid registration data returns `400`.

## Timeout behavior

- [ ] Newly registered devices are `OFFLINE`.
- [ ] Heartbeat makes a device `ONLINE`.
- [ ] Device remains `ONLINE` at exactly 30 seconds.
- [ ] Device becomes `OFFLINE` after 30 seconds.
- [ ] A new heartbeat brings it back `ONLINE`.

## Simulator

- [ ] At least five devices are simulated.
- [ ] Heartbeats are sent periodically.
- [ ] `stop <id>` works.
- [ ] Stopped device becomes `OFFLINE` after the timeout.
- [ ] `resume <id>` brings the device back `ONLINE`.
- [ ] `summary` works.
- [ ] `quit` shuts down the simulator.

## Tests

Run:

```bash
npm test
```

Expected current result:

```text
2 test suites passed
19 tests passed
```

## Documentation

- [ ] README explains the project.
- [ ] Architecture is documented.
- [ ] Prerequisites are documented.
- [ ] Build/install instructions are documented.
- [ ] Server run instructions are documented.
- [ ] Simulator instructions are documented.
- [ ] Test instructions are documented.
- [ ] API examples are included.
- [ ] Assumptions are documented.
- [ ] Known limitations are documented.
- [ ] Future improvements are documented.
- [ ] AI usage is disclosed.

## Repository

- [ ] `.gitignore` is present.
- [ ] `node_modules` is not committed.
- [ ] `.env`/secrets are not committed.
- [ ] Git history contains meaningful commits.
- [ ] Repository URL is ready for submission.
- [ ] Final committed version is the version being submitted.

---

## Final Architecture Summary

The project intentionally keeps the implementation small:

```text
                    ┌─────────────────────┐
                    │  Simulated Devices  │
                    │  5+ devices / 5 sec │
                    └──────────┬──────────┘
                               │
                               │ Heartbeats
                               ▼
                    ┌─────────────────────┐
                    │   Express REST API  │
                    │      src/app.js     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ DeviceFleetService  │
                    │    src/service.js   │
                    │                     │
                    │ Validation          │
                    │ Heartbeat handling  │
                    │ Status calculation  │
                    │ Fleet summary       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   DeviceStorage     │
                    │    src/storage.js   │
                    │     Map / RAM       │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
             REST API clients       Web Dashboard
             curl / Postman         Browser UI
```


