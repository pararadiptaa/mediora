import json
import os
import random
import sys
import time
from datetime import datetime, timezone

from flask import Flask, jsonify, request

# ── Config from environment ──────────────────────────────────────────
PORT = int(os.environ.get("PORT", 3002))
SERVICE_NAME = os.environ.get("SERVICE_NAME", "billing-api")
DELAY_MIN = int(os.environ.get("DELAY_MIN", 100))
DELAY_MAX = int(os.environ.get("DELAY_MAX", 500))
FAILURE_RATE = float(os.environ.get("FAILURE_RATE", 0.3))

# ── Chaos Engineering config ─────────────────────────────────────────
MEDIORA_PROBLEMS = [
    s.strip()
    for s in os.environ.get("MEDIORA_PROBLEMS", "").split(",")
    if s.strip()
]
CHAOS_DELAY_SECONDS = int(os.environ.get("CHAOS_DELAY_SECONDS", 0))
STARTUP_TIME = time.time()


def is_chaos_active(problem_name: str) -> bool:
    """
    Returns True if the named problem is listed in MEDIORA_PROBLEMS
    AND the chaos delay window has elapsed since startup.
    """
    if problem_name not in MEDIORA_PROBLEMS:
        return False
    elapsed = time.time() - STARTUP_TIME
    return elapsed >= CHAOS_DELAY_SECONDS


app = Flask(__name__)


# ── Helpers ──────────────────────────────────────────────────────────
def log(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service": SERVICE_NAME,
        "message": message,
        **extra,
    }
    sys.stdout.write(json.dumps(entry) + "\n")
    sys.stdout.flush()


def simulate_delay():
    delay_s = random.randint(DELAY_MIN, DELAY_MAX) / 1000.0
    time.sleep(delay_s)
    return delay_s


# ── Request logging middleware ───────────────────────────────────────
@app.before_request
def before_request():
    request._start_time = time.time()


@app.after_request
def after_request(response):
    duration_ms = round((time.time() - getattr(request, "_start_time", time.time())) * 1000)
    log(
        "info",
        "request",
        method=request.method,
        path=request.path,
        statusCode=response.status_code,
        durationMs=duration_ms,
    )
    return response


# ── Routes ───────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": SERVICE_NAME})


@app.route("/api/billing/pay", methods=["POST"])
def pay():
    simulate_delay()

    # ── Chaos: Billing500 — force 500 at 40% rate when active ────
    if is_chaos_active("Billing500"):
        if random.random() < 0.4:
            log("error", "CHAOS Billing500 — forced 500 Internal Server Error")
            return jsonify({
                "success": False,
                "service": SERVICE_NAME,
                "message": "Internal Server Error — chaos Billing500 active.",
                "error": "CHAOS_BILLING_500",
            }), 500

    # Normal chaos: randomly fail based on FAILURE_RATE (legacy)
    if not is_chaos_active("Billing500") and random.random() < FAILURE_RATE:
        log("error", "Simulated payment failure (chaos)", failureRate=FAILURE_RATE)
        return jsonify({
            "success": False,
            "service": SERVICE_NAME,
            "message": "Payment processing failed — simulated outage.",
            "error": "SIMULATED_FAILURE",
        }), 500

    transaction_id = f"TXN-{int(time.time() * 1000)}"
    log("info", "Payment processed successfully", transactionId=transaction_id)
    return jsonify({
        "success": True,
        "service": SERVICE_NAME,
        "message": "Payment processed successfully.",
        "transactionId": transaction_id,
        "amount": 150.00,
        "currency": "USD",
    })


# ── Start ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log("info", f"{SERVICE_NAME} listening on port {PORT}")
    if MEDIORA_PROBLEMS:
        log("info", f"Chaos problems configured: [{', '.join(MEDIORA_PROBLEMS)}] — activation delay: {CHAOS_DELAY_SECONDS}s")
    app.run(host="0.0.0.0", port=PORT)
