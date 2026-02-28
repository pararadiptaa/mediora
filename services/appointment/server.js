const express = require("express");
const http = require("http");
const { Pool } = require("pg");

// ── Config from environment ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;
const SERVICE_NAME = process.env.SERVICE_NAME || "appointment-api";
const DELAY_MIN = parseInt(process.env.DELAY_MIN, 10) || 100;
const DELAY_MAX = parseInt(process.env.DELAY_MAX, 10) || 500;
const BILLING_API_URL =
  process.env.BILLING_API_URL || "http://billing-api:3002";

// ── Chaos Engineering config ─────────────────────────────────────────
const MEDIORA_PROBLEMS = (process.env.MEDIORA_PROBLEMS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CHAOS_DELAY_SECONDS =
  parseInt(process.env.CHAOS_DELAY_SECONDS, 10) || 0;
const STARTUP_TIME = Date.now();

/**
 * Returns true if the named problem is listed in MEDIORA_PROBLEMS
 * AND the chaos delay window has elapsed since startup.
 */
function isChaosActive(problemName) {
  if (!MEDIORA_PROBLEMS.includes(problemName)) return false;
  const elapsed = (Date.now() - STARTUP_TIME) / 1000;
  return elapsed >= CHAOS_DELAY_SECONDS;
}

// ── PostgreSQL pool ──────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || "mediora",
  password: process.env.DB_PASSWORD || "mediora_pass",
  database: process.env.DB_NAME || "mediora_db",
  max: 10,
  connectionTimeoutMillis: 5000,
});

// ── Helpers ──────────────────────────────────────────────────────────
function log(level, msg, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message: msg,
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}

function randomDelay() {
  const ms =
    Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * CpuSpike chaos: burn CPU with a synchronous heavy math loop for ~500ms.
 */
function cpuSpikeBurn() {
  const end = Date.now() + 500;
  let x = 0;
  while (Date.now() < end) {
    x += Math.sqrt(Math.random() * 999999);
  }
  return x; // prevent dead-code elimination
}

/**
 * Call the Billing API using the Node.js standard library.
 */
function callBillingApi(userId) {
  return new Promise((resolve, reject) => {
    const url = `${BILLING_API_URL}/api/billing/pay`;
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId || "unknown",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );
    req.on("error", (err) => reject(err));
    req.write(JSON.stringify({ invoice: "INV-2023-001", amount: 150.0 }));
    req.end();
  });
}

// ── Express app ──────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    log("info", "request", {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

// ── Book appointment ─────────────────────────────────────────────────
app.post("/api/appointments/book", async (req, res) => {
  const userId = req.headers["x-user-id"] || "unknown";
  const userName =
    userId.charAt(0).toUpperCase() + userId.slice(1);

  try {
    await randomDelay();

    // ── Chaos: CpuSpike ──────────────────────────────────────────
    if (isChaosActive("CpuSpike")) {
      log("warn", "CHAOS CpuSpike — burning CPU for 500 ms", { userId });
      cpuSpikeBurn();
    }

    // ── Chaos: SlowDatabaseQuery ─────────────────────────────────
    if (isChaosActive("SlowDatabaseQuery")) {
      log("warn", "CHAOS SlowDatabaseQuery — executing pg_sleep(3)", { userId });
      await pool.query("SELECT pg_sleep(3)");
      log("warn", "CHAOS SlowDatabaseQuery — completed", { userId });
    } else if (userId.toLowerCase() === "john") {
      // Legacy per-user slow query (kept for backward compat)
      log("warn", "User C detected — executing intentional slow query (pg_sleep 3s)", { userId });
      await pool.query("SELECT pg_sleep(3)");
      log("warn", "Slow query completed", { userId });
    }

    // ── Insert appointment into PostgreSQL ───────────────────────
    const doctor = req.body?.doctor || "Dr. Tirta";
    const specialty = req.body?.specialty || "Cardiology";
    const insertResult = await pool.query(
      `INSERT INTO appointments (user_id, user_name, doctor, specialty)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, userName, doctor, specialty]
    );
    const row = insertResult.rows[0];
    log("info", "Appointment inserted into DB", { appointmentId: row.id, userId });

    // ── Call Billing API ─────────────────────────────────────────
    log("info", "Calling Billing API to process payment…");
    const billing = await callBillingApi(userId);

    if (billing.status !== 200) {
      log("error", "Billing API returned an error", { billingResponse: billing });
      return res.status(502).json({
        success: false,
        service: SERVICE_NAME,
        message: "Payment processing failed — could not book appointment.",
        billingResponse: billing.body,
      });
    }

    res.json({
      success: true,
      service: SERVICE_NAME,
      message: "Appointment booked successfully!",
      appointment: {
        id: `APT-${row.id}`,
        dbId: row.id,
        doctor: row.doctor,
        specialty: row.specialty,
        date: row.appointment_date,
        createdAt: row.created_at,
      },
      billing: billing.body,
    });
  } catch (err) {
    log("error", "Failed to book appointment", { error: err.message });
    res.status(500).json({
      success: false,
      service: SERVICE_NAME,
      message: "Internal server error while booking appointment.",
      error: err.message,
    });
  }
});

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  log("info", `${SERVICE_NAME} listening on port ${PORT}`);
  if (MEDIORA_PROBLEMS.length > 0) {
    log("info", `Chaos problems configured: [${MEDIORA_PROBLEMS.join(", ")}] — activation delay: ${CHAOS_DELAY_SECONDS}s`);
  }
});
