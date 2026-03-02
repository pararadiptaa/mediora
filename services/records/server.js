const express = require("express");

// ── Config from environment ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || "records-api";

// ── Helpers ──────────────────────────────────────────────────────────
function log(level, msg, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message: msg,
    ...extra,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Mock medical records database
 * Maps userId to an array of medical records
 */
const mockRecords = {
  user1: [
    {
      id: 1,
      date: "2023-10-24",
      type: "Blood Test (CBC)",
      icon: "bloodtype",
      doctor: "Dr. Sarah Jenkins",
      facility: "Mediora Main Lab",
      status: "Completed",
    },
    {
      id: 2,
      date: "2023-10-10",
      type: "Chest X-Ray",
      icon: "radiology",
      doctor: "Dr. Tirta",
      facility: "Radiology Dept, 2F",
      status: "Completed",
    },
    {
      id: 3,
      date: "2023-09-28",
      type: "Cardiology Consultation",
      icon: "ecg_heart",
      doctor: "Dr. Tirta",
      facility: "Room 304, Main Building",
      status: "Archived",
    },
    {
      id: 4,
      date: "2023-08-15",
      type: "Flu Vaccination",
      icon: "vaccines",
      doctor: "Dr. Emily Williams",
      facility: "General Clinic, 1F",
      status: "Completed",
    },
    {
      id: 5,
      date: "2023-07-03",
      type: "Full Body Check-Up",
      icon: "monitoring",
      doctor: "Dr. Michael Jones",
      facility: "Mediora Main Lab",
      status: "Completed",
    },
    {
      id: 6,
      date: "2023-05-18",
      type: "Dental Cleaning",
      icon: "dentistry",
      doctor: "Dr. Sisca",
      facility: "Dental Wing, Room 105",
      status: "Archived",
    },
  ],
  user2: [
    {
      id: 101,
      date: "2024-02-10",
      type: "Annual Physical",
      icon: "monitoring",
      doctor: "Dr. Smith",
      facility: "Main Building",
      status: "Completed",
    },
    {
      id: 102,
      date: "2024-01-15",
      type: "Lab Work",
      icon: "bloodtype",
      doctor: "Dr. Johnson",
      facility: "Lab, 1F",
      status: "Completed",
    },
  ],
  user3: [
    {
      id: 201,
      date: "2024-03-01",
      type: "Orthopedic Consultation",
      icon: "skeleton",
      doctor: "Dr. Williams",
      facility: "Orthopedic Clinic",
      status: "Completed",
    },
  ],
};

// ── Express setup ────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ── Request logging middleware ───────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    log("info", "request", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      traceparent: req.get("traceparent"),
    });
  });
  next();
});

// ── Health Check ─────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: SERVICE_NAME,
  });
});

// ── Get Medical Records Endpoint ────────────────────────────────────
/**
 * GET /api/records/:userId
 * 
 * Returns a JSON array of medical records for the given userId.
 * If the userId is not found, returns an empty array.
 * 
 * Response: { "userId": "user1", "records": [...], "count": 6 }
 */
app.get("/api/records/:userId", (req, res) => {
  const { userId } = req.params;
  const traceContext = req.get("traceparent");

  // Look up records for this user (or empty array if not found)
  const records = mockRecords[userId] || [];

  log("info", "Medical records retrieved", {
    userId,
    recordCount: records.length,
    traceparent: traceContext,
  });

  res.json({
    userId,
    records,
    count: records.length,
    timestamp: new Date().toISOString(),
  });
});

// ── Error handling ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  log("error", "Unhandled error", {
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    error: "Internal Server Error",
    service: SERVICE_NAME,
  });
});

// ── Start Server ─────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  log("info", `${SERVICE_NAME} listening on port ${PORT}`, {});
});
