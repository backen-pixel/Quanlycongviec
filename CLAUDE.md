# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation map (canonical)

Full docs live under `docs/` — see [`docs/README.md`](./docs/README.md) and [`AGENTS.md`](./AGENTS.md).

| Topic | Path |
|---|---|
| Architecture | `docs/architecture/` |
| ADR | `docs/adr/` |
| BA / guides | `docs/ba/` |
| API inventory | `docs/api/API_DOCUMENT.md` |
| DB schema | `docs/database/DATABASE_SCHEMA.md` |
| SQL migrations | `/database/*.sql` |
| Coding standard | `docs/project/CODING_STANDARD.md` |
| Claude↔Cursor workflow | `docs/project/workflow-claude-cursor-github.md` |

## Project Overview

Vietnamese-language ERP/CRM system for cabinet manufacturing companies ("Tủ Bếp"). Manages the full lifecycle: CRM leads/deals → production projects → logistics → accounting. Deployed on Render, backed by Supabase (PostgreSQL).

## Development Commands

```bash
# Backend (Express.js, port 4000)
cd backend && npm run dev          # --watch mode, auto-reload

# Frontend (React + Vite, port 5173)
cd frontend && npm run dev         # Vite dev server, proxies /api → :4000

# Build frontend for production
cd frontend && npx vite build      # Output → frontend/dist

# Full production build (from backend dir)
npm run build:frontend             # Builds frontend then npm ci backend

# Run backend smoke test
npm run test:cache
```

Both servers must run simultaneously. Vite proxies `/api` and `/socket.io` to `localhost:4000`.

## Architecture

### Stack
- **Backend**: Express 5 + Node.js ≥18, CommonJS (`require`). Entry: `backend/src/server.js`
- **Frontend**: React 18 + Vite, ESM. Entry: `frontend/src/App.jsx`
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`. No ORM — all queries use Supabase client directly
- **Realtime**: Socket.IO (optional Redis adapter for multi-instance)
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite` plugin, no config file)
- **Deployment**: Render web service. Backend serves `frontend/dist` as static in production

### Backend Structure

**Route mounting** (`server.js` lines 280–330): All routes under `/api/*`. Key prefixes:
- `/api/crm` — CRM pipeline, leads, deals, tasks, attachments, org reports (composed from `routes/crm/`; thin entry `routes/crm.js` → `routes/crm/index.js`)
- `/api/production`, `/api/logistics` — Workshop modules (Sản xuất, Vận chuyển)
- `/api/workshop` — Project type classifications per company
- `/api/auth` — JWT authentication (token in `localStorage`, verified via `middleware/auth.js`)
- `/api/external` — Public API endpoints (API key auth, not JWT)

**Middleware**:
- `middleware/auth.js` — JWT verification, company_id resolution, auto-logout at midnight VN time
- `middleware/newPermission.js` — RBAC via Supabase RPC `user_has_permission(user_id, resource, action)`

**Supabase failover** (`config/supabaseRouter.js`): Proxy pattern — `require('config/supabase').supabase` returns the active client (primary or backup). Health checker probes every 15s. All code imports `supabase` from `config/supabase.js`.

### Frontend Structure

**Routing** (`App.jsx`): React Router v6. Main sections:
- `/crm/*` — CRM module (dashboard/kanban, leads, deals, quotations, invoices, reports)
- `/sx/*` — Production module (nested under `ProductionLayout`)
- `/vc/*` — Logistics module (nested under `ProductionLayout`)
- `/ketoan/*` — Accounting module
- `/drive` — File management
- `/knowledge` — Training/knowledge base

**Auth** (`lib/auth.jsx`): `AuthProvider` context. Token + user object stored in `localStorage`. `useAuth()` hook everywhere.

**API client** (`lib/api.js`): Axios instance with `baseURL = origin + '/api'`. Interceptors auto-attach JWT token and activity context (device_id, geo).

**Large page files**: `CRMDashboard.jsx` (~9K lines) contains KanbanView, KanbanStageCard, KanbanCard components inline. CRM backend routes live under `backend/src/routes/crm/` (`index.js` composition root + `routes/*.js` feature modules + `shared/helpersBundle.js`). Edit the feature module matching the endpoint cluster, not a monolith.

### Role & Permission System

Roles defined in `helpers/adminRole.js`:
- `admin` (no company_id) → system admin, sees all companies
- `admin` (with company_id) → company-scoped admin
- `sales_admin` → always company-scoped, admin-like but restricted
- Regular users → permission checked via `user_has_permission` RPC

Key helpers: `isAdminLike()`, `isSystemAdmin()`, `isCompanyScopedAdmin()`, `isProductionStaff()`, `isProductionAdmin()`

### Data Model Concepts

- **Companies** have pipelines, regions, departments, users
- **CRM Pipeline**: `crm_pipelines` → `crm_pipeline_stages` (with `is_won`, `is_lost`, `show_sx_transfer` flags) → `crm_leads` (table name for both leads AND deals; `type` column = `'lead'` or `'deal'`)
- **Won anchor**: `resolveDealWonAnchorStage()` finds the stage with `is_won=true` + max `order_index`. Deals before anchor = "deal", at/after = "customer order" (when split mode enabled via `dealKhSplitEnabled`)
- **Production projects**: Created from won deals via `autoCreateProject`. Linked by `crm_leads.project_id`
- **Tasks**: `crm_tasks` (CRM tasks on deals), `tasks` (production tasks on projects). Attachments in `crm_task_attachments` / `file_attachments`

### Key Patterns

**Filter persistence**: CRM kanban uses `crmPipelineStorage.js` (sessionStorage + localStorage). Production uses `LS_SX` key. Org report uses `LS_ORG_REPORT` key. All persist time filters across browser sessions.

**Excel export**: Uses ExcelJS library (`crmOrgEmployeeExcelExport.js`) for KPI reports, `xlsx` library for simpler exports.

**Lazy loading**: Pages use `lazyWithRetry()` wrapper for chunk-error resilience on deploys.

## Database Migrations

SQL files in `database/` directory (400+ files, numbered). Run manually via Supabase Dashboard SQL Editor or Management API. No automated migration runner.

To add a column, use the Supabase Management API:
```js
fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
  body: JSON.stringify({ query: 'ALTER TABLE ...' }),
});
```

## Important Conventions

- All UI text is in **Vietnamese**
- Table `crm_leads` holds both leads AND deals (distinguished by `type` column, NOT a separate `leads` table)
- Pipeline stage order uses `order_index` column (NOT `order`)
- CRM routes: search under `backend/src/routes/crm/routes/` by cluster (pipelines, leadLifecycle, commercialDocs, …); shared helpers in `crm/shared/`
- When adding a new field to `crm_pipeline_stages`, also update the PUT route's whitelist in `crm/routes/pipelines.js` (look for `forEach(f =>`)
- `supabase.from('table').select('*')` returns all columns — new DB columns are automatically available in API responses
- Git: avoid committing files in `backend/uploads/_clone/` (large dump files). Already in `.gitignore`
