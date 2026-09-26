const express = require("express");
const cors = require("cors");
const client = require("prom-client");

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------
// Prometheus instrumentation
// ---------------------------------------------------------------
const register = new client.Registry();
register.setDefaultLabels({ service: "healthpulse-backend" });

// Node process metrics: heap, event loop lag, GC, open handles
client.collectDefaultMetrics({ register });

// Counter -> feeds the AVAILABILITY SLI
const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register]
});

// Histogram -> feeds the LATENCY SLI.
// The 0.3 bucket exists on purpose: our SLO is "served under 300ms".
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
  registers: [register]
});

// Middleware records every request on the way out.
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    // Use the ROUTE PATTERN, never req.path. /api/users/:id stays one
    // label value instead of one per user id -> avoids cardinality blowup.
    const route = req.route ? req.route.path : "unmatched";
    const labels = {
      method: req.method,
      route: route,
      status_code: res.statusCode
    };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ---------------------------------------------------------------
// Application
// ---------------------------------------------------------------
const appointments = [
  { id: 1, patient: "John Doe",   doctor: "Dr. Smith", date: "2026-05-12", time: "10:00 AM" },
  { id: 2, patient: "Jane Wilson", doctor: "Dr. Adams", date: "2026-05-13", time: "02:30 PM" },
  { id: 3, patient: "Van Dame",   doctor: "Dr. Kay",   date: "2026-05-14", time: "02:30 PM" },
  { id: 4, patient: "Jet Li",     doctor: "Dr. Kay",   date: "2026-05-15", time: "02:30 PM" }
];

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "healthy", service: "healthpulse-backend" });
});

app.get("/api/appointments", (req, res) => {
  res.json(appointments);
});

// ---------------------------------------------------------------
// Fault-injection endpoints for SLO / burn-rate testing.
// In production these sit behind a feature flag or are excluded from
// the prod build entirely.
// ---------------------------------------------------------------
app.get("/api/error", (req, res) => {
  res.status(500).json({ error: "injected failure" });
});

app.get("/api/slow", (req, res) => {
  const ms = Math.min(parseInt(req.query.ms, 10) || 800, 5000);
  setTimeout(() => res.json({ delayed_ms: ms }), ms);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HealthPulse backend running on port ${PORT}`);
  });
}

module.exports = app;
