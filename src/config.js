export const config = {
  appName: "Mini Device Fleet Monitor",
  appVersion: "1.0.0",
  heartbeatTimeoutSeconds: parseFloat(process.env.HEARTBEAT_TIMEOUT_SECONDS || "30.0"),
  port: parseInt(process.env.PORT || "8000", 10),
  host: process.env.HOST || "0.0.0.0",
};
