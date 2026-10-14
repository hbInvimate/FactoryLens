# FactoryLens AI

A Quality Technician runs the first-off check of a B-pillar outer on checking fixture FX-014. FactoryLens AI follows the 12-step SOP, catches mistakes from what she taps, and lets her lodge discrepancies about the part or the fixture. It never measures, never judges a reading, never decides tolerance and never releases the cell. Readings go on the tablet.

The reference pack is in [`docs/`](docs/README.md): the SOP, the scenarios, the 54-issue catalogue and the screen images that the UI follows.

## Pages

| Path | What it is |
|---|---|
| `/` | Start a check (part, cell and fixture, Quality Technician label). Offers to resume a check in progress on this device. |
| `/check/[id]` | The live check. |
| `/sessions` | History of every check. |
| `/sessions/[id]` | One check: its steps, deviations with times, lodged discrepancies and handoff. |
| `/dashboard` | Supervisor dashboard for one station: tiles, four analytics blocks, sessions table. |
| `/dashboard/[id]` | Session report: steps, what went wrong, discrepancies, hold, print to PDF. |

## Supervisor dashboard

Read-only. It reads the sessions saved in Neon and never shows measured values or judges the part. No logins yet: anyone with the link can open it, so use test data only.

- **Stations.** "Cell and fixture" on the start form is a list of stations with "Add a station"; the list starts with "Laser cell 3 · FX-014" (`stations` table). Older sessions keep their typed text, which is also their station.
- **Filters** (kept in the URL): station, date range (7, 30, 90 days, all), shift (All, A, B, C) and "Include sample data". They apply to the tiles, the four blocks and the sessions table.
- **Tiles:** sessions (complete, on hold, ended without a check, left), open holds with the oldest waiting time, station conformance, share with no deviation, average check time, open discrepancies.
- **Blocks** (database group-by queries in `lib/server/analytics.ts`):
  1. Conformance per day (plant time), with the overall figure and the number of sessions.
  2. Average and median check time by shift, all three shifts side by side; "Low volume" under 5 sessions.
  3. Top 5 steps by deviations, with the exact points (H9, "C4 before C3"); click a step to filter the table.
  4. Lodged discrepancies by category (`docs/dashboard/issue_categories.json`) and the shift in which each was lodged; "fixed on the spot" separately.
- **Who is scored.** Conformance = steps correct on the first attempt ÷ 12, for **complete** sessions only. Sessions on hold, scrapped, sent for rework, conceded, part held or left are never scored and never in conformance or check-time averages. Check time = start to step 12, minus pauses and stop holds.
- **Session report** (`/dashboard/[id]`): header, four stat cards, outcome banner, every step in order, "What went wrong" (one card per deviation with the exact points, and a clip placeholder next to the reference), "Discrepancies lodged", "Hold" (reason, who was called, waiting time, decision). "Export report (PDF)" opens the print dialog: A4 portrait, no menus or buttons, cards kept whole, "Printed on" and a SAMPLE DATA mark on sample sessions. "Back to the dashboard" keeps the filters.

### How a hold is closed

A lodged issue puts the session (if the check stops) or the cell (if it continues) on hold. On the hold screen in the check app the Quality Technician records the decision made by others: **Record the decision and close the hold** → outcome (Cleared, the check continues; Part scrapped; Sent for rework or sorting; Concession approved; Check abandoned), decided by (Process engineer, Shift supervisor, Quality), a reason (required) and the time. "Cleared" resumes the check at the same step; every other outcome ends the session with that outcome. The app never decides. Waiting time turns red on the dashboard after 30 minutes (`HOLD_WARN_MINUTES`).

## Set up

You need Node.js 24 (or 22.18 or later) and npm.

1. **Install.**

   ```bash
   npm install
   ```

2. **Create the database.** In the Vercel dashboard, open the project, then **Storage** → **Create Database** → **Neon** (Vercel Marketplace) → connect it to this project for Development, Preview and Production. Vercel adds `DATABASE_URL` to the project's environment variables.

3. **Get `DATABASE_URL` locally.** Either pull it from Vercel:

   ```bash
   npx vercel link        # once, if the folder is not linked yet
   npx vercel env pull .env.local
   ```

   or copy `.env.example` to `.env.local` and paste the Neon connection string. `.env.local` is git-ignored. Never commit it.

4. **Create the tables.**

   ```bash
   npm run db:migrate
   ```

   This applies the SQL in `drizzle/` to the database in `DATABASE_URL`. It is safe to run again.

5. **Run.**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and tap **Start the check**.

### Before publishing

Run these in the project folder, in order. Every migration is additive and safe to run twice.

```bash
npm run lint
npm run build
npx playwright install chromium   # once per machine
npm run test:e2e
npx vercel env pull .env.local --environment=production
npm run db:migrate                # tables and columns on the production database
npm run db:backfill               # optional: older sessions get missed points, categories, check time
npm run db:clear-sample           # if sample data was seeded on this database
git push                          # Vercel builds and deploys
```

Then pull your development environment back (`npx vercel env pull .env.local`) so local runs do not use the production database.

### Change the schema

1. Edit `db/schema.ts`.
2. Run `npm run db:generate`. It writes a new SQL file in `drizzle/`.
3. Commit `drizzle/`, then run `npm run db:migrate`.

`npm run db:studio` opens Drizzle Studio on the database.

### Sample data and maintenance

| Command | What it does |
|---|---|
| `npm run db:seed-sample` | Adds about 60 FAKE sessions over the last 30 days, flagged `is_sample`. Safe to run twice. |
| `npm run db:clear-sample` | Removes only the sample sessions. Real sessions are never touched. Safe to run twice. |
| `npm run db:backfill` | Rebuilds every session's summary rows from its own action log, so older sessions get missed points, categories and check time. Safe to run twice. |

The dashboard's "Include sample data" switch is on by default while there are fewer than 10 real sessions.

### Plant settings

`lib/config.ts` holds the plant time zone (`PLANT_TIME_ZONE`, an IANA name such as "Europe/Berlin"; set it to the plant's real zone), the shift times (A 06:00 to 14:00, B 14:00 to 22:00, C 22:00 to 06:00, assumed), the hold warning (30 minutes) and the sample-data threshold (10 real sessions). Days and shifts are always worked out in the plant time zone, never in UTC; a session belongs to the shift in which it started, and a discrepancy counts in the shift in which it was lodged.

## Tests

The Playwright tests cover scenarios 1 to 6 in `docs/scenarios.md`, plus refresh-resumes, offline-queues-saves and save-fails-retry. They run against a production build with `FL_STORAGE=memory`, which uses PGlite, a real Postgres running inside the process and migrated from `drizzle/`. So the tests run the same SQL as Neon (including the dashboard's group-by queries and plant time zone) and never touch the database. `e2e/analytics.spec.ts` checks every dashboard number against a small fixed dataset.

```bash
npx playwright install chromium   # once
npm run build
npm run test:e2e
```

## How it works

- **One action log per session.** Every tap (a point, Next step, Fixed, continue, a lodged issue, a handoff item) is an action. `lib/check/reducer.ts` rebuilds the whole check from the log: skip detection, clamp order, attempts, conformance, discrepancies and hold. The browser and the server run the same reducer.
- **Never lose data.** Each action is written to `localStorage` first, then sent to `POST /api/sessions/[id]/actions` in batches. If the connection drops, a banner shows how many saves are queued and they are retried with backoff and on reconnect. If the server returns an error, a Retry button appears and the work stays on the device. Saves are idempotent, so a retry never duplicates anything.
- **Resume.** Refreshing or reopening `/check/[id]` loads the local copy first and merges anything the server has. The start page offers to resume the active check.
- **Tables.** `session_actions` is the append-only journal. On every save the server rebuilds `sessions`, `step_events`, `point_confirmations`, `discrepancies` and `handoff_items` from it, in one batch.
- **Mistakes without AI.** Steps 5 to 11 show point grids. Next step with points unconfirmed raises "Step N skipped"; a clamp tapped out of order raises "wrong order". Undo works for 10 seconds on ordinary taps; a tap that raised a deviation stays on the record.

### Seams for later

`lib/integrations.ts` defines the interfaces for what is out of scope in version 1:

- `DeviationSource`: a video model will report the same observations as taps, so the same rules raise the same deviations.
- `CallService`: calls are reminders until the plant call or andon system is linked.
- `ClipStore`: clips are placeholders until video capture exists.

Logins are not built. Sessions carry a free-text Quality Technician label.

## Environment variables

| Name | Where | What |
|---|---|---|
| `DATABASE_URL` | Vercel project, `.env.local` | Neon Postgres connection string. Required, except in tests. |
| `FL_STORAGE` | tests only | `memory` runs on PGlite, an in-process Postgres, instead of Neon. Only then may a test mark a session as sample (`x-fl-sample` header). |
