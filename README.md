# 🏥 Mediora — APM Demo Application

A microservices healthcare web app designed for **testing and demonstrating APM (Application Performance Monitoring) tools**. Mediora simulates a real patient portal with realistic distributed traces, database queries, and configurable **chaos engineering** problem patterns — inspired by Dynatrace's easyTravel.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Docker Compose                      │
│                                                      │
│  ┌──────────┐   ┌────────────────┐  ┌─────────────┐ │
│  │ Loadgen  │──▶│   Frontend     │  │  PostgreSQL  │ │
│  │(Playwright)  │ (Nginx :80)    │  │  (port 5432) │ │
│  └──────────┘   └──┬─────────┬───┘  └──────▲───────┘ │
│                    │         │              │         │
│              ┌─────▼───┐ ┌──▼──────────┐   │         │
│              │Appt API │ │ Billing API  │   │         │
│              │(Node.js)│ │  (Python)    │   │         │
│              │ :3001   │ │  :3002       │   │         │
│              └────┬────┘ └─────────────┘   │         │
│                   │                         │         │
│                   └─────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

| Service | Tech | Purpose |
|---------|------|---------|
| **frontend** | Nginx + Tailwind HTML | Static multi-page patient portal |
| **appointment-api** | Node.js / Express | Books appointments, inserts into PostgreSQL |
| **billing-api** | Python / Flask | Processes payments with configurable failure |
| **postgres** | PostgreSQL 15 | Stores appointment records |
| **loadgen** | Playwright (Chromium) | Continuous headless browser load generator |

## Quick Start

```bash
git clone <repo-url>
cd mediora
docker compose up --build -d
```

Open **http://localhost:8080** → Login as one of three demo users.

## Demo Users

| User | Login | Behavior |
|------|-------|----------|
| **Budi** | User A | Clean slate — empty dashboard, no bills |
| **Siti** | User B | Has outstanding bills, full dashboard |
| **John** | User C | Chaos user — triggers slow DB queries |

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login.html` | Pick a demo user |
| Dashboard | `/dashboard.html` | Overview with conditional cards |
| Book Appointment | `/booking.html` | Specialty → Doctor cascade, live summary |
| Reschedule | `/booking.html?reschedule=true` | Update existing appointment |
| Billing | `/billing.html` | Mock CC forms, valid/declined quick-fill |
| Medical Records | `/records.html` | Static medical history table |
| Record Detail | `/record-detail.html?id=N` | Lab results with metric cards |
| Appointment Detail | `/appointment-detail.html` | Upcoming appointment info |
| Payment Success | `/success.html` | Confirmation page |
| Payment Failed | `/failed.html` | Decline page |

## Chaos Engineering

Control problem patterns via `docker-compose.yml` environment variables — no code changes needed.

### Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `MEDIORA_PROBLEMS` | appointment-api, billing-api | Comma-separated list of active problems |
| `CHAOS_DELAY_SECONDS` | appointment-api, billing-api | Seconds after startup before chaos activates (allows APM to baseline normal traffic) |
| `LOADGEN_VPM` | loadgen | Visits Per Minute — controls load intensity |

### Problem Patterns

| Problem | Service | Effect |
|---------|---------|--------|
| `SlowDatabaseQuery` | appointment-api | Appends `SELECT pg_sleep(3)` to every booking query |
| `CpuSpike` | appointment-api | 500ms synchronous CPU burn before each booking |
| `Billing500` | billing-api | Forces HTTP 500 at 40% rate |

### Example Configuration

```yaml
# appointment-api
MEDIORA_PROBLEMS: "SlowDatabaseQuery,CpuSpike"
CHAOS_DELAY_SECONDS: "120"

# billing-api
MEDIORA_PROBLEMS: "Billing500"
CHAOS_DELAY_SECONDS: "120"
```

To disable all chaos: set `MEDIORA_PROBLEMS: ""`.

## Loadgen Bot

The Playwright-based load generator runs 5 personas in a continuous loop:

| # | Persona | User | Flow |
|---|---------|------|------|
| 1 | Perfect Patient | Budi | Login → Book → Pay → Success |
| 2 | Window Shopper | Budi | Login → Book → Cancel |
| 3 | Hypochondriac | Siti | Login → Records → View Detail |
| 4 | Broke Patient | Siti | Login → Billing → Declined → Failed |
| 5 | Chaos Magnet | John | Login → Book Dr. Chaos → Error |

Control intensity with `LOADGEN_VPM` (default: 2 = one scenario every 30s).

## Monitoring & Logs

```bash
docker compose logs -f                    # all services
docker compose logs -f appointment-api    # watch chaos activation
docker compose logs -f loadgen            # watch bot iterations
docker compose logs -f billing-api        # payment successes/failures
```

All services emit structured JSON logs with timestamps, service names, and request metadata for APM ingestion.

## Project Structure

```
mediora/
├── docker-compose.yml          # Orchestration + chaos config
├── README.md                   # This file
├── frontend/
│   ├── Dockerfile              # Nginx image
│   ├── nginx.conf              # Reverse proxy config
│   └── public/                 # Static HTML pages
│       ├── login.html
│       ├── dashboard.html
│       ├── booking.html
│       ├── billing.html
│       ├── records.html
│       ├── record-detail.html
│       ├── appointment-detail.html
│       ├── success.html
│       └── failed.html
├── services/
│   ├── appointment/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── server.js           # Express + PostgreSQL + chaos
│   ├── billing/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── app.py              # Flask + chaos
│   └── db/
│       └── init.sql            # PostgreSQL schema
└── loadgen/
    ├── Dockerfile              # Playwright image
    ├── package.json
    └── bot.js                  # 5-persona load generator
```

## License

This project is for educational and APM demonstration purposes.
