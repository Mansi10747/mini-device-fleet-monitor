# Mini Device Fleet Monitor

A small FastAPI application that registers simulated devices, accepts periodic heartbeats, and reports each device as **ONLINE** or **OFFLINE** based on a 30-second heartbeat timeout.

Built for Simnovus Campus Hiring Round 2.

---

## What this project does

- Registers devices via `POST /devices`
- Accepts heartbeats via `POST /devices/{id}/heartbeat`
- Lists devices and returns computed ONLINE/OFFLINE status
- Returns details for a single device
- Provides a fleet summary (`total` / `online` / `offline`)
- Includes a 5-device simulator and automated tests

---

## Design / architecture

```text
Client / Simulator
        │
        ▼
   FastAPI (src/main.py)     ← HTTP layer, validation, status codes
        │
        ▼
   DeviceStore (src/store.py) ← thread-safe in-memory registry
        │
        ▼
   Device model              ← last_heartbeat + computed status
```

**Status rule (important):** status is **not stored**. It is computed on every read:

- `ONLINE` if `now - last_heartbeat <= 30s`
- `OFFLINE` otherwise (including devices that never sent a heartbeat)

This keeps the rule consistent across list, detail, and summary endpoints without background jobs.

**Concurrency:** `DeviceStore` uses a `threading.RLock` so concurrent heartbeats from the simulator are safe.

**Storage:** in-memory only (resets when the process restarts). Sufficient for this exercise; persistence is listed under improvements.

---

## Prerequisites

- Python **3.10+**
- `pip`

---

## How to build / install

From the project root:

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

---

## How to run the application

```bash
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

API docs (interactive): http://127.0.0.1:8000/docs  
Health check: http://127.0.0.1:8000/health

Optional: override the timeout with an environment variable:

```bash
# Windows PowerShell
$env:HEARTBEAT_TIMEOUT_SECONDS = "30"
uvicorn src.main:app --reload --port 8000
```

---

## How to run the simulator

In a **second** terminal (with the venv activated and the API already running):

```bash
python simulator/simulate_devices.py
```

This registers `device-01` … `device-05` and sends a heartbeat every **5 seconds**.

### Observe a device going OFFLINE

Stop one device after 20 seconds, then wait ~30 seconds:

```bash
python simulator/simulate_devices.py --stop-device device-03 --stop-after 20
```

Watch the printed fleet snapshots — `device-03` should flip to `OFFLINE` after the timeout while the others stay `ONLINE`.

Useful flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `--base-url` | `http://127.0.0.1:8000` | API location |
| `--interval` | `5` | Seconds between heartbeats |
| `--stop-device` | (none) | Device id to stop |
| `--stop-after` | `20` | Seconds before stopping that device |

---

## How to run the tests

```bash
pytest -v
```

Coverage includes:

- Device registration (success, duplicate conflict, validation)
- Heartbeat handling (update, unknown device, stale heartbeat ignore)
- Device listing / details / summary
- 30-second ONLINE / OFFLINE behaviour

---

## Example API requests

### Register a device

```bash
curl -X POST http://127.0.0.1:8000/devices ^
  -H "Content-Type: application/json" ^
  -d "{\"id\": \"device-01\", \"name\": \"Lab Device 01\"}"
```

### Send a heartbeat

```bash
curl -X POST http://127.0.0.1:8000/devices/device-01/heartbeat ^
  -H "Content-Type: application/json" ^
  -d "{\"timestamp\": \"2026-09-21T10:30:00Z\", \"status\": \"OK\", \"cpu_usage\": 42, \"signal_strength\": -71}"
```

### List devices

```bash
curl http://127.0.0.1:8000/devices
```

Filter by status:

```bash
curl "http://127.0.0.1:8000/devices?status=ONLINE"
```

### Get device details

```bash
curl http://127.0.0.1:8000/devices/device-01
```

### Fleet summary

```bash
curl http://127.0.0.1:8000/summary
```

Example summary response:

```json
{
  "total": 5,
  "online": 4,
  "offline": 1
}
```

---

## Assumptions

1. Device IDs are unique strings provided by the client at registration time.
2. Timestamps without timezone are treated as UTC.
3. A device with **no** heartbeats is `OFFLINE`.
4. Out-of-order (older) heartbeats are accepted (HTTP 200) but do not move `last_heartbeat` backwards.
5. Optional heartbeat fields (`cpu_usage`, `signal_strength`) are stored as metrics when present.
6. The fleet lives in a single process; no multi-instance clustering.

---

## Known limitations

- State is in-memory — restart clears all devices.
- No authentication or rate limiting.
- No durable audit log of historical heartbeats (only the latest is kept).
- Timeout is global (not per-device).

---

## What I would improve with one more day

- Persist devices/heartbeats (SQLite or Postgres)
- Background sweeper + WebSocket/SSE live status feed for operators
- Structured logging and request IDs
- Docker Compose for API + simulator
- Per-device configurable timeout and alerting when a device goes offline
- A minimal operator UI on top of `/devices` and `/summary`

---

## AI Usage

- **Tools used:** Cursor (Composer) as a coding assistant.
- **What AI helped with:** scaffolding the FastAPI project layout, drafting request/response models, writing the first pass of tests and the device simulator, and structuring the README to match the assignment checklist.
- **What I changed / improved:** status is computed from heartbeat age on every read instead of a sticky stored flag (avoids drift and background jobs). Stale/out-of-order heartbeats are ignored for `last_heartbeat` so status cannot jump backwards incorrectly.
- **What I personally verified:** ran `pytest`, started the API with uvicorn, ran the 5-device simulator, and confirmed a stopped device becomes `OFFLINE` after ~30 seconds while others remain `ONLINE`.

---

## Project layout

```text
.
├── README.md
├── requirements.txt
├── pytest.ini
├── src/
│   ├── __init__.py
│   ├── config.py
│   ├── main.py          # FastAPI routes
│   ├── models.py        # Pydantic schemas
│   └── store.py         # Thread-safe in-memory store
├── tests/
│   └── test_api.py
└── simulator/
    └── simulate_devices.py
```
