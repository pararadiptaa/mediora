const express = require("express");
const { v4: uuidv4 } = require("uuid");

// ── Config from environment ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3003;
const SERVICE_NAME = process.env.SERVICE_NAME || "validation-api";

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
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract W3C Trace Context from incoming request headers
 * and propagate to axios requests
 */
function extractTraceContext(req) {
  return {
    traceparent: req.get("traceparent"),
    tracestate: req.get("tracestate"),
  };
}

/**
 * Apply trace context headers to an axios request config
 */
function applyTraceContext(axiosConfig, traceContext) {
  if (traceContext.traceparent) {
    axiosConfig.headers["traceparent"] = traceContext.traceparent;
  }
  if (traceContext.tracestate) {
    axiosConfig.headers["tracestate"] = traceContext.tracestate;
  }
  return axiosConfig;
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
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: SERVICE_NAME,
  });
});

// ── Card Validation Endpoint ─────────────────────────────────────────
/**
 * POST /api/validate-card
 * 
 * Request body: { "cardNumber": "4111111111111111" }
 * Response: { "valid": true, "cardNumber": "****1111", "transactionId": "uuid" }
 * 
 * - Sleeps 200ms to simulate processing
 * - Always returns 200 with valid: true
 * - Propagates W3C trace context
 */
app.post("/api/validate-card", async (req, res) => {
  const { cardNumber } = req.body || {};
  const transactionId = uuidv4();
  const traceContext = extractTraceContext(req);

  if (!cardNumber) {
    log("warn", "Card validation request without cardNumber", { transactionId });
    return res.status(400).json({
      valid: false,
      error: "cardNumber is required",
      transactionId,
    });
  }

  try {
    // Simulate card validation processing time (200ms)
    await sleep(200);

    // Mask the card number (show last 4 digits)
    const maskedCard = `****${cardNumber.slice(-4)}`;

    log("info", "Card validated successfully", {
      transactionId,
      maskedCard,
      traceparent: traceContext.traceparent,
    });

    res.json({
      valid: true,
      cardNumber: maskedCard,
      transactionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log("error", "Card validation failed", {
      transactionId,
      error: error.message,
    });
    res.status(500).json({
      valid: false,
      error: "Validation service error",
      transactionId,
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

// ── Start Server ─────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  log("info", `${SERVICE_NAME} listening on port ${PORT}`, {});
});
