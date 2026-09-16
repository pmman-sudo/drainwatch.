# DrainWatch — three-day hackathon build

Community drainage observations → explainable review priorities → cleanup scenarios → response briefs.

This is the runnable Day 1 foundation, not the final hackathon submission. The current system uses transparent rules, not AI. It is not a validated flood forecast. Do not present scenario score changes as floods prevented or people protected.

## Start on Windows (PowerShell)

Extract the download so this file is at `C:\Users\USER\drainwatch\README.md`. If you extract elsewhere, change the paths below. Open this folder in VS Code.

Prerequisites: Python 3.12 and Node.js 22.12+ or Node.js 24, including npm. Check `python --version` and `node --version` first. Git is needed when publishing the repository.

Terminal 1 — backend:

```powershell
cd C:\Users\USER\drainwatch\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The direct Python path avoids PowerShell activation-policy problems. Keep the terminal running. Open http://localhost:8000/health — expect `status: healthy`. Interactive API documentation: http://localhost:8000/docs.

Terminal 2 — frontend:

```powershell
cd C:\Users\USER\drainwatch\frontend
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:5173. Use `npm.cmd` on Windows if PowerShell blocks npm.ps1. Frontend environment variables are public: never put API keys or database passwords in `VITE_` variables.

## First walkthrough

1. Submit a clearly fictional observation with location `DEMO — junction A`, coordinates 6.3350, 5.6037, and description `Fictional demo: plastic waste obstructs the drain.`
2. Select full blockage, standing water and nearby buildings. The score is 100, High priority.
3. The dashboard should show one report. Refresh the browser; it remains saved.
4. Open Planning lab. With complete blockage removal, the scenario score becomes 50 because the other reported conditions remain unchanged.
5. Download the scenario brief. No additional hosting service or AI request is used.

The coordinates are illustrative and not evidence of an actual incident. Do not submit personal details. The location button asks browser permission and is optional.

## Implemented

- React/Vite frontend with Tailwind integration and responsive custom styling.
- Report form with input validation, optional device location, errors and loading states.
- FastAPI and SQLAlchemy; local SQLite by default, PostgreSQL via DATABASE_URL.
- Persistent reports, aggregate dashboard counts and latest-100 display with priority filters.
- Explainable rule-based score: none/partial/full blockage adds 0/25/50; standing water 30; nearby buildings 20. High >=70, medium >=30, otherwise low.
- Planning lab: equal-effort hypothetical cleanup of 1–10 sites, ranking removable blockage points, then reported score. Downloads a plain-text brief in the browser.
- Atomic 2,000-report database cap, bounded input lengths and paginated API.
- Backend Dockerfile, configuration examples and a persistence/validation/quota integration test.

## Still to build before submission

- Interactive map with distinct report pins, source attribution and priority filtering.
- Nearby-report duplicate handling: the scenario currently assumes distinct sites.
- A small set of visibly labeled demo observations and a recorded end-to-end walkthrough.
- Public-write abuse protection and request limits. The record cap alone does not prevent bandwidth or CPU exhaustion.
- Live PostgreSQL deployment verification, browser checks, final pitch and Devpost materials.
- Optional real AI feature only after a provider's Nigeria availability, free quota and billing behavior have been checked. Do not rename deterministic templates as AI.

## Three-day roadmap (approximately 15–18 focused hours)

| Day | Work | Completion checkpoint |
| --- | --- | --- |
| 1 | Run this starter; understand the data flow; test a report and scenario; create GitHub repository; verify hosting account and its $0 resource estimates; deploy /health early | A report survives refresh and the API is reachable |
| 2 | Add React Leaflet map, duplicate awareness, explainable candidate rankings, demo observations; improve scenario presentation and brief; add capped AI explanation only if a verified free route is available | One convincing flow: report → map → inspect → compare → brief |
| 3 | Deploy frontend and PostgreSQL-backed API; verify idle responsiveness, persistence, mobile layout and abuse controls; finish README; record <=5-minute video; submit with time to spare | Public links work from another browser, repository and demo are submitted |

If time runs short, prioritize a working deployed flow, honest evidence and a polished demo. AI integration is optional; the app must stay useful when it is disabled.

## Proposed hosting configuration (not deployed)

Frontend: Vercel personal Hobby project, root `frontend`, build `npm run build`, output `dist`; set `VITE_API_URL` to the public backend URL before building.

Backend: Northflank Developer Sandbox on Northflank managed cloud. Use one combined build/deploy service, root/build context `backend`, Dockerfile `Dockerfile`, port 8000, health path `/health`, one process/replica. Verify that the selected resource is included at $0; a generic compute plan with a monthly price is not automatically free.

Database: one included PostgreSQL addon. Set its connection string privately as backend `DATABASE_URL`. Set `CORS_ORIGINS` to the exact deployed frontend origin, without a trailing slash, and `MAX_REPORTS=2000`. SQLite is for local development; do not depend on container-local SQLite for a public deployment. Keep the database private where supported. Never commit credentials.

Before public launch add abuse protection. This starter has no accounts, moderation, deletion UI or write authentication. CORS is not access control. Do not collect personal information. Only the single-process configuration is supported for initial quota-table creation.

## Verify locally

From backend:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

From frontend:

```powershell
npm.cmd run build
```

The included Python lock records the tested development environment. The Dockerfile installs production requirements only. PostgreSQL and Docker runtime behavior still require deployment testing.

## File guide

- `backend/app/main.py`: schema, storage, API, scoring and report budget.
- `backend/tests/test_reports.py`: persistence, input-validation and budget integration test.
- `frontend/src/main.jsx`: dashboard and report form.
- `frontend/src/Planner.jsx`: scenario calculation and browser-generated brief.
- `frontend/src/style.css`: responsive visual design.
- `RESOURCE_BUDGET.md`: cost controls and remaining checks.

## Technical references

- Vite setup: https://vite.dev/guide/
- Tailwind Vite integration: https://tailwindcss.com/docs/installation/using-vite
- FastAPI CORS: https://fastapi.tiangolo.com/tutorial/cors/
- Northflank pricing: https://northflank.com/pricing
- Northflank billing: https://northflank.com/docs/v1/application/billing/pricing-on-northflank

Check platform pricing and account-specific quotas at deployment time. Free software does not guarantee free third-party usage or zero downtime.
