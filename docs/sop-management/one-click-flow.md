# One-click flow: from a better way of working to a new SOP

AI PROPOSES, THE QUALITY ENGINEER DECIDES. This replaces the line in sop-management.md that says the app never recommends. The app may now suggest changes from data. It still never activates anything by itself. Every accepted change, every "check again" and the final activation need the Quality Engineer's explicit action. The manual wizard (decide a CT, write the better way) stays as "Decide manually".

Images: docs/sop-management/screens/c1_trend_and_candidates.png (trend and candidates, on /dashboard/sop) and c2_review_suggested_changes.png (the review screen). Match their layout. Use the platform theme tokens in docs/theme.

## The flow the Quality Engineer wants
1. SEE. The dashboard shows when a Quality Technician keeps reaching a better check CT.
2. WATCH. Open the sessions and see the recorded operation (video placeholder now).
3. ONE CLICK. "Review this way" builds a draft SOP revision from those checks.
4. SUGGEST. The app compares with the Active SOP, finds which steps would change and which points inside them, and proposes each change.
5. REVIEW. The Quality Engineer accepts, edits or rejects each suggestion.
6. CHECK AGAIN. The app tests the draft against the other completed checks and shows the result.
7. CONFIRM. The Quality Engineer confirms and activates. The new SOP replaces the old one for new checks.

## 1. Trend and candidates (c1)
- A "Check CT trend" card for the selected station: the active check time per completed real check, with the station median line and the technician's line. Sample data only when "Include sample data" is on, with the SAMPLE chip.
- "Ways of working worth a look": a Quality Technician is listed when their last N completed checks (CANDIDATE_MIN_CHECKS, default 5) are ALL faster than the station median by at least CANDIDATE_MIN_IMPROVEMENT_PERCENT (default 5), and their first-time-correct rate is not below the station's. Columns: Quality Technician, median CT, faster than median, first-time correct, steps that are faster, and a "Review this way" button. Show the technician label here (the Quality Engineer needs to see whose way it is) and add the note "Use this to improve the process, not to rank people."
- Each candidate row shows "Video: not recorded yet" until recording exists.
- These settings go in lib/config.ts.

## 2. One click builds a draft (no AI model, deterministic)
"Review this way" creates a Draft revision copied from the Active revision and runs the comparison on the candidate's recent completed checks. For each of the 12 steps:
- TIME: if the candidate's median step time is faster than the Active target (or the station median when no target is set) by at least STEP_CHANGE_MIN_PERCENT (default 5) AND at least 3 seconds, in at least 80% of the candidate's checks, suggest a new CT = the candidate's median step time rounded UP to the next 5 seconds.
- ORDER: if the order in which the candidate confirms the points of a step differs from the standard order in at least 80% of their checks, suggest a note for "What to do" that describes the order they use, for example "Check the odd-numbered holes first (H1, H3 ... H13), then the even ones." This changes the TEXT only. It never changes the check points or the 12 steps.
- Only steps that were correct on the first attempt in those checks are used.
- Mark a suggestion with a warning when the suggested CT is faster than 90% of all completed checks at the station: "Check it is realistic."
- Steps with no clear difference are listed as "No change".
- Store why each suggestion was made (numbers and session ids).

## 3. Review (c2)
- Header: "Suggested changes from N checks by (technician label)". Stepper: 1 Candidate, 2 Suggested changes, 3 Check again, 4 Confirm and activate.
- "The recorded operation": a video placeholder and a strip of the 12 steps sized by their time, the steps with suggestions highlighted. Clicking a step selects its row. Store a clip reference per step (session id, start second, end second) so real video can be attached later. Label it "Video placeholder: not recorded yet".
- "Suggested changes" table: step, what, CT old to new, type chip (Time, Order, Time + order, No change), why, and Accept, Edit, Reject. Nothing is applied until accepted. Editing a CT or a note is allowed. Rejected suggestions change nothing.
- Every accept, edit and reject is saved and audited with who and when.

## 4. Check again
A "Check again" button tests the draft against the OTHER completed real checks at this station in the last 30 days (not the candidate's own). Show: how many of them would meet the new CTs, by how many Quality Technicians and shifts, the first-time-correct rate in those checks, and warnings (an unrealistic CT, fewer than MIN_EVIDENCE_SESSIONS checks). Save the result with the draft. Any edit to the draft makes the result stale and "Check again" must be run again.

## 5. Confirm and activate
- "Activate revision B" stays locked until: the latest "Check again" has been run, the Quality Engineer ticked "I have reviewed every accepted change" and "I confirm the new CTs. FactoryLens AI did not decide them.", and typed the confirmation. If REQUIRE_SECOND_APPROVAL is true, a different Quality Engineer or admin approves first.
- Blocked when any evidence is a sample session.
- The new revision applies to NEW checks only. Running checks finish on their old revision. Technicians see the one-time "SOP rev B is active" banner with "I have read this". Rollback and the audit log as in sop-management.md.

## Later (do not build now, leave clean places for it)
- VIDEO: recording from wearable glasses or a fixed camera, stored with the session, playable on the review screen with the step markers and the stored clip references. Recording people at work needs consent and may need legal or works council approval.
- HANDS-FREE: step confirmation by voice on the glasses or by a vision model. Until then, all step times are button taps.
- A MODEL THAT READS THE VIDEO and describes technique differences ("gauge held square"). Accuracy on real footage is unproven and must be tested before anyone relies on it.

## Cautions to show on the pages
Times are button taps today, not measured process times. A faster check can mean a corner was cut. The app cannot tell whether a method makes a better part. Part quality is judged in the tablet quality data tool. Never show measured values.

## Data (additive, safe to run twice, the live app shares this database)
sop_suggestions (revision id, step, type time/order, old value, new value, why, source session ids, status proposed/accepted/edited/rejected, decided by, decided at); sop_validations (revision id, run at, settings, results); sop_clip_refs (revision id, session id, step, start second, end second). Audit every action in sop_audit.

## Acceptance checks (use a fixed test dataset)
- Technician A is 12% faster on steps 5, 7 and 9 in 6 checks, correct first time: A is listed as a candidate, and a technician who is only faster in 3 of 5 checks is not.
- "Review this way" builds Draft B with suggestions for steps 5, 7 and 9 only. Step 7 also has an Order suggestion.
- Reject step 9, edit the CT of step 5, accept step 7. The draft holds only those.
- Activation is locked until "Check again" runs and both boxes are ticked. After an edit it is locked again.
- Sample sessions never count as candidates, evidence or check-again data.
- Activate: a new check shows rev B and the banner, a running check keeps rev A. Roll back works and everything is in the audit log.
- A Quality Technician cannot open any of these pages, and the APIs return 403.
