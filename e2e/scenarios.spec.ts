// Scenarios 1 to 6 in docs/scenarios.md.
import { expect, test } from "@playwright/test";
import { decideHold, doStep, doSteps, grid, lodge, startCheck, tap, waitSaved } from "./helpers";

test("Scenario 1: a clean check scores 100%, 50 of 50, no deviations, and is saved", async ({ page, request }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 12);

  await expect(page.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await expect(page.getByTestId("conformance")).toHaveText("100%");
  await expect(page.getByText("12 of 12 steps correct first time")).toBeVisible();
  await expect(page.getByText("50 / 50")).toBeVisible();
  await expect(page.getByText("No deviations. Every step was correct first time.")).toBeVisible();
  await waitSaved(page);
  await expect(page.getByText("Session saved")).toBeVisible();

  const res = await request.get(`/api/sessions/${id}`);
  expect(res.ok()).toBeTruthy();
  const journal = await res.json();
  expect(journal.actions.filter((a: { type: string }) => a.type === "tap_point")).toHaveLength(6 + 6 + 14 + 8 + 14 + 4 + 5);

  await page.goto(`/sessions/${id}`);
  await expect(page.getByTestId("detail-conformance")).toHaveText("100% (12 of 12 correct first time)");
  await expect(page.getByText("Complete", { exact: true })).toBeVisible();
});

test("Scenario 2: holes H9 to H12 skipped, corrected, 11 of 12 is 92%", async ({ page }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 6);
  await tap(page, 7, ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H13", "H14"]);
  await page.getByRole("button", { name: "Next step", exact: true }).click();

  // The deviation view takes over (screen 04).
  await expect(page.getByRole("heading", { name: "Step 7 skipped" })).toBeVisible();
  await expect(page.getByText("Holes H9 to H12 not checked", { exact: true })).toBeVisible();
  await expect(page.getByText("Go back to Step 7: Holes H1 to H14.")).toBeVisible();
  await expect(page.getByText("Quality Technician now")).toBeVisible();
  await expect(page.getByText("Reference from training")).toBeVisible();
  await expect(page.getByTestId("clip-saved")).toBeVisible();
  await expect(page.getByText("Attempt 1")).toBeVisible();
  await expect(grid(page, 7, "your view").getByRole("button", { name: "H10", exact: true })).toHaveAttribute("data-look", "missing");

  // Fixed, continue too early only explains what is missing. It is not a new attempt.
  await page.getByRole("button", { name: "Fixed, continue" }).click();
  await expect(page.getByTestId("dev-hint")).toHaveText("Tap holes H9 to H12 first.");
  await expect(page.getByText("Attempt 1")).toBeVisible();

  await tap(page, 7, ["H9", "H10", "H11", "H12"], "your view");
  await expect(page.getByTestId("dev-status")).toHaveText("All 14 checked");
  await page.getByRole("button", { name: "Fixed, continue" }).click();

  // The check carries on at step 8 and ends with the part checked.
  await doSteps(page, 8, 12);
  await expect(page.getByTestId("conformance")).toHaveText("92%");
  await expect(page.getByText("11 of 12 steps correct first time")).toBeVisible();
  await expect(page.getByTestId("result-step-7")).toContainText("Corrected");
  await expect(page.getByText("Step 7: holes H9 to H12 not checked")).toBeVisible();

  await waitSaved(page);
  await page.goto(`/sessions/${id}`);
  await expect(page.getByText(/Step 7: Step skipped, holes H9 to H12 not checked/)).toBeVisible();
  await expect(page.getByTestId("detail-conformance")).toHaveText("92% (11 of 12 correct first time)");
});

test("Scenario 3: clamp C4 before C3 is wrong order; three attempts offer a trainer", async ({ page }) => {
  await startCheck(page);
  await doSteps(page, 1, 4);
  await tap(page, 5, ["C1", "C2", "C4"]);

  await expect(page.getByRole("heading", { name: "Step 5: wrong order" })).toBeVisible();
  await expect(page.getByText("Clamp C4 closed before C3", { exact: true })).toBeVisible();
  await expect(page.getByText("Step 5: close C3 before C4.")).toBeVisible();
  await expect(grid(page, 5, "your view").getByRole("button", { name: "C4", exact: true })).toHaveAttribute("data-look", "wrong");

  // Pressing Fixed, continue is not a mistake.
  await page.getByRole("button", { name: "Fixed, continue" }).click();
  await expect(page.getByTestId("dev-hint")).toHaveText("Release all clamps first, then tap C1 to C6 in order.");
  await expect(page.getByText("Attempt 1")).toBeVisible();
  await expect(page.getByTestId("expert-clip")).toHaveCount(0);

  // Two more real mistakes: the expert clip and Call a trainer appear.
  await page.getByRole("button", { name: "Release all clamps" }).click();
  await tap(page, 5, ["C2"], "your view");
  await expect(page.getByText("Attempt 2")).toBeVisible();
  await expect(page.getByTestId("expert-clip")).toHaveCount(0);
  await page.getByRole("button", { name: "Release all clamps" }).click();
  await tap(page, 5, ["C1", "C3"], "your view");
  await expect(page.getByText("Attempt 3")).toBeVisible();
  await expect(page.getByTestId("expert-clip")).toBeVisible();
  await page.getByRole("button", { name: "Call a trainer" }).click();
  await expect(page.getByText("Trainer called. Keep the part as it is.")).toBeVisible();

  // Release and close C1 to C6 in order.
  await page.getByRole("button", { name: "Release all clamps" }).click();
  await tap(page, 5, ["C1", "C2", "C3", "C4", "C5", "C6"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();

  await doSteps(page, 6, 12);
  await expect(page.getByTestId("conformance")).toHaveText("92%");
  await expect(page.getByTestId("result-step-5")).toContainText("Corrected");
  await expect(page.getByText("Step 5: clamp C4 closed before C3")).toBeVisible();
});

test("Step 5 skipped: Fixed, continue returns to the SOP once C1 to C6 are closed in order", async ({ page }) => {
  await startCheck(page);
  await doSteps(page, 1, 4);
  await page.getByRole("button", { name: "Next step", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Step 5 skipped" })).toBeVisible();
  await expect(page.getByText("Clamps C1 to C6 not closed", { exact: true })).toBeVisible();

  // Pressing too early changes nothing but the hint, however often.
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Fixed, continue" }).click();
  await expect(page.getByTestId("dev-hint")).toHaveText("Tap clamps C1 to C6 first. C1 is next.");
  await expect(page.getByText("Attempt 1")).toBeVisible();
  await expect(page.getByTestId("expert-clip")).toHaveCount(0);

  await tap(page, 5, ["C1", "C2", "C3"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();
  await expect(page.getByTestId("dev-hint")).toHaveText("Tap clamps C1 to C6 first. C4 is next.");
  await tap(page, 5, ["C4", "C5", "C6"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();

  // Back in the normal SOP view at step 6, step 5 corrected.
  await expect(page.getByRole("heading", { name: "Step 5 skipped" })).toHaveCount(0);
  await expect(page.locator("li[aria-current=step]")).toContainText("Close clamps fully, same order");
  await doSteps(page, 6, 12);
  await expect(page.getByTestId("result-step-5")).toContainText("Corrected");
  await expect(page.getByTestId("conformance")).toHaveText("92%");
});

test("Scenario 4: a crack stops the check; handoff, decision, part scrapped with no score", async ({ page }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 2);
  await lodge(page, /Lower the part onto pads P1 to P3/, "Crack seen in the part");

  await expect(page.getByRole("heading", { name: "Discrepancy lodged" })).toBeVisible();
  await expect(page.getByTestId("lodged-effect")).toHaveText("The check is stopped.");
  await expect(page.getByText("Do not measure anything else until someone arrives")).toBeVisible();
  await expect(page.getByText("A cracked part is stopped, not measured.")).toBeVisible();
  await page.getByRole("button", { name: "Mark Shift supervisor as called" }).click();
  await page.getByRole("button", { name: "Next: mark and hand off" }).click();

  // On hold, stopped: the steps are locked.
  await expect(page.getByRole("heading", { name: "On hold: the check is stopped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Done, next step" })).toHaveCount(0);
  await page.getByRole("button", { name: /Mark the problem on the part/ }).click();
  await page.getByRole("button", { name: /Photograph it close up/ }).click();
  await page.getByRole("button", { name: /Photograph it close up/ }).click();
  await page.getByRole("button", { name: /Fill in the handoff sheet/ }).click();
  await page.getByRole("button", { name: /Hand over in person/ }).click();
  await expect(page.getByText(/^Waiting \d+:\d\d$/)).toBeVisible();

  // Someone arrives and decides; the Quality Technician records it.
  await decideHold(page, "Part scrapped", "Quality", "Crack confirmed at the upper end");

  await expect(page.getByRole("heading", { name: "Part scrapped" })).toBeVisible();
  await expect(page.getByTestId("held-outcome")).toHaveText("Part scrapped");
  await expect(page.getByText("2 photos").or(page.getByText("2", { exact: true })).first()).toBeVisible();
  await expect(page.getByTestId("conformance")).toHaveCount(0);

  await waitSaved(page);
  await page.goto(`/sessions/${id}`);
  await expect(page.getByTestId("detail-conformance")).toHaveText("Not scored: part scrapped");
  await expect(page.getByText("Closed by Quality: Crack confirmed at the upper end")).toBeVisible();
  await expect(page.getByText(/2 photos/)).toBeVisible();
});

test("Scenario 5: fix it yourself, and a try that did not work becomes a lodged discrepancy", async ({ page }) => {
  await startCheck(page);
  await doSteps(page, 1, 4);

  // Fix it yourself (screen 08): the steps must be ticked, then back to the same step.
  await lodge(page, /Close clamps lightly, C1 to C6/, "Clamps were closed in the wrong order");
  await expect(page.getByRole("heading", { name: "Fix it yourself" })).toBeVisible();
  const fixed = page.getByRole("button", { name: "Fixed, check again" });
  await expect(fixed).toBeDisabled();
  for (const s of ["Release all the clamps", "Start again from C1", "Close in order, C1 to C6"]) {
    await page.getByRole("button", { name: s }).click();
  }
  await fixed.click();
  await expect(page.getByText(/fixed on the spot/)).toBeVisible();
  await expect(page.locator("li[aria-current=step]")).toContainText("Close clamps lightly, C1 to C6");

  // Try this first (screen 07), did not work: lodge and call. Effect continue.
  await doSteps(page, 5, 6);
  await lodge(page, /Check holes H1 to H14 with check pins/, "Check pin will not enter one hole");
  await expect(page.getByRole("heading", { name: "Try this first" })).toBeVisible();
  await page.getByRole("button", { name: "Do not force the pin" }).click();
  await page.getByRole("button", { name: "Did not work: lodge and call" }).click();
  await expect(page.getByRole("heading", { name: "Discrepancy lodged" })).toBeVisible();
  await expect(page.getByTestId("lodged-effect")).toHaveText("The check can continue. The cell is on hold.");
  await expect(page.getByText("Already tried")).toBeVisible();
  await page.getByRole("button", { name: "Back to the check" }).click();
  await expect(page.getByTestId("hold-strip")).toBeVisible();
  await expect(page.locator("li[aria-current=step]")).toContainText("Check holes H1 to H14");

  // A try with effect stop stops the check.
  await lodge(page, /Round pin, then slot pin, no force/, "Round locator pin (RPS-1) will not enter");
  await page.getByRole("button", { name: "Did not work: lodge and call" }).click();
  await expect(page.getByTestId("lodged-effect")).toHaveText("The check is stopped.");
  await page.getByRole("button", { name: "Next: mark and hand off" }).click();
  await expect(page.getByRole("heading", { name: "On hold: the check is stopped" })).toBeVisible();
});

test("Scenario 6: holes H5 to H8 lodged, the check continues, the procedure runs to release", async ({ page }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 6);
  await tap(page, 7, ["H1", "H2", "H3", "H4"]);
  await lodge(page, /Check holes H1 to H14 with check pins/, "Several holes will not take the pin, same direction");

  await expect(page.getByTestId("lodged-effect")).toHaveText("The check can continue. The cell is on hold.");
  await expect(page.getByText("This is the H5 to H8 case. Follow the hole check procedure.")).toBeVisible();
  await page.getByRole("button", { name: "Back to the check" }).click();

  // She finishes the full check while the cell is on hold.
  await expect(page.getByTestId("hold-strip")).toBeVisible();
  await tap(page, 7, ["H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14"]);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await doSteps(page, 8, 12);
  await expect(page.getByRole("heading", { name: "Check complete, cell on hold" })).toBeVisible();
  await page.getByRole("button", { name: "Open the hold" }).click();

  // Screen 11
  await expect(page.getByTestId("proc-screen")).toHaveText("1 of 5: Spot it and pause, rule out the cheap causes");
  await page.getByRole("button", { name: /Don't force the pin/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Screen 12: report H5 to H8, contain.
  await expect(page.getByTestId("proc-screen")).toHaveText("2 of 5: Find the pattern and contain");
  for (const h of ["H5", "H6", "H7", "H8"]) await page.getByRole("button", { name: h, exact: true }).click();
  await expect(page.getByText("H5 to H8 reported out")).toBeVisible();
  await page.getByRole("button", { name: "One more part on hold" }).click();
  await page.getByRole("button", { name: "One more part on hold" }).click();
  await expect(page.getByTestId("parts-on-hold")).toHaveText("2");
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByTestId("proc-screen")).toContainText("1 of 5");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Screen 13: mark, hand off, wait.
  await expect(page.getByRole("heading", { name: "Hold: waiting for the process engineer" })).toBeVisible();
  await page.getByRole("button", { name: /Mark each hole/ }).click();
  await page.getByRole("button", { name: /Photograph each marked hole/ }).click();
  await page.getByRole("button", { name: /Fill in the handoff sheet/ }).click();
  await page.getByRole("button", { name: /Hand over in person/ }).click();
  await expect(page.getByText(/^Waiting \d+:\d\d$/)).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Screen 14: trial part re-check, the Quality Technician decides. Maximum 2 trials.
  await expect(page.getByRole("heading", { name: "Trial part 1 of 2: re-check" })).toBeVisible();
  await page.getByRole("button", { name: /Better but still out/ }).click();
  await expect(page.getByRole("heading", { name: "Trial part 2 of 2: re-check" })).toBeVisible();
  await page.getByRole("button", { name: /All in tolerance/ }).click();

  // Screen 14b: release and close.
  await expect(page.getByRole("heading", { name: "Trial passed: release and close" })).toBeVisible();
  const close = page.getByRole("button", { name: "Close the hold" });
  await expect(close).toBeDisabled();
  for (const t of [/All 50 points in tolerance/, /Sign off the first-off/, /Release the cell/, /Check the held parts/, /Increase checking/, /Close the record/]) {
    await page.getByRole("button", { name: t }).click();
  }
  await close.click();
  await expect(page.getByTestId("hold-closed")).toBeVisible();
  await page.getByRole("button", { name: "Back to the check" }).click();
  await expect(page.getByRole("heading", { name: "Check complete", exact: true })).toBeVisible();
  await expect(page.getByTestId("conformance")).toHaveText("100%");

  await waitSaved(page);
  await page.goto(`/sessions/${id}`);
  await expect(page.getByText("Several holes will not take the pin, same direction")).toBeVisible();
  await expect(page.getByText(/Holes reported out: H5, H6, H7, H8/)).toBeVisible();
  await expect(page.getByText(/Trial 2: pass/)).toBeVisible();
});

test("Step detail opens from the list and steps through with Step N-1 and N+1", async ({ page }) => {
  await startCheck(page);
  await doStep(page, 1);
  await page.getByRole("button", { name: "Close clamps lightly, C1 to C6" }).click();
  await expect(page.getByRole("heading", { name: "Close clamps lightly, C1 to C6" })).toBeVisible();
  await expect(page.getByText("Step 5 — Close clamps in order, C1 to C6.")).toBeVisible();
  await page.getByRole("button", { name: "Step 6", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Close clamps fully, same order" })).toBeVisible();
  await page.getByRole("button", { name: /Close/ }).filter({ hasText: "✕" }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText("Clean the pads and pins");
});
