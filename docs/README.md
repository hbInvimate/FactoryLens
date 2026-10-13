# FactoryLens AI reference pack

Read in this order: this file, `sop.md`, `scenarios.md`, `issues.json`, then LOOK AT every image in `screens/`. The images are the visual spec: copy their layout, colours, wording and sizes.

## Product in one paragraph
A Quality Technician runs the first-off check of a laser-cut B-pillar outer on a checking fixture. FactoryLens AI follows the 12-step procedure, guides each step, catches mistakes, and helps lodge issues when the part is bad. It never measures, never judges a reading, never decides tolerance, never releases the cell. Measurements are entered on a tablet outside this app.

## Hard rules
1. Exactly 12 steps (see `sop.md`). Never show another numbering.
2. Write "Quality Technician" in full. Never abbreviate it.
3. No measured values on any screen. Feature IDs only (H5, C4, T3).
4. Nothing is drawn on the smart-glasses lens. Guidance is spoken (optional text-to-speech toggle, off by default).
5. Plain language. Short sentences.
6. Large touch targets, at least 56 px, for gloved hands.
7. All numbers and names are placeholders.

## Screens
| Image | What it shows |
|---|---|
| 01_regular_operation | SOP list with the current step, camera view placeholder, progress numbers, "Lodge a discrepancy" |
| 02_step_detail_clamps | Step detail: reference clip, what to do, correct, mistakes, spoken line |
| 03_deviation_wrong_order_step5 | Operator mistake: clamps closed in the wrong order |
| 04_deviation_holes_skipped_step7 | Operator mistake: holes H9 to H12 skipped |
| 05_lodge_pick_the_step | Lodge a discrepancy, which step |
| 06_lodge_pick_the_issue_step7 | Pick what is wrong, with the three outcomes |
| 07_lodge_try_a_fix_first | Try a fix, then lodge |
| 08_lodge_fix_it_yourself_wrong_clamp_order | Fix it yourself |
| 09_lodged_part_is_bad_check_stops_crack | Part is bad: lodged, who to call, the check stops |
| 10_lodged_holes_H5_to_H8_check_continues | Part is bad: lodged, the check continues |
| 11 to 14b | The five "part does not fit" procedure screens |
| 15_check_complete | Check complete: score, steps, deviations, clips |

## Glossary
SOP: the written procedure. Deviation: the person did a step wrongly or skipped it. Discrepancy: something is wrong with the part, fixture, gauge or setup, lodged by the technician. Hold: the cell and parts wait for the process engineer.
