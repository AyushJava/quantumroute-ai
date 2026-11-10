# Phase 5.7 — Manual End-to-End Testing Checklist

> **Status legend**: `[ ]` not run · `[x]` pass · `[!]` fail — record notes inline.
> This checklist covers **implemented** features only. Dynamic traffic editing,
> live traffic feeds, and incident simulation are **Phase 6 — not yet available**.
> Do not expect traffic-event controls; none exist in the UI.

## 1. Prerequisites & setup

Verified from `docker-compose.yml`, `.env.example`, `README.md`:

| Service | URL / port | Notes |
|---|---|---|
| PostgreSQL (PostGIS) | `127.0.0.1:15432` | container `quantumroute-db` |
| Optimizer (FastAPI) | `http://localhost:8000` | `GET /api/health` → `{"service":"QuantumRoute Optimizer","status":"UP"}` |
| Backend (Spring Boot) | `http://localhost:8081` | REST under `/api/v1` |
| Frontend (React/Vite) | `http://localhost:5173` | dev server or nginx container |

**Start services (choose one):**

```bash
# Option A — full stack via Compose (includes nginx frontend)
docker compose up -d db optimizer backend frontend

# Option B — local dev (backend/optimizer/db via compose, frontend via Vite)
docker compose up -d db optimizer backend
cd frontend && npm run dev   # serves on :5173
```

**Environment variables** (`.env`, git-ignored — never commit):
- `POSTGRES_PASSWORD` — DB password (compose default `quantumroute_local_only` for local dev)
- `JWT_SECRET` — **required**, ≥32 bytes; generate e.g. `openssl rand -hex 32`
- `CORS_ALLOWED_ORIGINS` — must include `http://localhost:5173` (already the default)
- `VITE_API_BASE_URL` — frontend API base; defaults to `http://localhost:8081`
- `OPTIMIZER_CONNECT_TIMEOUT_MS=3000`, `OPTIMIZER_READ_TIMEOUT_MS=60000`

> ⚠️ Manual confirmation required: exact compose service names and any
> additional env vars your local `.env` defines.

## 2. Application load & theme

- [ ] **2.1 App loads** — open `http://localhost:5173`; login page renders, no console errors (F12).
  - Expected: centered auth card, QuantumRoute branding.
- [ ] **2.2 Theme toggle** — switch to dark mode via topbar/sidebar toggle; reload page.
  - Expected: theme persists after reload (`localStorage`), all surfaces legible in both themes.
- [ ] **2.3 Responsive** — resize to ~375px width; navigate sidebar.
  - Expected: layout collapses gracefully, no horizontal overflow.

## 3. Authentication & protected routes

- [ ] **3.1 Register** — `/register`: valid email + password (8–200 chars, ≤72 UTF-8 bytes) + optional display name → success → auto-redirect to `/login` after ~1.2s.
- [ ] **3.2 Register validation** — empty email, short password, mismatched confirm → inline errors, no request sent.
- [ ] **3.3 Login** — valid credentials → dashboard; JWT held in memory only (verify `localStorage` has no token key).
- [ ] **3.4 Protected routes** — logged out, visit `/workspaces` or `/scenarios/:id/plan` directly → redirected to `/login`.
- [ ] **3.5 Logout** — topbar user chip → logout → redirected to `/login`; back-button to protected page redirects again.

## 4. Workspace management

- [ ] **4.1 Create workspace** — dashboard/workspaces → New → name → appears in list.
- [ ] **4.2 View workspace** — click through → scenario list loads (empty state OK).
- [ ] **4.3 Delete workspace** — confirm dialog → workspace removed (cascades scenarios — verify expected data first).

## 5. Scenario management

- [ ] **5.1 Create scenario** — name + starter graph JSON → detail page shows graph version `v1`.
- [ ] **5.2 Edit graph** — modify JSON (e.g., add node/edge), bump `graphVersion` → saves; **same version + changed graph → backend rejects** (expected validation error).
- [ ] **5.3 Invalid JSON** — paste malformed JSON → inline validation error, no save.
- [ ] **5.4 Delete scenario** — confirm → removed from list.

## 6. Map & selection

- [ ] **6.1 Map renders** — open "Plan Route" from scenario detail → OSM tiles load, attribution visible bottom-right.
- [ ] **6.2 Graph overlay** — edges drawn (closed edges dashed/dimmed), directed edges show arrow markers, nodes show ID tooltips.
- [ ] **6.3 Select origin** — mode "Select Origin" → click a node on map → marker turns green, mode auto-advances to destination.
- [ ] **6.4 Select destination** — click another node → amber marker; readiness text shows "Origin and destination selected."
- [ ] **6.5 Dropdown sync** — change Origin dropdown → map marker updates; coord-less nodes appear with "(no map coordinates)" and are selectable via dropdown only.
- [ ] **6.6 Same-node rejection** — try to set destination = origin → inline error "must be different nodes."
- [ ] **6.7 Clear** — ✕ buttons clear each endpoint and clear stale errors.

## 7. Route configuration

- [ ] **7.1 Algorithm selector** — Dijkstra/A*/QPSO radio cards; descriptions accurate; QPSO described as quantum-inspired metaheuristic (no quantum-hardware claims).
- [ ] **7.2 Weights** — defaults 0.60/0.25/0.15 (alpha=time, beta=distance, gamma=congestion); sliders + numeric inputs sync; sum shown; **no sum-to-1 requirement**.
- [ ] **7.3 Weight validation** — set all three to 0 → all-zero error; negative → error; clear a field → retains last valid value (no silent 0/NaN).
- [ ] **7.4 QPSO controls** — only visible when QPSO selected; particles/maxIterations/seed/thetaStart/thetaEnd required-ish, optional maxSteps/timeBudgetS/stagnationIters; thetaEnd > thetaStart → error.
- [ ] **7.5 Endpoint preservation** — change algorithm after selecting endpoints → selections retained; QPSO params preserved when toggling away and back.

## 8. Single-algorithm optimization

- [ ] **8.1 Run (Dijkstra)** — endpoints + valid config → "Run optimization" → status QUEUED → RUNNING → COMPLETED; result panel shows distance/time/congestion/objective/runtime + route node path; green route polyline on map.
- [ ] **8.2 Run (A*)** — same flow; result comparable.
- [ ] **8.3 Run (QPSO)** — same flow + QPSO metadata block (seed, iterations, repair, rates) shown.
- [ ] **8.4 Infeasible** — pick endpoints with no path (or close connecting edges) → "No feasible route" message, no polyline, no crash.
- [ ] **8.5 Duplicate prevention** — while job active, button disabled; no second submission.

## 9. Three-algorithm comparison

- [ ] **9.1 Compare** — "Compare algorithms" → three jobs submitted sequentially (network tab shows 3 POSTs to `/scenarios/:id/jobs`), panel shows DIJKSTRA/ASTAR/QPSO cards.
- [ ] **9.2 Independent results** — each card reaches its own status; metrics populate per card; QPSO card shows metadata, others don't.
- [ ] **9.3 Route overlays** — all feasible routes drawn in distinct colors (blue/amber/purple); "Map" checkbox per card toggles visibility.
- [ ] **9.4 Partial failure** — *(if reproducible)* one algorithm fails → its card shows error, others still display results.
- [ ] **9.5 Graph version** — panel header shows `graph vN`; editing scenario mid-comparison triggers drift warning *(edge case — may skip if impractical)*.

## 10. Resilience & recovery

- [ ] **10.1 Backend down** — stop backend, submit job → friendly error, no crash; restart → retry works.
- [ ] **10.2 Optimizer down** — job reaches FAILED/TIMEOUT with error message on card.
- [ ] **10.3 Session expiry** — let JWT expire mid-poll (or tamper) → "session expired" message, polling stops.
- [ ] **10.4 Slow job** — large QPSO config → "taking longer than expected" + "Check again" resumes without duplicate submission.
- [ ] **10.5 Refresh mid-job** — F5 during RUNNING → page reloads, job state resets (job history not persisted in UI — expected).
- [ ] **10.6 Scenario switch** — navigate to another scenario's planner → all selection/job/result state resets cleanly.

## 11. Sign-off

| Field | Value |
|---|---|
| Date | ____________ |
| Tester | ____________ |
| Browser(s) | ____________ |
| Environment | local / staging / prod |
| Frontend commit | ____________ |
| Backend commit | ____________ |
| Unresolved issues | ____________ |

**Approval**: ☐ Phase 5 frontend accepted for release candidate
