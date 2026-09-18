# DrainWatch

**See the issue. Start the response.**

DrainWatch is a community drainage reporting and planning prototype. It turns observations of blocked drains, waste buildup, and standing water into an interactive map, explainable review priorities, and downloadable cleanup scenario briefs.

[Live demo](https://drainwatch-nine.vercel.app) · [Source code](https://github.com/pmman-sudo/drainwatch.) · [API documentation](https://p01--drainwatch-api--v8qxqym2945f.code.run/docs)

## Why DrainWatch?

A drainage observation becomes more useful when reviewers can locate it, understand the reported conditions, and compare it with other observations. DrainWatch brings those steps into one workflow, designed to support community reporting and local maintenance review.

The **Cleanup Planning Lab** asks: *which reported sites fit a limited effort budget, and what changes when the selection strategy changes?* Users assign illustrative effort estimates, compare highest-priority-first selection with a combination that maximizes removable blockage points, and export both plans without changing saved observations.

> DrainWatch uses transparent rules. Scores are review priorities, not flood probabilities. Reports are unverified, and scenario score changes are not measured reductions in flooding or estimates of people protected.

## Features

| Feature | What it does |
| --- | --- |
| Community reporting | Captures location, issue type, blockage level, standing water, nearby buildings, and coordinates, with optional device location. |
| Dashboard | Shows aggregate counts and the latest 100 reports, with High, Medium, and Low priority filters. |
| Interactive map | Displays priority-colored report markers, report inspection, filters, and a fit-to-reports control. The street background can be switched off. |
| Explainable scoring | Calculates a reproducible score from three reported conditions. |
| Cleanup Planning Lab | Compares two strategies under a 1–30 unit budget, with editable estimates, selection explanations, a fictional example, and an exported comparison brief. |
| Persistent storage | Uses PostgreSQL in the deployed service and SQLite by default for local development. |
| Submission safeguards | Applies duplicate detection, a shared submission limit, a hidden bot-trap field, request-size limits, and input validation. |
| Deployment workflow | Connects the GitHub main branch to Vercel and Northflank for automatic builds and deployment. |

## How priority scores work

The backend calculates the score; users do not submit their own score or priority.

| Reported condition | Points |
| --- | ---: |
| No drain blockage | 0 |
| Partial drain blockage | 25 |
| Full drain blockage | 50 |
| Standing water present | +30 |
| Nearby buildings present | +20 |

Blockage contributes one of the first three values. The total ranges from **0 to 100**.

| Priority | Score |
| --- | --- |
| High | 70–100 |
| Medium | 30–69 |
| Low | 0–29 |

For example, full blockage with standing water and nearby buildings scores **100 — High**. These are prototype rules, not a scientifically calibrated flood-risk model.

### Planning strategies and assumptions

The Planning Lab considers the latest 100 loaded reports with partial or full blockage. Each saved report starts with an illustrative estimate of **2 effort units**, editable from **1 to 10**. These defaults are not inferred from severity or measured work. The shared budget ranges from **1 to 30 units**.

- **Highest priority first:** considers reports in descending original-score order and takes each one that fits the remaining budget. Ties use larger blockage contribution, then report ID.
- **Largest score decrease:** uses exact 0/1 knapsack selection to maximize total removable blockage points within the same budget. Ties favor higher combined original score, lower effort, then report IDs. Each report can be selected only once.

The comparison shows selected reports, effort used and unused, illustrative score decrease, and the number of high-priority reports selected. A larger decrease does not establish a safer or more urgent real-world plan.

**Try fictional example** loads five clearly labeled observations in the browser. At a budget of four units, Strategy A selects one High report for a 50-point decrease; Strategy B selects three lower-priority reports for a 75-point decrease. The example never creates public reports. Changing Junction A's effort estimate from four to one makes both strategies reach 125 points with four selected reports.

Each scenario assumes every report represents a distinct site and its blockage is completely removed. Standing-water and nearby-building flags remain unchanged. A report scoring **100** therefore becomes **50** in this hypothetical scenario. Saved reports are never modified. Scenario estimates reset when leaving the Planning Lab or reloading.

Travel time, actual work costs, rainfall, drainage connectivity, and verified outcomes are not modeled. Reports describing the same physical site are not yet grouped. See [PLANNING_UPGRADE.md](PLANNING_UPGRADE.md) for the comparison model and verification guide.

## Architecture

| Layer | Technology | Deployment |
| --- | --- | --- |
| Frontend | React, Vite, Tailwind CSS, custom responsive CSS | Vercel |
| Mapping | React Leaflet, Leaflet, OpenStreetMap street tiles | Browser |
| API | FastAPI, Pydantic, SQLAlchemy | Docker container on Northflank |
| Database | PostgreSQL; SQLite for local development | Private Northflank PostgreSQL addon |
| Validation | pytest, FastAPI TestClient, Vite production build | Local development |

The browser reads and submits reports through the API. The API validates submissions, calculates scores, and stores accepted reports. Dashboard statistics come from the database; map rendering, scenario comparisons, and brief downloads run in the browser.

## Run locally on Windows

Use **Python 3.12**, **Node.js 22.12+ or 24**, npm, and Git. The commands below use PowerShell. If you already have the repository, open that folder in VS Code and skip cloning.

```powershell
git clone https://github.com/pmman-sudo/drainwatch..git drainwatch
cd drainwatch
```

The two dots before `git` are intentional: the repository name ends with a dot.

### 1. Start the backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Using the virtual environment's Python directly avoids activation-policy issues. Keep this terminal running.

- [Health check](http://localhost:8000/health): returns `status: healthy` when the database check succeeds.
- [Interactive API docs](http://localhost:8000/docs): inspect endpoints and request schemas.

### 2. Start the frontend

Open a second terminal at the repository root:

```powershell
cd frontend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd ci
npm.cmd run dev
```

Open [the local app](http://localhost:5173). `npm.cmd` avoids PowerShell restrictions on `npm.ps1`. Existing environment files are preserved; check their values if you previously configured a different backend or database.

### Configuration

| Variable | Location | Purpose / local default |
| --- | --- | --- |
| `DATABASE_URL` | Backend | Database connection; `sqlite:///./drainwatch.db` by default. |
| `CORS_ORIGINS` | Backend | Comma-separated browser origins; local defaults include `http://localhost:5173` and `http://127.0.0.1:5173`. |
| `MAX_REPORTS` | Backend | Lifetime submission budget; defaults to `2000`. |
| `VITE_API_URL` | Frontend | API base URL; defaults to `http://localhost:8000`. |
| `VITE_MAP_TILE_URL` | Frontend, optional | Alternative street-tile URL template. |
| `VITE_MAP_ATTRIBUTION` | Frontend, optional | Attribution for the configured tile provider. |

Frontend `VITE_` values are public and included at build time. Keep database credentials in backend configuration only; rebuild the frontend after changing its environment values.

## Deployed configuration

The frontend is deployed at [drainwatch-nine.vercel.app](https://drainwatch-nine.vercel.app). The API and PostgreSQL database run on Northflank.

| Setting | Value |
| --- | --- |
| Vercel root directory | `frontend` |
| Framework / build / output | Vite / `npm run build` / `dist` |
| Frontend `VITE_API_URL` | `https://p01--drainwatch-api--v8qxqym2945f.code.run` |
| Backend Docker build context | `backend` |
| Dockerfile | `backend/Dockerfile` |
| Backend port | `8000` |
| Readiness check | HTTP `/health` on port `8000` |
| Backend `CORS_ORIGINS` | `https://drainwatch-nine.vercel.app` |
| Backend `DATABASE_URL` | Private PostgreSQL connection string, configured on Northflank |
| Runtime | One application process and one replica |

The Docker image runs as a non-root user and installs production dependencies from `requirements.txt`. Local setup uses `requirements-lock.txt`; the container does not currently use that lock file. Keep the single-process configuration for initial quota-table creation.

CORS permits the frontend's browser requests; it does not authenticate callers. Hosting availability and account quotas depend on the providers and selected resources.

## Try the workflow

Use clearly labeled fictional observations for demonstrations. Existing shared-demo totals may vary.

1. Submit a report named **DEMO — Test Junction A**, using coordinates `6.3350, 5.6037` and a description explicitly stating that it is fictional.
2. Select **Full** blockage, standing water, and nearby buildings. Expect **100 — High**.
3. Refresh the dashboard and inspect the report on the map. Try the priority filters.
4. Open the Planning Lab, adjust effort estimates and the shared budget, and compare both plans.
5. Select **Try fictional example** at four units to see **50 versus 75** illustrative points.
6. Download the comparison brief and inspect both plans, all estimates, and assumptions.

For a duplicate check, repeat a newly accepted fictional report with identical values within 15 minutes. Expect a duplicate warning and no additional saved report. Run rate-limit and concurrency tests locally rather than filling the shared demo's submission allowance.

Coordinates in demo reports are illustrative, not evidence of incidents. Use public landmarks and avoid personal information or private home addresses. Device location is optional and requires browser permission; submitted coordinates are publicly visible. Do not enter floodwater or drains; observations require verification by authorized maintenance teams.

## Basic spam protection

| Safeguard | Behavior |
| --- | --- |
| Duplicate submissions | Rejects matching reports within 15 minutes with HTTP `409`. Text is normalized and coordinates are compared to six decimal places. |
| Shared submission limit | Allows up to 30 saved reports in a rolling 10-minute window across all visitors; further submissions receive HTTP `429` with `Retry-After`. |
| Hidden bot-trap field | Rejects submissions with a populated `website` field with HTTP `400`; that field is not stored. |
| Request body limit | Rejects submission bodies larger than 16 KiB with HTTP `413` before JSON parsing. |
| Input validation | Enforces field lengths, supported values, and valid coordinate ranges. |
| Lifetime budget | Stops new submissions at the configured report cap while keeping existing reports readable. |

Duplicate and rate-window checks use saved database records and survive service restarts. Rejected duplicates and rate-limited requests do not consume report-budget slots.

These controls are basic prototype safeguards. The rate ceiling is shared, not per person or IP, and does not stop all abusive traffic. There is no CAPTCHA, user authentication, moderation queue, or DDoS protection. Exact-repeat detection does not merge nearby reports or recognize differently worded observations of the same incident.

See [SPAM_PROTECTION.md](SPAM_PROTECTION.md) for implementation details and test coverage.

## Testing and validation

From `backend`, after local setup:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

For an environment installed with production dependencies only, install `requirements-dev.txt` into the virtual environment first.

From `frontend`:

```powershell
npm.cmd run build
```

**Recorded validation:** eight automated backend tests passed using isolated SQLite storage, and the Vite production build passed. Coverage includes persistence, scoring, input validation, quotas, duplicate handling, rate-window expiry, hidden-field rejection, oversized and streamed bodies, and concurrent submissions.

Manual checks on the deployed app demonstrated report submission and retrieval, dashboard and map filtering, scenario comparison and brief download, and rejection of an identical repeat submission. Automated PostgreSQL integration tests and a complete mobile/browser compatibility pass remain outstanding. A successful build alone does not verify those behaviors.

### Planner checks

From the repository root (Node.js built-in test runner; no additional dependencies):

```powershell
node --test frontend/tests/planning.test.js
```

The planner has ten passing tests, including agreement with exhaustive subset search across 780 fixture/budget combinations, deterministic ties, invalid estimates, empty plans, 100-report input, unchanged source data, and comparison-brief content. The frontend production build also passed after this upgrade. The upgrade must still be installed and deployed before its behavior can be confirmed on the live site.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check application/database connectivity. |
| `POST` | `/reports` | Validate, score, and save a report. |
| `GET` | `/reports` | List reports with `limit`, `offset`, and optional `priority`. |
| `GET` | `/stats` | Return total and per-priority report counts. |

Report listing defaults to 50 results and permits up to 100 per request. The frontend loads the latest 100 reports; dashboard totals count all saved reports. Use the [API documentation](https://p01--drainwatch-api--v8qxqym2945f.code.run/docs) for request and response schemas.

## Project structure

| Path | Responsibility |
| --- | --- |
| `backend/app/main.py` | Models, persistence, scoring, API endpoints, and submission checks. |
| `backend/app/spam.py` | Report fingerprints and request-body size protection. |
| `backend/tests/test_reports.py` | Backend integration and concurrency tests. |
| `backend/Dockerfile` | API container image. |
| `frontend/src/main.jsx` | Application navigation, dashboard, and submission form. |
| `frontend/src/ReportMap.jsx` | Interactive map and report inspection. |
| `frontend/src/Planner.jsx` | Budget controls, effort estimates, and strategy comparison. |
| `frontend/src/planning.js` | Selection algorithms, fictional fixtures, explanations, and comparison export. |
| `frontend/src/planner.css` | Scoped planner styling. |
| `frontend/tests/planning.test.js` | Planner correctness and regression tests. |
| `PLANNING_UPGRADE.md` | Planner assumptions, test coverage, and demo walkthrough. |
| `frontend/src/style.css` | Responsive styling. |
| `SPAM_PROTECTION.md` | Submission protection design and verification guide. |

## Next improvements

- Group nearby observations to reduce double-counting of physical sites.
- Add moderation, report verification, and resolution tracking.
- Expand PostgreSQL integration tests and mobile/accessibility validation.
- Introduce stronger submission verification and traffic controls for broader public use.
- Calibrate illustrative effort estimates and scoring with verified data and maintenance-team feedback.

## Author and acknowledgements

Built by **Paul Iyen**.

Street-map data and default tiles are provided by [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), with attribution displayed in the map. Mapping uses Leaflet and React Leaflet. DrainWatch's current scoring and scenario logic are deterministic; no AI model or external AI service is required.
