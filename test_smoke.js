async function run() {
  console.log("--- 1. Testing Registration ---");
  for (let i = 1; i <= 5; i++) {
    const id = `device-${String(i).padStart(2, "0")}`;
    const res = await fetch("http://127.0.0.1:8000/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: `Node Sensor ${i}` })
    });
    console.log(`Registered ${id}: HTTP ${res.status}`);
  }

  console.log("\n--- 2. Sending Heartbeats to 4 of 5 devices ---");
  for (let i = 1; i <= 4; i++) {
    const id = `device-${String(i).padStart(2, "0")}`;
    const res = await fetch(`http://127.0.0.1:8000/devices/${id}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "OK", cpu_usage: 32.5, battery_level: 96 })
    });
    const data = await res.json();
    console.log(`Heartbeat ${id}: HTTP ${res.status}, device_status=${data.device_status}`);
  }

  console.log("\n--- 3. Checking Fleet Summary ---");
  const sRes = await fetch("http://127.0.0.1:8000/summary");
  const s = await sRes.json();
  console.log("Fleet Summary:", s);

  if (s.total !== 5 || s.online !== 4 || s.offline !== 1) {
    throw new Error(`Summary mismatch! Got ${JSON.stringify(s)}`);
  }

  console.log("\n--- 4. Checking List of Devices ---");
  const listRes = await fetch("http://127.0.0.1:8000/devices");
  const list = await listRes.json();
  for (const d of list) {
    console.log(`  ${d.id}: ${d.status} | Last Heartbeat: ${d.last_heartbeat}`);
  }

  console.log("\n[SUCCESS] All live Node.js end-to-end checks PASSED!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
