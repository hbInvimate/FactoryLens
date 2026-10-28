-- Step 1 is now "Confirm part, fixture and SOP": the Quality Technician already wears the smart glasses (the wearable
-- edge device), so step 1 is no longer about gloves and safety glasses. Updates step 1 of the Active revision and of any
-- Draft, in place. Retired revisions are left as they were (history). Target 0:30. Safe to run twice: the same values.
UPDATE "sop_step_revisions" AS s
SET "todo" = 'Check the part number and fixture ID match the job and the SOP revision shown.',
  "correct" = 'Part B-pillar outer on fixture FX-014, SOP rev shown on screen.',
  "mistake" = 'Starting on the wrong part, fixture or SOP revision.',
  "rule" = 'The part, fixture and SOP revision must match the job before anything else.',
  "spoken" = 'Step 1 — Confirm the part, fixture and SOP.',
  "target_ct_seconds" = 30
FROM "sop_revisions" AS r
WHERE s."revision_id" = r."id" AND s."step" = 1 AND r."status" IN ('active', 'draft');
