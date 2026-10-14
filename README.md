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

### Deploy

Push to GitHub. Vercel builds with `npm run build`. Before the first deploy (and after any schema change), run `npm run db:migrate` once with the production `DATABASE_URL` (`npx vercel env pull .env.local --environment=production`, then migrate).

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

`lib/config.ts` holds the plant time zone, the shift times (A 06:00 to 14:00, B 14:00 to 22:00, C 22:00 to 06:00), the hold warning (30 minutes) and the sample-data threshold. Shifts are always worked out in the plant time zone; a session belongs to the shift in which it started.

## Tests

The Playwright tests cover scenarios 1 to 6 in `docs/scenarios.md`, plus refresh-resumes, offline-queues-saves and save-fails-retry. They run against a production build with `FL_STORAGE=memory`, so they never touch the database.

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

Logins and the supervisor dashboard are not built. Sessions carry a free-text Quality Technician label, and the summary tables are shaped for a dashboard to read.

## Environment variables

| Name | Where | What |
|---|---|---|
| `DATABASE_URL` | Vercel project, `.env.local` | Neon Postgres connection string. Required, except in tests. |
| `FL_STORAGE` | tests only | `memory` keeps sessions in server memory instead of Postgres. |
