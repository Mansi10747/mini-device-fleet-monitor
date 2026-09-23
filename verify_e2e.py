import requests
import time

def verify_live():
    print("--- 1. Testing Registration ---")
    for i in range(1, 6):
        dev_id = f"device-{i:02d}"
        r = requests.post("http://127.0.0.1:8000/devices", json={"id": dev_id, "name": f"Lab Sensor {i}"})
        print(f"Registered {dev_id}: {r.status_code}")

    print("\n--- 2. Sending Heartbeats to 4 of 5 devices ---")
    for i in range(1, 5):
        dev_id = f"device-{i:02d}"
        hb = requests.post(
            f"http://127.0.0.1:8000/devices/{dev_id}/heartbeat",
            json={"status": "OK", "cpu_usage": 25.0, "signal_strength": -65.0}
        )
        print(f"Heartbeat {dev_id}: {hb.status_code}, status={hb.json()['device_status']}")

    print("\n--- 3. Checking Fleet Summary ---")
    s = requests.get("http://127.0.0.1:8000/summary").json()
    print("Fleet Summary:", s)
    assert s["total"] == 5, f"Expected 5 total, got {s['total']}"
    assert s["online"] == 4, f"Expected 4 online, got {s['online']}"
    assert s["offline"] == 1, f"Expected 1 offline, got {s['offline']}"

    print("\n--- 4. Checking List of Devices ---")
    devs = requests.get("http://127.0.0.1:8000/devices").json()
    for d in devs:
        print(f"  {d['id']}: {d['status']} | Last Heartbeat: {d['last_heartbeat']}")

    print("\n--- 5. Checking Single Device Detail ---")
    detail = requests.get("http://127.0.0.1:8000/devices/device-01").json()
    print(f"device-01 Details: status={detail['status']}, hb_count={detail['heartbeat_count']}, telemetry={detail['latest_telemetry']}")

    print("\n[SUCCESS] All live end-to-end checks PASSED!")

if __name__ == "__main__":
    verify_live()
