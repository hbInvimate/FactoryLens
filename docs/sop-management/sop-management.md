# SOP management: the Quality Engineer records a better way as the new SOP

Read docs/README.md, docs/sop.md, docs/theme/theme.md and docs/dashboard/dashboard.md first. View both images in docs/sop-management/screens. Use the platform theme (docs/theme). This feature fills the "SOP management" item in the dashboard sidebar, which is "Coming later" today.

## What it is for
A Quality Engineer sees that one operation (one of the 12 steps) is done better in some checks than in others. The Quality Engineer first DECIDES a new cycle time (CT) for it, then records the better way as a new SOP revision. All of it is manual. FactoryLens AI shows the data and keeps the record. It never recommends, never decides the CT, never decides what is better, and never activates a revision by itself.

## Words
- **CT:** the time a step (or the whole check) takes. In this app it is ACTIVE time from the previous step to this step being confirmed, without pauses and holds. Check CT target = the sum of the 12 step targets.
- **Revision:** a numbered version of the SOP (A, B, C). Only one is Active. Revision A is the current SOP, copied once from lib/sop.ts and never edited.
- **Better way:** the Quality Engineer's written description of how the step should be done, with the evidence it is based on.

## Rules
- Exactly 12 steps in every revision. A revision may change, for each step: what to do, what correct looks like, the common mistake, the safety rule, the spoken line, the reference note and the target CT. It may NOT add, remove or reorder steps, or change the check points (clamps, holes, trim edges and so on) in this version.
- Only a Quality Engineer or an admin can create, edit, activate or roll back a revision. A Quality Technician only ever sees the Active revision.
- The new CT must be decided and recorded BEFORE the "better way" can be written or activated. Stage 3 of the wizard stays locked until a new CT, a reason and "I decided this CT. FactoryLens AI did not." are saved.
- Evidence must be real. Sample sessions (is_sample) are shown with a SAMPLE chip and can never be used as evidence. A revision whose evidence includes a sample session cannot be activated.
- Minimum evidence: at least 5 completed sessions where the step was correct on the first attempt, from at least 2 shifts. This is a setting in lib/config.ts. The Quality Engineer may override it by writing a reason, and the override is recorded.
- A second approval before activation is a setting in lib/config.ts (REQUIRE_SECOND_APPROVAL). Default is false, so the Quality Engineer decides and activates. When true, a different Quality Engineer or an admin must approve first.
- A new revision applies to NEW checks only. A check that is already running finishes on the revision it started with.
- Every change is recorded in an append-only audit log: who, when, what changed, the reason. Nothing is deleted. Rolling back means activating an older revision again, with a reason, which adds a new record.
- Show people the cautions: times are button taps, not measured process times. A faster step can also mean a corner was cut. The app cannot tell whether a method makes a better part. Part quality is judged in the tablet quality data tool. Never show measured values.
- Do not rank or shame individuals. Candidate sessions show date, shift and times. Show the technician label only in the evidence table, and add a setting (SHOW_TECHNICIAN_IN_EVIDENCE, default false) so the plant can decide.
- Use plain words. Write "Quality Technician" and "Quality Engineer" in full.

## Pages (dashboard area, Quality Engineer and admin only)
1. **/dashboard/sop** (see s1_sop_management_overview.png): the active revision and its check CT target, a table of the 12 steps with target CT, median actual time, number of sessions, first-time-correct rate and a "Propose a better way" button per step, and the list of revisions with status (Draft, Active, Retired). Station, date range and shift filters like the rest of the dashboard. Real data only unless "Include sample data" is on, and then with the SAMPLE chip.
2. **/dashboard/sop/new?step=7** wizard, four stages (see s2_decide_new_ct_and_evidence.png):
   1. Pick the operation: the stats for the step (current target CT, median actual, fastest quarter, first-time-correct rate, number of sessions, by shift).
   2. Decide the new CT: the evidence table (completed sessions where the step was correct on the first attempt, fastest first, with a tick box and a source chip), the new target CT for the step in mm:ss, the effect on the check CT target, the reason (required), the confirmation tick, "Decided by" and the date. "Save draft" keeps it.
   3. Write the better way: the current text for each field side by side with an editable new text. Show what changed.
   4. Review and activate: a summary of every change (old and new), the evidence sessions, who is affected ("New checks from the effective time. Running checks are not changed"), an effective time (now, start of the next shift, or a chosen time), and "Activate revision B". Ask for a typed confirmation. If a second approval is required, the button says "Send for approval".
3. **/dashboard/sop/[revision]**: read-only view of a revision: status, who decided, the CT and the text changes against the previous revision, the evidence with links to the sessions, and "Make this revision active again" (rollback, reason required).

## Check app effects (Quality Technician)
- The start page shows "SOP: First-off check, rev B".
- The step detail screens and the spoken lines use the Active revision.
- When a new revision becomes Active, the next time a Quality Technician opens the check app they see a banner "SOP rev B is active. Step 7 changed: (short summary)" with an "I have read this" button. Store who acknowledged which revision and when.
- Each session stores the revision it ran on (a nullable sop_revision_id; older sessions count as revision A).
- The dashboard can filter by revision and shows a revision chip on sessions. Conformance and CT are never mixed across revisions without saying so.

## Data (all migrations additive and safe to run twice; the live app shares this Neon database)
sop_revisions (id, label, status draft/active/retired, scope name, created_by, created_at, activated_by, activated_at, effective_from, approved_by, approved_at, change_reason); sop_step_revisions (revision id, step 1 to 12, content fields, target CT seconds); sop_change_records (revision id, step, previous CT, new CT, reason, decided_by, decided_at, evidence session ids, evidence override reason); sop_audit (append-only); sop_acknowledgements (user id, revision id, at); sessions.sop_revision_id (nullable). Seed revision A from lib/sop.ts as Active.

## Out of scope for now
Adding, removing or reordering steps; changing check points; video reference clips (store the session id and time range as the future clip reference); automatic suggestions of what is "better"; customer or plant-wide approval workflows beyond the optional second approval; sending the SOP to another system.

## Acceptance checks
- As a Quality Engineer, open /dashboard/sop, click "Propose a better way" on step 7, decide a CT of 02:40 with a reason, write the better way, activate revision B. The Active revision is now B.
- As a Quality Technician, start a new check: the start page says rev B, step 7 shows the new text, and the banner appears once until acknowledged.
- A check that was started before the activation finishes on rev A.
- Sample sessions cannot be ticked as evidence. Fewer than 5 real sessions blocks activation unless an override reason is written.
- Roll back to revision A with a reason: new checks use A, the audit log shows both changes.
- A Quality Technician cannot open /dashboard/sop (the usual "This page is for Quality Engineers" message), and the APIs return 403.
