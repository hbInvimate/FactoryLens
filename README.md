# FactoryLens AI

A Quality Technician runs the first-off check of a B-pillar outer on checking fixture FX-014. FactoryLens AI follows the 12-step SOP, catches mistakes from what she taps, and lets her lodge discrepancies about the part or the fixture. It never measures, never judges a reading, never decides tolerance or pass/fail and never releases the cell. At steps 7 to 10 it records the values she types (voice comes next), labelled "not a validated record"; the tablet stays the validated record.

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
| `/signin` | Sign-in for the Quality Technician (the check app). |
| `/dashboard/signin` | Sign-in for the Quality Engineer (the dashboard). |

## Who signs in where

| Role | Signs in at | Can use |
|---|---|---|
| Quality Technician (`technician`) | `/signin` | The check app: `/`, `/check`, `/sessions` and their APIs. |
| Quality Engineer (`engineer`) | `/dashboard/signin` | The dashboard: `/dashboard` and the session reports. Sees every saved session. |
| Admin (`admin`) | Either page | Both. |

The value in brackets is the role stored in the database. `npm run user:create` asks for it. The Quality Engineer is the dashboard user. The Process engineer is a different person: the one called about a part problem, or who corrects the laser program. That name stays on the hold and handoff screens.

**Test mode.** With `FL_STORAGE=memory` the app runs on a temporary database inside the server. It starts empty, is cleared when the server stops, and never reads or writes Neon. Every page then shows `TEST MODE: data is temporary and is not saved to Neon`. Run `npm run dev` without `FL_STORAGE` to see the sessions saved in Neon.

## Supervisor dashboard

Read-only. It reads the sessions saved in Neon and never judges a value or the part. Recorded values are shown, as recorded, on `/dashboard/measurements` and in each session report. Only a signed-in Quality Engineer or admin can open it.

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

## SOP management

For the Quality Engineer and admin. **Update SOP** (`/dashboard/update-sop`, also the green button on the dashboard) lists the last finished real checks done correctly first time. "Use this way" on one runs the comparison below on that check, then shows what would change ("Not changed yet"). "Confirm and update SOP" applies all of it as the new Active revision, for new checks only; "Discard" changes nothing. Confirm is safe to retry: only one revision is ever activated. **SOP history** (`/dashboard/sop`) has the rest: The SOP has numbered revisions (A, B, C). Exactly one is Active, and new checks use it. Revision A is the SOP in `lib/sop.ts`, copied once into the database and never edited. A revision may change each step's text and target CT. It never changes the 12 steps or the check points.

- **See.** The check CT trend, and "Ways of working worth a look": a Quality Technician whose last 5 completed real checks were all at least 5% faster than the station median, with first-time correct not below the station's. Sample sessions never count.
- **Review this way.** One click builds Draft B from the Active revision and that technician's checks. It suggests a new step CT (their median, rounded up to 5 seconds) where they were at least 5% and 3 s faster in at least 80% of their checks. It suggests an order note for "What to do" where they confirm the points in another order. Accept, edit or reject each suggestion; nothing applies until accepted.
- **Decide manually.** `/dashboard/sop/new?step=N`: tick real evidence and decide the CT yourself.
- **Check again** (optional): tests the draft against the other completed real checks in the last 30 days. It never blocks.
- **Make this the primary way.** A confirm box lists the accepted changes. Write a reason, then click "Confirm and make primary". New checks use the new revision; running checks finish on the revision they started with. It is blocked only when any evidence is a sample session.
- **Roll back.** "Make this revision active again" on an older revision, with a reason. The other revision is retired; nothing is deleted.
- Quality Technicians see "SOP rev B is active. Step N changed: …" once, until they press "I have read this". Dashboard sessions show a revision chip; older sessions count as revision A.
- Every action is written to `sop_audit`. The settings are in `lib/config.ts`. `REQUIRE_SECOND_APPROVAL` is kept for later and not enforced by this flow.
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

5. **Add `AUTH_SECRET` to `.env.local`.** It signs the sign-in cookie. Generate a value (at least 32 characters) and add a line `AUTH_SECRET=<value>`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

6. **Create the first admin**, then the people who use the app. There is no public sign-up.

   ```bash
   npm run user:create
   ```

   It asks for the full name, email, role (`technician` = Quality Technician, `engineer` = Quality Engineer, `admin`) and a password. Leave the password empty to get a one-time password. It is shown once and stored nowhere, so give it to the person directly. Passwords are stored only as argon2id hashes.

7. **Run.**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, sign in as a Quality Technician and tap **Start the check**. The dashboard is at http://localhost:3000/dashboard/signin.

### People

| Command | What it does |
|---|---|
| `npm run user:create` | Adds a person: name, email, role, password (or a one-time password shown once). |
| `npm run user:reset-password` | Sets a new password (or a one-time one), turns a disabled person back on, and signs them out everywhere. |
| `npm run user:disable` | The person can no longer sign in and is signed out everywhere. Their checks stay. |

All three work on the database in `DATABASE_URL`. A Quality Technician stays signed in for 12 hours, a Quality Engineer or admin for 8 hours, counted from sign-in. Five failed sign-ins within 15 minutes for the same account from the same address lock that pair for 15 minutes. The count is kept in the database.

### Before publishing

The order matters. The new code needs `AUTH_SECRET` and the sign-in tables, and nobody can sign in until the first people exist. Every migration is additive and safe to run twice, so the live app keeps working while you do this.

1. **Check the build.**

   ```bash
   npm run lint
   npm run build
   npx playwright install chromium   # once per machine
   npm run test:e2e
   ```

2. **Set `AUTH_SECRET` in Vercel before pushing.** Project → **Settings** → **Environment Variables** → add `AUTH_SECRET` for Production and Preview. Use a new value, not the one in your `.env.local`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   If it is missing, every page shows "Sign-in is not set up".

3. **Create the tables on the production database.**

   ```bash
   npx vercel env pull .env.local --environment=production
   npm run db:migrate                # sign-in tables, sessions.user_id, the SOP revision tables (0006, 0007)
   npm run db:clear-sample           # only if sample data was seeded on this database
   ```

4. **Push.** `git push`. Vercel builds and deploys.

5. **Create the first people on the live database.** `.env.local` still holds the production `DATABASE_URL` from step 3.

   ```bash
   npm run user:create    # the first admin: role admin
   npm run user:create    # each Quality Technician: role technician
   npm run user:create    # each Quality Engineer: role engineer
   ```

6. **Point local runs back at development.** Run `npx vercel env pull .env.local`. Then add your own development `AUTH_SECRET` to `.env.local` again, because the pull replaces the file.
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

The Playwright tests cover scenarios 1 to 6 in `docs/scenarios.md`, plus refresh-resumes, offline-queues-saves and save-fails-retry, sign-in and roles (`e2e/auth.spec.ts`), people in the data and sign-in ending during a check (`e2e/people.spec.ts`). A setup step signs in a test admin once; the other tests reuse that cookie. They run against a production build with `FL_STORAGE=memory`, which uses PGlite, a real Postgres running inside the process and migrated from `drizzle/`. So the tests run the same SQL as Neon (including the dashboard's group-by queries and plant time zone) and never touch the database. `e2e/analytics.spec.ts` checks every dashboard number against a small fixed dataset.

```bash
npx playwright install chromium   # once
npm run build
npm run test:e2e
```

## How it works

- **One action log per session.** Every tap (a point, Next step, Fixed, continue, a lodged issue, a handoff item) is an action. `lib/check/reducer.ts` rebuilds the whole check from the log: skip detection, clamp order, attempts, conformance, discrepancies and hold. The browser and the server run the same reducer.
- **Never lose data.** Each action is written to `localStorage` first, then sent to `POST /api/sessions/[id]/actions` in batches. If the connection drops, a banner shows how many saves are queued and they are retried with backoff and on reconnect. If the server returns an error, a Retry button appears and the work stays on the device. Saves are idempotent, so a retry never duplicates anything.
- **Resume.** Refreshing or reopening `/check/[id]` loads the local copy first and merges anything the server has. The start page offers to resume the active check.
- **Sign-in ends during a check.** The check stays on screen and keeps working. Every change stays queued on the device, and a banner and dialog ask to sign in again without leaving the check. After signing in, the queue is sent. Signing in as a different Quality Technician does not save into someone else's check. The dialog asks for the person who started it. A reload while signed out goes to the sign-in page and comes back to the same check with the queue intact.
- **Who sees what.** Session history shows a Quality Technician only their own checks; an admin sees all. The dashboard shows every session to a Quality Engineer, with the Include sample data switch.
- **Tables.** `session_actions` is the append-only journal. On every save the server rebuilds `sessions`, `step_events`, `point_confirmations`, `discrepancies` and `handoff_items` from it, in one batch.
- **Mistakes without AI.** Steps 5 to 11 show point grids. Next step with points unconfirmed raises "Step N skipped"; a clamp tapped out of order raises "wrong order". Undo works for 10 seconds on ordinary taps; a tap that raised a deviation stays on the record.

### Seams for later

`lib/integrations.ts` defines the interfaces for what is out of scope in version 1:

- `DeviationSource`: a video model will report the same observations as taps, so the same rules raise the same deviations.
- `CallService`: calls are reminders until the plant call or andon system is linked.
- `ClipStore`: clips are placeholders until video capture exists.

Sign-in uses Better Auth with our own tables (`users`, `auth_sessions`, `auth_accounts`, `auth_verifications`, `login_attempts`). Every page and API checks the role on the server. Each new session stores the signed-in person (`sessions.user_id`) and their name as the Quality Technician label. Older sessions keep their typed label and have no owner.

## Environment variables

| Name | Where | What |
|---|---|---|
| `DATABASE_URL` | Vercel project, `.env.local` | Neon Postgres connection string. Required, except in tests. |
| `AUTH_SECRET` | Vercel project (Production and Preview), `.env.local` | Signs the sign-in cookie and keys the stored address hashes of the sign-in limit. At least 32 characters; a different value per environment. Required. |
| `BETTER_AUTH_URL` | optional | The site's address, for example `https://your-app.vercel.app`. On Vercel the deployment address is used when it is not set. |
| `FL_STORAGE` | tests and test mode only | `memory` runs on PGlite, an in-process Postgres, instead of Neon, with the test accounts in `lib/auth/testUsers.ts` and a TEST MODE banner. Only then may a test mark a session as sample (`x-fl-sample` header). |
