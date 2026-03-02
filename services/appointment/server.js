const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");

// ── Config from environment ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;
const SERVICE_NAME = process.env.SERVICE_NAME || "appointment-api";
const DELAY_MIN = parseInt(process.env.DELAY_MIN, 10) || 100;
const DELAY_MAX = parseInt(process.env.DELAY_MAX, 10) || 500;
const BILLING_API_URL =
  process.env.BILLING_API_URL || "http://billing-api:3002";

// ── Doctor slug-to-name map ──────────────────────────────────────────
// booking.html sends option values (e.g. 'dr-tirta'); the DB stores full
// names (e.g. 'Dr. Tirta'). This map translates between the two so DB
// lookups succeed even when the frontend and DB naming don't match.
const DOCTOR_NAME_MAP = {
  "dr-tirta":    "Dr. Tirta",
  "dr-siska":    "Dr. Siska",
  "dr-sisca":    "Dr. Siska",   // loadgen / booking.html alternative spelling
  "dr-chaos":    "Dr. Chaos",
  "dr-smith":    "Dr. Sarah Smith",
  "dr-lim":      "Dr. Lim",
  "dr-jones":    "Dr. Michael Jones",
  "dr-williams": "Dr. Emily Williams",
  "dr-patel":    "Dr. Patel",
  "dr-wong":     "Dr. Wong",
};

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
 * Call the Billing API using axios to ensure APM headers propagate.
 * Now includes the appointment_id in the payload.
 */
async function callBillingApi(req, userId, appointmentId) {
  const url = `${BILLING_API_URL}/api/billing/pay`;

  // Explicit Context Propagation for APM (Dynatrace, OpenTelemetry, etc.)
  const headers = {
    "Content-Type": "application/json",
    "X-User-ID": userId || "unknown",
  };

  // Propagate trace IDs and Dynatrace specific headers if they exist
  const traceparent = req.headers["traceparent"];
  if (traceparent) {
    headers["traceparent"] = traceparent.toLowerCase();
    log("info", "Forwarding traceparent to billing-api:", { traceparent });
  }
  if (req.headers["tracestate"]) headers["tracestate"] = req.headers["tracestate"];
  if (req.headers["x-dynatrace"]) headers["x-dynatrace"] = req.headers["x-dynatrace"];

  // Payload now includes appointment_id for traceability
  const payload = {
    appointment_id: appointmentId,
    invoice: `INV-${appointmentId}-001`,
    amount: 150.0,
    userId: userId,
  };

  try {
    const res = await axios.post(url, payload, {
      headers,
      validateStatus: () => true, // Resolve on any HTTP status
    });
    return { status: res.status, body: res.data };
  } catch (err) {
    // Network errors or axios setup errors
    return { status: 500, body: err.message };
  }
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
app.get("/health", async (_req, res) => {
  try {
    // Verify database connectivity
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "ok",
      service: SERVICE_NAME,
      database: "connected",
      timestamp: result.rows[0].now,
    });
  } catch (error) {
    log("error", "Health check failed", { error: error.message });
    res.status(503).json({
      status: "unhealthy",
      service: SERVICE_NAME,
      error: error.message,
    });
  }
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
    }

    // ── Upsert user — ensures new/custom users don't cause FK violation ─
    await pool.query(
      `INSERT INTO users (user_id, name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, userName]
    );
    log("info", "User upserted", { userId });

    // ── Resolve doctor_id from doctors table ─────────────────────
    // Translate the frontend option value (e.g. 'dr-tirta') to the
    // actual DB name (e.g. 'Dr. Tirta') via the slug map.
    const rawDoctor = req.body?.doctor || "Dr. Tirta";
    const doctorName = DOCTOR_NAME_MAP[rawDoctor.toLowerCase()] || rawDoctor;
    const doctorLookup = await pool.query(
      "SELECT id, name, specialty FROM doctors WHERE name = $1 LIMIT 1",
      [doctorName]
    );
    // If still no match, fall back to the first doctor in the DB (safe default)
    const doctorRow = doctorLookup.rows[0] || (
      await pool.query("SELECT id, name, specialty FROM doctors ORDER BY id LIMIT 1")
    ).rows[0] || { id: 1, name: doctorName, specialty: "General" };
    log("info", "Doctor resolved", { rawDoctor, doctorName, doctorId: doctorRow.id });

    // ── Insert appointment into PostgreSQL ───────────────────────
    const insertResult = await pool.query(
      `INSERT INTO appointments (user_id, doctor_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, user_id, doctor_id, appointment_date, status`,
      [userId, doctorRow.id]
    );
    const row = insertResult.rows[0];
    const appointmentId = row.id;
    log("info", "Appointment inserted into DB", { appointmentId, userId, doctor: doctorRow.name });

    // ── Call Billing API with appointment_id ─────────────────────
    log("info", "Calling Billing API to process payment…", { appointmentId });
    const billing = await callBillingApi(req, userId, appointmentId);

    if (billing.status !== 200) {
      log("error", "Billing API returned an error", {
        appointmentId,
        billingStatus: billing.status,
        billingResponse: billing.body,
      });
      return res.status(502).json({
        success: false,
        service: SERVICE_NAME,
        message: "Payment processing failed — could not complete booking.",
        appointmentId,
        billingResponse: billing.body,
      });
    }

    log("info", "Appointment booked successfully with payment processed", {
      appointmentId,
      userId,
    });

    res.json({
      success: true,
      service: SERVICE_NAME,
      message: "Appointment booked successfully!",
      appointment: {
        id: `APT-${appointmentId}`,
        dbId: appointmentId,
        doctor: doctorRow.name,
        specialty: doctorRow.specialty,
        date: row.appointment_date,
        status: row.status,
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

// ── List appointments by user ────────────────────────────────────────
app.get("/api/appointments/list/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT a.id, a.user_id, a.appointment_date, a.status,
              d.name AS doctor, d.specialty
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.user_id = $1
       ORDER BY a.appointment_date DESC`,
      [userId]
    );

    log("info", "Retrieved appointments list", {
      userId,
      count: result.rows.length,
    });

    res.json({
      success: true,
      service: SERVICE_NAME,
      userId,
      appointments: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    log("error", "Failed to list appointments", {
      userId,
      error: err.message,
    });
    res.status(500).json({
      success: false,
      service: SERVICE_NAME,
      message: "Internal server error while listing appointments.",
      error: err.message,
    });
  }
});

// ── Error handling middleware ────────────────────────────────────────
app.use((err, req, res, next) => {
  log("error", "Unhandled error", {
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    success: false,
    service: SERVICE_NAME,
    message: "Internal server error",
  });
});

// ── Graceful Shutdown ────────────────────────────────────────────────
process.on("SIGINT", () => {
  log("info", "Shutting down gracefully", {});
  pool.end(() => {
    log("info", "Database pool closed", {});
    process.exit(0);
  });
});

app.listen(PORT, "0.0.0.0", () => {
  log("info", `${SERVICE_NAME} listening on port ${PORT}`, {});
  log("info", "Connected to database", {
    host: process.env.DB_HOST || "postgres",
    database: process.env.DB_NAME || "mediora_db",
  });
  if (MEDIORA_PROBLEMS.length > 0) {
    log("info", `Chaos problems configured: [${MEDIORA_PROBLEMS.join(", ")}] — activation delay: ${CHAOS_DELAY_SECONDS}s`, {});
  }
});
