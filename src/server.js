import { app } from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.port, config.host, () => {
  console.log(`======================================================`);
  console.log(`  ${config.appName} v${config.appVersion}`);
  console.log(`  Running on http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}`);
  console.log(`  Heartbeat Timeout Threshold: ${config.heartbeatTimeoutSeconds} seconds`);
  console.log(`======================================================`);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
