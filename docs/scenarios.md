# Scenarios the app must handle

There are two kinds of problem. The app must handle both, live, while the Quality Technician works.

- **A. The person made a mistake** (for example Kayla misses holes H9 to H12, or closes clamps in the wrong order). The app notices, corrects her, and she carries on. The check still ends with the part checked.
- **B. The part or fixture itself is bad** (for example a crack, or the part will not seat). The Quality Technician lodges it on the monitor. The app tells her whether to fix it, try a fix, or lodge and call, whether the check stops, and what to do now.

## How version 1 catches mistakes without AI
There is no camera or model in version 1. Mistakes are caught from what the user taps.
- **Point confirmation.** Steps with check points show a grid of points: clamps C1 to C6 (steps 5 and 6), holes H1 to H14 (step 7), slots S1 to S4 and notches N1 to N4 (step 8), trim edges T1 to T14 (step 9), flange F1 to F4 (step 10), visual V1 to V5 (step 11). The user taps a point when she has tried the pin or gauge there. She never types a measurement.
- **Skip detection.** If she moves to the next step while points are still unconfirmed, raise a "step skipped" deviation that names the missing points, for example "Step 7 skipped: holes H9 to H12 not checked".
- **Order detection.** Clamps must be tapped in order C1 to C6. Tapping C4 before C3 raises "Step 5: wrong order, clamp C4 closed before C3".
- **Attempts.** Count attempts per step. The first attempt decides conformance. After 3 failed attempts on one step, show the expert-clip placeholder and an "Call a trainer" action, and record it.
- Keep a clean interface where AI video analysis will later raise the same deviations.

## Scenario 1: a clean check
Start check, confirm the 12 steps and their points in order. Finish shows 100% conformance (12 of 12), 50 of 50 check points, 0 deviations. Save the session.

## Scenario 2: the operator misses holes (Kayla skips H9 to H12)
1. Step 7. She confirms H1 to H8, then taps "Next step".
2. The deviation view takes over (see screen 04): amber banner "Step 7 skipped, holes H9 to H12 not checked", the technician's view beside the reference, a large correction "Go back to Step 7: Holes H1 to H14", the SOP shrinks to a strip, a "Clip saved" marker, an attempt counter.
3. If speech is on, it says the correction.
4. She goes back, confirms the four holes, taps "Fixed, continue". The step is marked Corrected. The check carries on and ends with the part checked.
5. Conformance counts step 7 as not correct first time: 11 of 12 is 92%. The deviation appears in the session history with its time.

## Scenario 3: clamps in the wrong order
Step 5. She taps C4 before C3. Red banner (screen 03): "Step 5: wrong order, clamp C4 closed before C3". Correction "Step 5: close C3 before C4." The clamp row shows the wrong clamp in red. She releases and taps C1 to C6 in order, then "Fixed, continue".

## Scenario 4: the part itself is bad and the check cannot continue
Example: a crack is seen in the part at step 3 (issue "Crack seen in the part", effect "stop").
1. "Lodge a discrepancy" is visible on every screen. She taps it, picks the step, picks the issue from `issues.json` (screens 05 and 06).
2. The issue's kind is "lodge", so the "Discrepancy lodged" screen shows (screen 09): what was logged, who to call (from the issue), and "What to do now": do not force anything, keep the part clamped, do not measure anything else until someone arrives, take photos.
3. Effect "stop": the session status becomes **stopped**. The step list is locked.
4. She marks and photographs the problem (checklist, tracked), then hands off. A waiting timer runs. Calls are reminders only (no real call link yet).
5. When the engineer or supervisor arrives, she records who and why it was cleared or scrapped. The session ends as **Part held, not checked**. No conformance score is shown.
Other stop issues come from `issues.json` (effect "stop"): part will not seat after one reseat, wrong variant, bent or damaged part, datum pin problems, clamp broken, and so on.

## Scenario 5: issues she can fix or try to fix
For issues of kind "self" or "try" (screens 07 and 08): a checklist of fix steps, each tapped when done. "Fixed, check again" returns to the same step and logs "fixed on the spot". For kind "try", "Did not work: lodge and call" turns it into a lodged discrepancy (Scenario 4 if its effect is stop, Scenario 6 if it continues).

## Scenario 6: holes H5 to H8 all off in the same direction (the check continues)
1. At step 7 she lodges "Several holes will not take the pin, same direction" (effect "continue").
2. The lodged screen (screen 10) says the check can continue and the cell is on hold. She finishes the full check.
3. The button "Open the hole check procedure" opens the five procedure screens in order (screens 11 to 14b): spot it and pause, rule out the cheap causes; find the pattern and contain; mark, hand off and wait; re-check the trial part; release and close.
4. Hold state: parts on hold, a waiting timer, a handoff checklist (marks, photos, handoff sheet on the tablet, handed over in person).
5. The process engineer corrects the program elsewhere. The app NEVER chooses the correction. It tracks the trial part re-check (maximum 2 trials, an assumed limit) and ends with release and close.

## Scenario 7: things go wrong in the app itself
- **Connection lost:** show a banner, keep working, queue saves in the browser, retry automatically.
- **Refresh or accidental close:** resume the active session where she left off.
- **Save fails:** error with a Retry button. Never lose data.
- **Mistaken tap:** Back and Undo (within 10 seconds).
- **Leaving a session:** confirm and ask for a reason.
- **Pause and Resume** at any time.

## What to save per session
Session: id, started and ended times, status (running, paused, on hold, stopped, complete, part held), part, fixture, operator label, conformance. Step events: step, kind (done, wrong order, skipped, fixed, cannot do), attempt number, time. Point confirmations: step, point id, time, order. Discrepancies: step, issue label, kind, who to call, effect, status, time, what was done. Handoff items: marks, photos, sheet, handed over, waiting time, outcome.

## Acceptance tests to write and run (Playwright)
Scenarios 1 to 6, plus: refresh mid-session resumes, and offline saves are queued and sent later. `npm run build` must pass.
