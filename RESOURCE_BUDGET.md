# DrainWatch resource budget

Goal: build a compelling hackathon prototype with no paid services enabled by default. This is a design budget, not a guarantee against provider charges.

## Resource allocation

| Resource | Planned usage | Status |
| --- | --- | --- |
| Northflank services | 1 FastAPI service, one replica/process | Within advertised count of 2 free services; exact free compute must be checked in account |
| Northflank database | 1 PostgreSQL addon | Within advertised count of 1; storage allowance must be confirmed |
| Scheduled jobs | 0 | None required |
| Frontend | 1 Vercel Hobby personal project | Verify its bandwidth/build allowances at deployment |
| AI calls | 0 in the starter | No provider keys, paid calls or local models |
| Photo storage | 0 in the starter | No upload endpoint |
| Map tiles / geocoding | 0 in the starter | Map planned for Day 2; choose provider and honor its quota/attribution rules |
| Weather calls | 0 | No live-weather dependency |

## Controls already implemented

- Maximum 2,000 stored reports, configurable in backend MAX_REPORTS. Atomic reservation prevents concurrent requests exceeding the record limit. Once full, new reports receive 409; read endpoints continue working.
- Description length maximum 1,500 characters; location maximum 120 characters; category/blockage enums; finite valid coordinate ranges.
- Report endpoint returns at most 100 reports per request. UI loads latest 100; statistics cover all saved reports. Planner and UI filters apply to those loaded reports, not the entire database.
- No interval polling; frontend fetches on initial load, manual refresh and successful submission.
- Scenarios and brief downloads run in the browser and do not create API calls.
- No uploads, videos, external fonts, AI SDK or hosted model in this version.
- Local database is excluded from source control and deployment image.

## Controls required before public launch

1. Inspect account-specific free memory, database storage, network egress and build allowance. Record those exact values; do not substitute guesses from resource-count marketing.
2. Use only resources explicitly labeled free. Review the total estimate before deployment. Do not enable autoscaling, extra replicas, paid volumes, GPU, BYOC or paid addons.
3. Add write throttling and bot protection with server-side enforcement. Do not rely on browser controls or CORS. Read abuse can still consume resources even after the record cap is reached.
4. Track database size, memory and egress during demo testing. Review provider usage after deployments and demos. Billing notifications are alerts, not a hard spending ceiling.
5. If AI is added, verify a free tier with billing disabled; set an application request budget and cache each explanation. Disable the feature when its quota is exhausted. Provider outages must not break reports/maps/scenarios.
6. If photos are added, first choose verified free persistent storage, cap file size/count, and validate file content. Do not store photo bytes in the report database or container filesystem by default.

## Why this can be competitive

The central demonstration is decision support under limited capacity: which reported blockages could a response team review first, and why? Creativity comes from the useful scenario and evidence trail, not from deploying many services.

Demonstrate a local problem, distinguish community reports from verified observations, show every score contribution, explain scenario assumptions, and present the resulting brief. Gather one or two real user reactions if feasible and with consent. Do not invent endorsements or measured environmental outcomes.

## Known limits

Northflank's public pricing confirms the free service/database/job counts and no inactivity sleep. It does not establish every account-specific allowance needed for a guaranteed total bill. Provider limits, availability and sign-up eligibility must be checked in the actual account.

The initial API integration test uses SQLite. PostgreSQL, live hosting, map services, mobile browsers and abuse protection remain deployment milestones.

Sources checked during planning:
- https://northflank.com/pricing
- https://northflank.com/docs/v1/application/billing/pricing-on-northflank
- https://northflank.com/docs/v1/application/scale/increase-storage
