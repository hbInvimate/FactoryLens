-- Placeholder target CTs for revision A's 12 steps (check target 45:00). Safe to run twice: it only fills
-- targets that are still empty, on revision A only. No table or column changes.
UPDATE "sop_step_revisions" AS s
SET "target_ct_seconds" = v.ct
FROM (VALUES (1, 30), (2, 90), (3, 60), (4, 90), (5, 120), (6, 90), (7, 840), (8, 420), (9, 540), (10, 240), (11, 120), (12, 60)) AS v(step, ct)
WHERE s."revision_id" = 'sop-rev-A' AND s."step" = v.step AND s."target_ct_seconds" IS NULL;
