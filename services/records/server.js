const express = require("express");
const { Pool } = require("pg");

// ── Config from environment ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || "records-api";

// ── PostgreSQL Pool Configuration ────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || "mediora",
  password: process.env.DB_PASSWORD || "mediora_pass",
  database: process.env.DB_NAME || "mediora_db",
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
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
  console.log(JSON.stringify(entry));
}

/**
 * Resolve user_id from user name if needed
 * Maps friendly display names to actual user_ids
 */
async function resolveUserId(userIdentifier) {
  try {
    // Try to find by user_id first
    const result = await pool.query(
      "SELECT user_id FROM users WHERE user_id = $1 OR name = $1 LIMIT 1",
      [userIdentifier]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].user_id;
    }
    
    // If not found, return the identifier as-is (might be a valid user_id)
    return userIdentifier;
  } catch (error) {
    log("error", "Failed to resolve user_id", { error: error.message });
    return userIdentifier; // Fallback
  }
}

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
app.get("/health", async (req, res) => {
  try {
    // Verify database connectivity
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    client.release();

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

// ── Get Medical Records Endpoint ────────────────────────────────────
/**
 * GET /api/records/:userId
 * 
 * Returns medical records for the given userId from the database.
 * 
 * Query: SELECT * FROM medical_records WHERE user_id = $1
 * 
 * Response: { "userId": "user2", "records": [...], "count": 6 }
 */
app.get("/api/records/:userId", async (req, res) => {
  const { userId } = req.params;
  const traceContext = req.get("traceparent");

  try {
    // Resolve the user_id (in case a name is passed)
    const resolvedUserId = await resolveUserId(userId);

    log("info", "Fetching medical records from database", {
      inputUserId: userId,
      resolvedUserId,
      traceparent: traceContext,
    });

    // Query medical records for this user
    const query =
      "SELECT id, user_id, record_date, record_type, icon, doctor_name, facility, status, description FROM medical_records WHERE user_id = $1 ORDER BY record_date DESC";
    
    const result = await pool.query(query, [resolvedUserId]);
    const records = result.rows;

    // Transform database records to match frontend expectations
    const transformedRecords = records.map((record) => ({
      id: record.id,
      date: record.record_date, // Database stores as DATE, but return as ISO string
      type: record.record_type,
      icon: record.icon,
      doctor: record.doctor_name,
      facility: record.facility,
      status: record.status,
      description: record.description,
    }));

    log("info", "Medical records retrieved successfully", {
      userId: resolvedUserId,
      recordCount: records.length,
      traceparent: traceContext,
    });

    res.json({
      userId: resolvedUserId,
      records: transformedRecords,
      count: records.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log("error", "Failed to fetch medical records", {
      userId,
      error: error.message,
    });
    res.status(500).json({
      error: "Failed to fetch medical records",
      service: SERVICE_NAME,
      message: error.message,
    });
  }
});

// ── Get All Users Endpoint (for debugging) ──────────────────────────
/**
 * GET /api/users
 * Returns list of all users in the system
 */
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, name, email, phone, status FROM users ORDER BY created_at ASC"
    );

    log("info", "Users list retrieved", {
      userCount: result.rows.length,
    });

    res.json({
      users: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log("error", "Failed to fetch users list", { error: error.message });
    res.status(500).json({
      error: "Failed to fetch users",
      service: SERVICE_NAME,
    });
  }
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

// ── Graceful Shutdown ────────────────────────────────────────────────
process.on("SIGINT", () => {
  log("info", "Shutting down gracefully", {});
  pool.end(() => {
    log("info", "Database pool closed", {});
    process.exit(0);
  });
});

// ── Start Server ─────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  log("info", `${SERVICE_NAME} listening on port ${PORT}`, {});
  log("info", "Connected to database", {
    host: process.env.DB_HOST || "postgres",
    database: process.env.DB_NAME || "mediora_db",
  });
});
