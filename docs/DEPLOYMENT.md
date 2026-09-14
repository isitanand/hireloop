# Deployment

Two ways to run this: **local** (nothing but Python and Node, good enough
for development and a viva demo) and **live** (a real public URL, for
sharing outside your own machine). Everything below is free-tier, and
**none of it needs Docker installed on your machine** — not local dev, not
the live deploy (Render builds the container on its own servers from the
Dockerfile in this repo, not on yours).

I can't create accounts or paste secrets into Render/Neon/Vercel for
you — that needs your own login. This is the exact set of clicks; budget
about 15 minutes.

---

## Local: two terminals, no Docker

```bash
# terminal 1 - backend
cd backend
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python seed_companies.py
uvicorn app.main:app --reload

# terminal 2 - frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The backend is at `http://localhost:8000`
(interactive API docs at `/docs`). Data lives in `backend/data/jobhunt.db`
(SQLite) — delete that file for a clean slate.

### Optional: one command instead, if you already have Docker

```bash
cp backend/.env.example backend/.env      # fill in an LLM key if you have one - optional, demo mode needs none
docker compose up --build
```

Open **http://localhost:3000** instead (the compose setup maps the
frontend to port 3000). Data persists in a Docker volume between runs;
`docker compose down -v` wipes it. This is purely a convenience for
spinning up both halves in one shell — skip it entirely if you don't
already have Docker Desktop installed; it buys you nothing the two-terminal
path above doesn't already do.

---

## Live: Render (backend) + Neon (database) + Vercel (frontend)

### 1. Database — Neon (free Postgres, doesn't expire like some free tiers)

1. [neon.tech](https://neon.tech) → sign up → **New Project**.
2. Copy the connection string it gives you (`postgresql://...`).

### 2. Backend — Render

1. Push this repo to GitHub if it isn't already.
2. [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Settings:
   - **Root directory**: repo root (the Dockerfile path is set below)
   - **Dockerfile path**: `backend/Dockerfile`
   - **Docker build context**: repo root (`.`) — the Dockerfile copies
     `jobhunt/` and `companies.yaml` from one level up, so the context must
     be the repo root, not `backend/`
4. Environment variables (Render dashboard → Environment):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `JWT_SECRET` | generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
   | `ADMIN_RUN_SECRET` | generate the same way — different value |
   | `CORS_ORIGINS` | your Vercel URL, added after step 3 (placeholder for now) |
   | `LLM_PROVIDER`, `GEMINI_API_KEY` (or your provider of choice) | see the root README's provider table |
   | `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST` | optional, only if you want the email digest to actually send |

5. Deploy. Render gives you a URL like `https://jobhunt-api.onrender.com`.
6. **Note the free tier sleeps after inactivity** — the first request after
   a quiet period can take 30–60s to wake up. Fine for a demo, mention it if
   you're timing a live viva.

### 3. Frontend — Vercel

1. [vercel.com](https://vercel.com) → **New Project** → import the same repo.
2. **Root directory**: `frontend`
3. Environment variable: `VITE_API_URL` = the Render URL from step 2.
4. Deploy. Vercel gives you a URL like `https://jobhunt.vercel.app`.

### 4. Close the loop

Go back to Render and set `CORS_ORIGINS` to the Vercel URL from step 3
(comma-separate if you also want `http://localhost:5173` for local dev
against the live backend). Redeploy the backend for it to take effect.

### 5. (Optional) Daily automated run

`.github/workflows/web-daily.yml` pings your deployed backend on a cron.
Repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `BACKEND_URL` | the Render URL, e.g. `https://jobhunt-api.onrender.com` |
| `ADMIN_RUN_SECRET` | must match the backend's `ADMIN_RUN_SECRET` env var |

Trigger it once by hand (Actions → *web app daily run* → *Run workflow*)
to confirm it returns HTTP 202 before trusting the schedule.

---

## Sanity checks after deploying

- `curl https://<render-url>/health` → `{"status":"ok"}`
- Open the Vercel URL, register an account, run a search in demo mode
  (no LLM key needed) — confirms frontend ↔ backend ↔ database all connect.
- `curl -X POST https://<render-url>/admin/run-scheduled -H "X-Admin-Secret: <secret>"`
  → `202` with `{"queued_users": N}`.
