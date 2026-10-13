# Supervisor dashboard: spec (version 2, per station)

Read docs/README.md, docs/sop.md and docs/scenarios.md first. The images are in docs/dashboard/screens:
- d6_station_dashboard_mockup.png is the layout of the NEW station dashboard (/dashboard). All numbers in it are sample numbers.
- d0 to d4 come from the old clickable demo and are the layout of the single-session report (/dashboard/[id]).
Two things on d0 to d4 are WRONG for this app. Ignore the text "(SOP step N)" after each step name: the app has exactly 12 steps and never shows another numbering. Ignore the left menu labels "Next in build order": do not build those menu items.

## Purpose
A working dashboard for ONE STATION at a time. A station is a cell and fixture, for example "Laser cell 3 · FX-014". It answers: how well do checks go at this station, how long do they take on each shift, which steps and exact points go wrong, and which problems with the part or fixture are lodged. It is read-only, reads the real sessions saved in Neon, never shows measured values and never judges the part. It is for performance improvement. No logins exist yet: show the note "Anyone with the link can open this page. Use test data only."

## Where it lives
- The FIRST SCREEN (the start page, where "Session history" already is) gets a "Dashboard" button next to "Session history". Also add a "Dashboard" link in the top navigation of every page.
- /dashboard is the station dashboard (d6). /dashboard/[id] is the single-session report (d0 to d4). Clicking a session in the sessions table opens it.

## Station
Sessions already store "Cell and fixture" as free text. Make it a dropdown of stations on the start form, with an "Add a station" option. Seed it with "Laser cell 3 · FX-014". Existing sessions keep their text. The dashboard has a station dropdown, a date range (7, 30, 90 days, all) and a shift filter (All, A, B, C).

## The numbers on /dashboard (match d6)
Summary tiles: sessions (complete, part held, left), station conformance, share of sessions with no deviation, average check time, open discrepancies.
1. **Conformance, all previous sessions.** Conformance of one session = steps correct on the first attempt divided by 12. Station conformance = the average over completed sessions at that station in the range. Part-held and left sessions are not scored and are left out. Show a bar per day, the overall figure, and the number of sessions behind it.
2. **Average check time by shift.** Check time = active time from start to finish, excluding paused time and hold time. Completed sessions only. Show the average and the number of sessions per shift. Shifts are assumed: A 06:00 to 14:00, B 14:00 to 22:00, C 22:00 to 06:00 (a session belongs to the shift in which it STARTED). Put the shift times and the plant time zone in one config file so they are easy to change. Always compute in the plant time zone, not UTC.
3. **Steps that cause most deviations, with sub-steps.** Count deviations per step (skipped, wrong order, cannot do), highest first, top 5 steps. Under each step list the exact points: which hole (H9), clamp (C4 before C3), trim point (T7), flange point or visual point. A skipped step names every missed point. Clicking a step filters the sessions table to sessions with that deviation.
4. **Lodged discrepancies by category and shift.** A table of category by shift A, B, C with counts and a total. Categories are in issue_categories.json (9 of them). Count lodged issues only; issues fixed on the spot are shown separately as "fixed on the spot" under the table.
Also under the numbers: the sessions table (date and time, technician label, status, conformance, deviations, discrepancies, check time) newest first, click to open the session report.

## Data gaps to close (check the schema first, do not break existing data)
1. Which points were missed. If a skipped-step deviation event does not store the missed point IDs, store them when the deviation is raised (for example in the event payload). Old sessions without it: derive them from the point confirmations if possible, else show "not recorded".
2. Category on each issue. Add the "category" from issue_categories.json to the issue catalogue (lib/ catalogue) and store the category on each lodged discrepancy.
3. Shift is NOT stored: derive it from the session start time with the config file. Do not add a column.
4. Active time: derive from session actions (start, pause, resume, hold, finish). If a session has no finish time, leave it out of the average.
5. Station: add a station field or normalised value to sessions, with a migration that is safe to run twice.

## Sample data (so the dashboard can be shown working)
Add a seed script `npm run db:seed-sample` that creates about 60 realistic FAKE sessions over the last 30 days across the 3 shifts, with a mix of clean checks, skipped holes (H9 to H12 most often), wrong clamp order, lodged issues from every category, a few part-held sessions and a few left sessions. Mark every sample row with a flag (is_sample). The dashboard has a switch "Include sample data" (on by default while there are fewer than 10 real sessions) and a visible "SAMPLE DATA" chip when it is on. Add `npm run db:clear-sample` that removes only the sample rows. The seed must be safe to run twice.

## Single-session report (/dashboard/[id], d0 to d4)
Header (technician label, station, SOP, part), four stat cards (conformance, "10 of 12", deviations, session length), outcome banner (Complete, Part held and not scored, Left with reason, Running), buttons ("Export report (PDF)" opens the browser print dialog with a clean print style; "Send to quality system" and "Replay this session" are shown disabled with "Coming later"), the "Every step, in order" table, "What went wrong" cards with "View clip next to reference" showing the two placeholder drawings (label "Clip placeholder"), and "Discrepancies lodged" cards (step, issue, time, who was called, stopped or continued, outcome). Footnote: "Sequence conformance = steps done correctly on the first attempt divided by 12. It measures the procedure, not the part. Readings and tolerances stay in the tablet quality data tool."

## Rules
- Exactly 12 steps. Only feature IDs (H9, C4), never values. Plain language.
- Read-only. Do not change how the check app works. Existing sessions must keep working.
- Light look as in the images: white cards on a light grey page, blue primary, green, amber and red chips. Works on a laptop and a tablet.
- Empty, loading and error states with Retry on every page. If a station has no sessions: "No sessions at this station yet."
- A part-held or left session is never counted in conformance or average check time.

## Stages (build one, STOP, wait for the user to say "next")
1. Station dropdown on the start form, the Dashboard button on the first screen and in the navigation, /dashboard with the station and range filters, the summary tiles and the sessions table, and /dashboard/[id] with the header, stat cards, steps table and outcome banner.
2. Data foundations: missed-point capture, categories on issues, shift config, active time, and the sample data seed and clear scripts. Tests for each rule.
3. The four analytics blocks on /dashboard exactly like d6, with the shift and range filters.
4. "What went wrong", "Discrepancies lodged" and print export on the session report.

## Acceptance checks
- With sample data on, /dashboard for "Laser cell 3 · FX-014" shows all four blocks filled and matches the layout of d6.
- Run a real check: skip holes H9 to H12, fix it, lodge "Several holes will not take the pin, same direction", finish. It must show 11 of 12 (92%), one deviation at step 7 naming H9, H10, H11 and H12, and one lodged discrepancy in "Laser cut quality" for the shift it started in.
- Run a check, lodge "Crack seen in the part" at step 3: it is "Part held, not scored" and is not in conformance or average check time.
- Turn "Include sample data" off and run db:clear-sample: only real sessions remain.
