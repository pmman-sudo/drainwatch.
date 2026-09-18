# DrainWatch: basic submission protection

Implemented for the existing Northflank API and Vercel frontend. No new account,
paid service, dependency, environment variable or database migration is required.
Your DATABASE_URL, CORS_ORIGINS and MAX_REPORTS settings continue to apply.

## Protections

- A shared ceiling of 30 saved reports in any rolling 10-minute window across
  ALL visitors. Further submissions receive HTTP 429 with Retry-After seconds.
  Viewing reports, health checks, the map and planning remain available.
- Identical reports repeated within 15 minutes receive HTTP 409. Text comparison
  ignores case, repeated whitespace and equivalent Unicode forms; coordinates
  are rounded to six decimal places. Different observations remain permitted.
- A hidden website field rejects simple bots that fill every input (HTTP 400).
  It is excluded from keyboard navigation and accessibility reading order and
  is never stored or included in public report responses.
- Submission bodies over 16 KiB receive HTTP 413 before JSON parsing, including
  streamed requests or requests with incorrect Content-Length headers.
- The existing field validation and 2,000-report default lifetime cap still apply.
- The form shows clear rejection messages and preserves the entered report.

## Implementation and limitations

The existing report_budget row update serializes submission decisions inside
one database transaction. Rejected duplicates and rate-limited requests roll
back the reserved slot. Recent saved report timestamps enforce the rolling
window and survive service restarts. PostgreSQL uses its default READ COMMITTED
isolation; the tests run with a temporary SQLite database.

This is basic prototype protection, not CAPTCHA, authentication, moderation or
DDoS protection. The rate ceiling is shared, not per user or IP. An attacker can
still use the available slots and temporarily delay genuine submissions, and
bots can leave the hidden field blank or change report contents. These safeguards
bound new records, not all incoming traffic. No visitor IP addresses are stored
or trusted for these checks. A per-user or verified challenge system and edge
traffic limits would be separate enhancements for broader use.

No existing database tables or observations are removed or changed.
Both deployment orders work: the new API accepts the old form, and the new form
omits an empty website field so legitimate submissions work on the old API.
Protection is active only after the new backend deployment is running.

## Validation completed

8 automated backend tests passed using an isolated SQLite database. They cover
normal scoring, validation and lifetime quota; hidden-field rejection; duplicate
normalization and restart persistence; rate-window expiry; read availability;
CORS on rejection responses; oversized and streamed bodies; and concurrent
submissions competing for the same duplicate or final rate-window slot.
The Vite production build also passed. No spam test traffic was sent to the live
site. PostgreSQL and live browser validation must be completed after deployment.

## Local checks (PowerShell, from your drainwatch project root)

Backend:

cd backend
python -m pip install -r requirements-dev.txt
python -m pytest -q
cd ..

Use your existing backend virtual environment for these Python commands.
Tests use a temporary database, not your saved application reports.

Frontend:

cd frontend
npm.cmd run build
cd ..

## Live check after both deployments are ready

1. Submit one fictional report named DEMO - Spam protection check. Use category
   Blocked drain, Partial blockage, no standing water, no nearby buildings,
   latitude 6.3380 and longitude 5.6070. Description:
   Fictional test of duplicate protection; not a verified drainage incident.
2. Confirm it saves once with score 25 and Low priority.
3. Within 15 minutes submit precisely the same values again. Expect a clear
   duplicate warning and no increase in the report total.
4. Refresh the dashboard. Confirm your existing Junction A report is still there.
5. Test rate limits only locally using pytest; do not fill the shared live quota.

If a build fails, inspect its logs before retrying. For rollback, restore the
three replaced files from the backup described in INSTALL.txt, remove the new
backend/app/spam.py, commit those changes and push. Retain your database and
Northflank environment settings.
