# DrainWatch — budget comparison upgrade

This update replaces the original equal-effort, site-count scenario with a comparison of two review plans under one illustrative effort budget. It is a frontend change; the report API, PostgreSQL data, submission form, map, and spam controls are unchanged. No new service, package, environment variable, database migration, or paid API is needed.

## Behavior

- Saved reports are the default source; up to 100 loaded observations are considered.
- Only Partial and Full blockage reports are candidates. Their removable blockage contributions remain 25 and 50 points.
- Saved candidates default to 2 effort units each. Estimates are editable integers from 1 to 10; no duration or cost is inferred from severity.
- The available budget is an integer from 1 to 30. Neither plan can exceed it.
- Strategy A visits candidates by original score (highest first), then removable points, then lexicographic report ID. It takes each affordable candidate and continues after unaffordable ones.
- Strategy B uses exact 0/1 knapsack dynamic programming, so a report is never reused. It maximizes summed removable points; ties use combined original score, lower effort, then sorted lexicographic report IDs.
- Both cards show points, units used/unused, selected report count, high-priority selection count, and report-level scenario scores.
- Each candidate exposes its inclusion/exclusion reason. The higher-decrease strategy is not described as the safer or more urgent plan.
- Estimates are local component state; they reset when navigating away or reloading. Switching between saved and fictional sources preserves each source's estimates while the planner remains open. The budget is shared between sources.
- The export contains both plans, all estimates, selection reasons, the data source, timestamp, and assumptions.

## Demonstration without database writes

Select **Try fictional example** and keep the budget at **4**. These five invented observations have no real incident coordinates and are never sent to the API.

| Fictional report | Original score | Blockage | Effort | Removable points |
| --- | ---: | --- | ---: | ---: |
| Junction A | 100 | Full | 4 | 50 |
| Junction B | 55 | Partial | 1 | 25 |
| Junction C | 45 | Partial | 1 | 25 |
| Junction D | 25 | Partial | 1 | 25 |
| Junction E | 80 | Full | 5 | 50 |

Expected comparison:

- A selects Junction A: 4 units, 50 illustrative points, 1 High report.
- B selects B/C/D: 3 units, 75 illustrative points, 0 High reports.
- The difference is 25 illustrative points; one unit remains unused in B because no remaining candidate fits.
- Change Junction A's effort to 1: both plans select A/B/C/D, use 4 units, and reach 125 illustrative points.
- Reset estimates to restore the example. At budget 7, both plans can select A/B/C/D for 125 points.
- Download the brief; its filename and source line explicitly identify the fictional example.
- Switch back to Saved reports: fictional examples never appear in the dashboard or database.

## Assumptions and limits

Units are illustrative estimates, not measured work hours or costs. Full blockage removal is assumed; standing-water and nearby-building contributions remain unchanged. Each observation is assumed to be a distinct site. Nearby/overlapping reports are not automatically merged. Actual effort, access, travel, rainfall, and drainage connections need professional assessment and are not modeled here.

The comparison is decision-support exploration, not a work order or flood model. A larger score decrease does not establish greater safety, urgency, or environmental benefit. Do not enter drains or floodwater; refer observations to authorized maintenance teams for verification.

## Automated checks

From the repository root:

```powershell
node --test frontend/tests/planning.test.js
```

Ten tests cover the demonstrable trade-off, edited estimates, excluded candidates, empty/zero-budget cases, unaffordable higher scores, deterministic ties, 100 candidates, input validation, unchanged data, and brief contents. An independent exhaustive-subset oracle checks 60 seven-report fixtures across 13 budgets: 780 combinations. All ten tests passed.

From `frontend`:

```powershell
npm.cmd run build
```

The Vite production build passed. New packages are not required.

## Installation and rollback

The download's `INSTALL-PLANNING.ps1` validates the package and existing Planner.jsx, backs up affected files outside the project, copies the update, and runs the planner tests and build. It does not commit, push, or deploy.

Keep the printed backup path. It contains `Restore-Planning.ps1`, which restores the previous versions and removes only new files introduced by this update. Run it before making unrelated edits to those files. If you already pushed the upgrade, commit and push the restored files to redeploy the previous version; no database changes are required.
