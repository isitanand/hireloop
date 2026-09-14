# jobhunt frontend

React + TypeScript + Vite dashboard for the jobhunt web app. See the
[repo root README](../README.md) for what the product does, and
[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for how to run or deploy the
full stack (this package alone isn't useful without `backend/` running).

```bash
cp .env.example .env      # VITE_API_URL - defaults to http://localhost:8000
npm install
npm run dev                # http://localhost:5173
```

```bash
npm run build              # type-check (tsc -b) + production build to dist/
```

## Layout

```
src/
  routes/       one file per page - Landing, Login, Register, Onboarding,
                Dashboard, JobDetail, Tracker, Settings
  components/   shared UI - JobCard, ScoreBadge, StatusBadge, FunnelStats,
                Navbar, ProtectedRoute, Button, Spinner, EmptyState
  lib/
    api.ts      axios client + typed request functions (mirrors
                backend/app/schemas.py)
    auth.tsx    AuthContext - JWT in localStorage, TanStack Query for /me
    types.ts    TypeScript types matching the backend's Pydantic schemas
```

Routes are lazy-loaded (`React.lazy`) so heavier per-page dependencies —
Recharts on the Tracker page, in particular — don't bloat the initial
bundle.
