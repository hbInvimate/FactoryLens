// The check screen: the new step 1, the layout of the right-hand side, and going back to an earlier step.
import { expect, test } from "@playwright/test";
import { reduce, stepsDone } from "../lib/check/reducer";
import type { Action, ActionBody } from "../lib/check/types";
import { STEPS } from "../lib/sop";
import { doSteps, startCheck, waitSaved } from "./helpers";

const log = (bodies: ActionBody[]): Action[] => bodies.map((b, i) => ({ ...b, id: `a${i}`, seq: i + 1, at: 1_000 + i * 1_000 }) as Action);

test("step 1 is Confirm part, fixture and SOP", () => {
  expect(STEPS[0].name).toBe("Confirm part, fixture and SOP");
  expect(STEPS[0].todo).toBe("Check the part number and fixture ID match the job and the SOP revision shown.");
  expect(JSON.stringify(STEPS[0])).not.toMatch(/glove|safety glasses/i);
});

test("go back: the step reopens, the later ones are re-confirmed in order, logged, and not a deviation", () => {
  const s = reduce(
    log([
      { type: "next_step", step: 1 },
      { type: "next_step", step: 2 },
      { type: "next_step", step: 3 },
      { type: "go_back", from: 4, to: 2, by: "QT" },
      // Not allowed: step 3 is not current, and going forward is not a go-back.
      { type: "next_step", step: 3 },
      { type: "go_back", from: 2, to: 3, by: "QT" },
    ]),
    0,
  );
  expect(s.current).toBe(2);
  expect(s.steps.map((r) => r.reconfirm).slice(0, 4)).toEqual([false, true, true, false]);
  expect(stepsDone(s)).toBe(3); // still recorded
  expect(s.goBacks).toEqual([{ at: 4_000, from: 4, to: 2, by: "QT" }]);
  expect(s.deviations).toHaveLength(0);

  const t = reduce(
    log([
      { type: "next_step", step: 1 },
      { type: "next_step", step: 2 },
      { type: "next_step", step: 3 },
      { type: "go_back", from: 4, to: 2, by: "QT" },
      { type: "next_step", step: 2 },
      { type: "next_step", step: 3 },
    ]),
    0,
  );
  expect(t.current).toBe(4);
  expect(t.steps.some((r) => r.reconfirm)).toBe(false);
  // The first done time stays; no extra "done" events; no deviation.
  expect(t.steps[1].doneAt).toBe(2_000);
  expect(t.stepEvents.filter((e) => e.kind === "done")).toHaveLength(3);
  expect(t.deviations).toHaveLength(0);
  expect(t.steps.every((r) => r.outcome !== "corrected")).toBe(true);
});

test("check screen: metrics, camera and ideal step side by side, step details, all above the fold; Back works", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startCheck(page);
  await expect(page.locator("li[aria-current=step]")).toContainText("Confirm part, fixture and SOP");

  const metrics = page.getByTestId("metrics");
  const camera = page.getByTestId("camera-view");
  const ideal = page.getByTestId("ideal-step");
  const details = page.getByTestId("step-details");
  await expect(metrics.locator(":scope > div")).toHaveCount(6);
  await expect(ideal.getByTestId("step-video")).toContainText("Video: not recorded yet");
  const [m, c, i, d] = await Promise.all([metrics, camera, ideal, details].map((l) => l.boundingBox()));
  expect(m!.y).toBeLessThan(c!.y); // metrics first
  expect(Math.abs(c!.y - i!.y)).toBeLessThan(2); // side by side
  expect(Math.abs(c!.height - i!.height)).toBeLessThan(2); // equal height
  expect(Math.abs(c!.width - i!.width)).toBeLessThan(4); // 50/50
  expect(d!.y).toBeGreaterThan(c!.y + c!.height);
  expect(d!.y + d!.height).toBeLessThanOrEqual(900); // above the fold
  await expect(page.getByText("Step video", { exact: true })).toHaveCount(0);

  // Go back from step 4 to step 2: by tapping step 2 in the list, then Back from step 3.
  await doSteps(page, 1, 3);
  await page.locator("li button[data-step='2']").click();
  await page.getByTestId("confirm-back").click();
  await expect(page.locator("li[aria-current=step]")).toContainText(STEPS[1].name);
  await expect(page.locator("li[aria-current=step]")).toContainText("Re-confirm");
  await expect(page.locator("li button[data-step='3']")).toContainText("re-confirm");
  await page.getByRole("button", { name: "Done, next step" }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText(STEPS[2].name);
  await page.getByTestId("back-step").click();
  await expect(page.getByRole("dialog")).toContainText("It is not a deviation.");
  await page.getByTestId("confirm-back").click();
  await expect(page.locator("li[aria-current=step]")).toContainText(STEPS[1].name);
  await page.getByRole("button", { name: "Done, next step" }).click();
  await page.getByRole("button", { name: "Done, next step" }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText(STEPS[3].name);
  await expect(page.locator("li[aria-current=step]")).not.toContainText("Re-confirm");
  await expect(metrics).toContainText("Deviations0");
  await expect(metrics).toContainText("Steps done3 / 12");
  await waitSaved(page);
});
