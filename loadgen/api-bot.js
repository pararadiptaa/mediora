/**
 * Mediora API Loadgen — high-volume HTTP load generator.
 *
 * Fires direct API requests at a configurable rate without launching a browser.
 * Generates valid W3C traceparent headers so every request appears as a
 * distributed trace in Dynatrace / OpenTelemetry, propagating correctly through
 * the appointment-api → billing-api → validation-api call chain.
 *
 * Config (via environment variables):
 *   BASE_URL                 Base URL of the target (default: http://frontend:80)
 *   API_LOADGEN_RPM          Target requests per minute (default: 60)
 *   API_LOADGEN_CONCURRENCY  Max concurrent in-flight requests (default: 5)
 */

const axios = require("axios");
const crypto = require("crypto");

// ── Config ────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "http://frontend:80";
const RPM = parseInt(process.env.API_LOADGEN_RPM, 10) || 60;
const CONCURRENCY = parseInt(process.env.API_LOADGEN_CONCURRENCY, 10) || 5;

// Minimum 50 ms between ticks to avoid flooding the event loop.
const INTERVAL_MS = Math.max(50, Math.floor(60000 / RPM));

const SERVICE_NAME = "api-loadgen";

// ── Logger ────────────────────────────────────────────────────────────
function log(level, message, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message,
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}

// ── Helpers ───────────────────────────────────────────────────────────
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a valid W3C traceparent header.
 * Format: 00-<traceId:32hex>-<spanId:16hex>-01
 * The sampled flag (01) ensures Dynatrace captures every trace.
 */
function generateTraceparent() {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return `00-${traceId}-${spanId}-01`;
}

// ── Seed data (must match init.sql) ──────────────────────────────────
const USERS = ["budi", "siti", "john"];

// Dr. Chaos is intentionally excluded — high-volume happy-path traffic
// should not be confused with chaos injection (that is the Playwright
// bot's Chaos Magnet persona's job).
const DOCTORS = [
  "dr-tirta",
  "dr-siska",
  "dr-smith",
  "dr-lim",
  "dr-jones",
  "dr-williams",
  "dr-patel",
  "dr-wong",
];

// ── Scenarios ─────────────────────────────────────────────────────────

/**
 * Book an appointment.
 * Trace chain: nginx → appointment-api → billing-api → validation-api → postgres
 * This is the most valuable scenario for Dynatrace service topology visibility.
 */
async function bookAppointment() {
  const userId = randomFrom(USERS);
  const doctor = randomFrom(DOCTORS);
  const traceparent = generateTraceparent();

  const res = await axios.post(
    `${BASE_URL}/api/appointments/book`,
    { doctor },
    {
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
        traceparent,
      },
      timeout: 15000,
      validateStatus: () => true, // never throw on HTTP error status
    }
  );

  return { scenario: "book", status: res.status, userId, doctor };
}

/**
 * Fetch medical records for a patient.
 * Trace chain: nginx → records-api → postgres
 */
async function fetchRecords() {
  // john has no pre-seeded medical records; rotate between budi and siti
  const userId = randomFrom(["budi", "siti"]);
  const traceparent = generateTraceparent();

  const res = await axios.get(`${BASE_URL}/api/records/${userId}`, {
    headers: { traceparent },
    timeout: 10000,
    validateStatus: () => true,
  });

  return { scenario: "records", status: res.status, userId };
}

// Weighted scenario pool: 70 % booking (full service chain), 30 % records
const SCENARIO_POOL = [
  ...Array(7).fill(bookAppointment),
  ...Array(3).fill(fetchRecords),
];

// ── Concurrency gate ──────────────────────────────────────────────────
let inFlight = 0;
let totalRequests = 0;
let totalErrors = 0;

async function runOne() {
  // Shed load gracefully rather than queuing unbounded work.
  if (inFlight >= CONCURRENCY) return;

  inFlight++;
  totalRequests++;
  const scenario = SCENARIO_POOL[Math.floor(Math.random() * SCENARIO_POOL.length)];

  try {
    const result = await scenario();
    const isServerError = result.status >= 500;
    if (isServerError) totalErrors++;
    log(isServerError ? "warn" : "info", "request", result);
  } catch (err) {
    totalErrors++;
    log("error", "request failed", { error: err.message });
  } finally {
    inFlight--;
  }
}

// ── Periodic stats ────────────────────────────────────────────────────
setInterval(() => {
  log("info", "stats", {
    totalRequests,
    totalErrors,
    errorRate:
      totalRequests > 0
        ? ((totalErrors / totalRequests) * 100).toFixed(1) + "%"
        : "0%",
    inFlight,
    configuredRpm: RPM,
    concurrency: CONCURRENCY,
  });
}, 60000);

// ── Startup ───────────────────────────────────────────────────────────
log("info", "API loadgen starting", {
  baseUrl: BASE_URL,
  rpm: RPM,
  intervalMs: INTERVAL_MS,
  concurrency: CONCURRENCY,
  scenarios: "70% book, 30% records",
});

log("info", "Waiting 15 s for services to initialize…");
setTimeout(() => {
  log("info", "Starting request loop");
  setInterval(runOne, INTERVAL_MS);
}, 15000);
