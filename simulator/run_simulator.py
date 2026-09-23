#!/usr/bin/env python3
"""
Device Fleet Simulator
Simulates multiple hardware devices sending heartbeats to the Mini Device Fleet Monitor API.
Allows pausing/stopping individual devices to observe the 30-second OFFLINE transition.
"""

import argparse
from datetime import datetime, timezone
import random
import sys
import threading
import time
from typing import Dict, List, Optional

import requests


class SimulatedDevice:
    """Represents a simulated IoT/hardware device sending periodic heartbeats."""

    def __init__(self, device_id: str, name: str, base_url: str, interval: float = 5.0):
        self.device_id = device_id
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.interval = interval
        self.is_running = True
        self.heartbeat_count = 0
        self.battery_level = round(random.uniform(85.0, 100.0), 1)

    def register(self) -> bool:
        """Registers the device with the monitor API."""
        url = f"{self.base_url}/devices"
        payload = {"id": self.device_id, "name": self.name}
        try:
            resp = requests.post(url, json=payload, timeout=5)
            if resp.status_code == 201:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [REGISTERED] {self.device_id} ({self.name})")
                return True
            elif resp.status_code == 409:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [ALREADY REGISTERED] {self.device_id}")
                return True
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [REGISTER ERROR] {self.device_id}: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [CONNECTION FAILED] Could not reach server at {self.base_url}: {e}")
            return False

    def send_heartbeat(self) -> bool:
        """Sends a single heartbeat to the monitor API."""
        url = f"{self.base_url}/devices/{self.device_id}/heartbeat"
        # Simulate realistic sensor telemetry
        self.battery_level = max(5.0, round(self.battery_level - random.uniform(0.01, 0.05), 1))
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "OK",
            "cpu_usage": round(random.uniform(10.0, 65.0), 1),
            "memory_usage": round(random.uniform(25.0, 75.0), 1),
            "signal_strength": round(random.uniform(-85.0, -50.0), 1),
            "battery_level": self.battery_level,
        }
        try:
            resp = requests.post(url, json=payload, timeout=5)
            if resp.status_code == 200:
                self.heartbeat_count += 1
                data = resp.json()
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] [HEARTBEAT #{self.heartbeat_count}] "
                    f"{self.device_id} -> HTTP 200 (Status: {data.get('device_status')}, "
                    f"CPU: {payload['cpu_usage']}%, Signal: {payload['signal_strength']} dBm)"
                )
                return True
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [HEARTBEAT FAILED] {self.device_id}: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [HEARTBEAT ERROR] {self.device_id}: {e}")
            return False

    def run_loop(self, stop_event: threading.Event):
        """Continuous heartbeat transmission loop."""
        while not stop_event.is_set():
            if self.is_running:
                self.send_heartbeat()
            # Sleep in short increments for responsive shutdown
            slept = 0.0
            while slept < self.interval and not stop_event.is_set():
                time.sleep(0.5)
                slept += 0.5


class FleetSimulator:
    """Manages the lifecycle of multiple simulated devices."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000",
        num_devices: int = 5,
        interval: float = 5.0,
        stop_device: Optional[str] = None,
        stop_after_seconds: Optional[float] = None,
    ):
        self.base_url = base_url
        self.num_devices = num_devices
        self.interval = interval
        self.stop_device_id = stop_device
        self.stop_after_seconds = stop_after_seconds
        self.devices: Dict[str, SimulatedDevice] = {}
        self.threads: List[threading.Thread] = []
        self.stop_event = threading.Event()

    def setup(self):
        """Initializes and registers simulated devices."""
        print(f"=== Initializing Fleet Simulator ({self.num_devices} devices, target: {self.base_url}) ===")
        for i in range(1, self.num_devices + 1):
            dev_id = f"device-{i:02d}"
            dev_name = f"Simulated Sensor Device {i:02d}"
            dev = SimulatedDevice(
                device_id=dev_id,
                name=dev_name,
                base_url=self.base_url,
                interval=self.interval,
            )
            self.devices[dev_id] = dev
            dev.register()

    def print_summary(self):
        """Fetches and displays current fleet summary from server."""
        try:
            resp = requests.get(f"{self.base_url}/summary", timeout=5)
            if resp.status_code == 200:
                summary = resp.json()
                print(
                    f"\n>>> [SERVER FLEET SUMMARY] Total: {summary.get('total')} | "
                    f"ONLINE: {summary.get('online')} | OFFLINE: {summary.get('offline')} <<<\n"
                )
        except Exception as e:
            print(f">>> Failed to query fleet summary: {e}")

    def start(self):
        """Starts all device simulation threads."""
        self.setup()
        print(f"\nStarting heartbeat transmission (every {self.interval}s)...")
        print("Commands available in interactive mode:")
        print("  stop <device-id>    - Stops sending heartbeats for a device (simulating fault)")
        print("  resume <device-id>  - Resumes heartbeats for a device")
        print("  summary             - Queries and prints the server fleet status")
        print("  quit                - Stops the simulator")
        print("-" * 65)

        for dev in self.devices.values():
            t = threading.Thread(target=dev.run_loop, args=(self.stop_event,), daemon=True)
            self.threads.append(t)
            t.start()

        # Handle programmed fault injection if requested via CLI flags
        if self.stop_device_id and self.stop_after_seconds:
            def fault_timer():
                time.sleep(self.stop_after_seconds)
                if self.stop_device_id in self.devices:
                    self.devices[self.stop_device_id].is_running = False
                    print(
                        f"\n[! FAULT INJECTED !] Stopped heartbeats for '{self.stop_device_id}'. "
                        f"Watch it transition to OFFLINE after 30 seconds!\n"
                    )
            threading.Thread(target=fault_timer, daemon=True).start()

    def stop_device(self, device_id: str):
        if device_id in self.devices:
            self.devices[device_id].is_running = False
            print(f"[ACTION] Stopped heartbeats for '{device_id}'. It should turn OFFLINE in 30 seconds.")
        else:
            print(f"[ERROR] Device '{device_id}' not found. Available: {list(self.devices.keys())}")

    def resume_device(self, device_id: str):
        if device_id in self.devices:
            self.devices[device_id].is_running = True
            print(f"[ACTION] Resumed heartbeats for '{device_id}'.")
        else:
            print(f"[ERROR] Device '{device_id}' not found.")

    def run_interactive(self):
        """Runs the simulator and reads evaluator commands from stdin."""
        self.start()
        try:
            while not self.stop_event.is_set():
                # Print periodic summary every 15 seconds in background
                # Read line without blocking indefinitely
                line = sys.stdin.readline()
                if not line:
                    break
                cmd = line.strip().split()
                if not cmd:
                    continue
                action = cmd[0].lower()
                if action == "quit" or action == "exit":
                    break
                elif action == "stop" and len(cmd) > 1:
                    self.stop_device(cmd[1])
                elif action == "resume" and len(cmd) > 1:
                    self.resume_device(cmd[1])
                elif action == "summary":
                    self.print_summary()
                else:
                    print(f"Unknown command '{cmd}'. Available: stop <id>, resume <id>, summary, quit")
        except KeyboardInterrupt:
            print("\nShutting down simulator gracefully...")
        finally:
            self.stop_event.set()
            for t in self.threads:
                t.join(timeout=1.0)
            print("Simulator stopped.")


def main():
    parser = argparse.ArgumentParser(description="Mini Device Fleet Simulator")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base URL of Fleet Monitor API")
    parser.add_argument("--devices", type=int, default=5, help="Number of simulated devices (min: 5)")
    parser.add_argument("--interval", type=float, default=5.0, help="Heartbeat interval in seconds (default: 5)")
    parser.add_argument("--stop-device", type=str, default=None, help="Device ID to automatically stop (e.g. device-03)")
    parser.add_argument("--stop-after", type=float, default=None, help="Seconds after which to stop the specified device")
    args = parser.parse_args()

    simulator = FleetSimulator(
        base_url=args.url,
        num_devices=max(5, args.devices),
        interval=args.interval,
        stop_device=args.stop_device,
        stop_after_seconds=args.stop_after,
    )
    simulator.run_interactive()


if __name__ == "__main__":
    main()
