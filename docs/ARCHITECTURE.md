# Architecture

jobhunt is two things sharing one pipeline:

1. **`jobhunt/`** — the original CLI package. Pure, tested, no web
   dependencies: fetch → prefilter → screen → draft → digest → mail. It
   still works standalone (`python -m jobhunt run`).
2. **`backend/` + `frontend/`** — a full-stack, multi-user web app that
   wraps the same `jobhunt/` package instead of reimplementing it.

```
                    ┌─────────────────────────────────────────┐
                    │              jobhunt/ (library)          │
                    │  fetch · prefilter · providers · llm ·   │
                    │  digest · mailer · mock                  │
                    └───────────────▲───────────────────────────┘
                                    │ imported directly, unmodified
                    ┌───────────────┴───────────────────────────┐
   React (Vite) ───▶│         FastAPI backend (backend/)         │
   dashboard         │  auth · profile · filters · companies ·   │
                     │  pipeline · jobs · admin                  │
                     └───────────────┬───────────────────────────┘
                                     │ SQLAlchemy
                     ┌───────────────▼───────────────────────────┐
                     │   SQLite (dev) / Postgres (prod)           │
                     │   users · profiles · filter_configs ·      │
                     │   companies · jobs (shared cache) ·        │
                     │   user_jobs (per-user tracker) · run_logs  │
                     └─────────────────────────────────────────────┘
```

## Why a shared job cache

`jobs` is one table shared by every user, keyed by the same globally-unique
`job_id = "{ats}:{slug}:{id}"` the CLI already uses. A pipeline run:

1. Refreshes the cache from the ATS boards in `companies` if it's older
   than `JOB_CACHE_TTL_MINUTES` (`services/pipeline_service.py:refresh_job_cache`).
2. Filters the cache down to *this user's* selected boards.
3. Runs `jobhunt.prefilter.prefilter` with *this user's* `FilterConfig`.
4. Excludes anything already in *this user's* `user_jobs`.
5. Screens/drafts the rest against *this user's* `Profile`.
6. Persists results into `user_jobs`.

So ten students searching the same fifteen companies cost fifteen HTTP
calls to Greenhouse/Lever/Ashby, not a hundred and fifty — the crawl layer
is shared, the ranking layer is personal. This split is also the structure
Paper 1 (`research/paper1_resume_job_matching.md`) argues for.

## Why `user_jobs` replaces `seen.json`

The CLI's `seen.json` is a single-user dedupe index and application
tracker in one JSON file. `user_jobs` is the same idea, one row per
`(user_id, job_id)`, with a `status` state machine
(`new → shortlisted → applied | dismissed`) instead of a single `applied`
boolean — the extra states are what the Tracker page's filters and the
status breakdown chart are built on.

## Two-stage LLM cost design (unchanged from the CLI)

Screening is cheap and runs over everything that survives the prefilter;
drafting is expensive and runs only for the top `max_per_digest` jobs above
`score_threshold`. Both stages go through `jobhunt/providers.py`'s
provider-agnostic interface, configured once for the whole deployment via
`backend/.env` (`LLM_PROVIDER`, `SCREEN_PROVIDER`, `DRAFT_PROVIDER`, ...) —
students don't bring their own API key. A `scorer=keyword` mode
(`jobhunt.llm.keyword_screen`) needs no LLM key at all: it's what "demo
mode" in the dashboard uses, and what the backend test suite runs against
so CI never needs a real key either.

## Auth & multi-tenancy

Email + bcrypt-hashed password, JWT bearer tokens
(`backend/app/security.py`). The first user to register becomes admin
(`is_admin`); admin-added companies are global and visible to everyone,
non-admin additions are private to that user
(`backend/app/routers/companies.py`).

## Scheduling

The dashboard's "Run search now" button covers the interactive case. For
an unattended daily run, `.github/workflows/web-daily.yml` is a cron that
calls `POST /admin/run-scheduled` on the deployed backend with a shared
secret — deliberately not an in-process scheduler (APScheduler, etc.),
because free-tier hosts that sleep or restart on deploy can't be trusted to
keep a background thread alive. The endpoint loops over every user with
`auto_run_daily = true` and runs the same `pipeline_service` function the
manual button uses.

## Where the CLI and the web app diverge

| | CLI (`jobhunt/cli.py`) | Web (`backend/`) |
|---|---|---|
| Users | one (your machine) | many (accounts) |
| Config | `config.yaml`, `companies.yaml` | `FilterConfig`, `Company` rows per user |
| Dedupe/tracker | `seen.json` | `user_jobs` table |
| Job fetch | every run, every company | shared cache, TTL-refreshed |
| Output | `out/digest.html` + email | dashboard + optional email |
| Scheduling | GitHub Actions runs the pipeline itself | GitHub Actions pokes the server |

Both share `jobhunt/fetch.py`, `prefilter.py`, `providers.py`, `llm.py`,
`digest.py`, and `mailer.py` byte-for-byte — the only pipeline-level change
made for the web app was `mailer.send()` gaining an optional `to_addr`
parameter, since one deployment now emails many different recipients
instead of one fixed `MAIL_TO`.
