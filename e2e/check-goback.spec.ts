// The check screen: the new step 1, the layout of the right-hand side, and going back to an earlier step.
import { expect, test } from "@playwright/test";
import { elapsedMs, reduce, stepsDone } from "../lib/check/reducer";
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

test("time elapsed leaves out paused time", () => {
  const s = reduce(
    log([
      { type: "next_step", step: 1 }, // at 1 s
      { type: "pause" }, // 2 s
      { type: "resume" }, // 3 s
      { type: "pause", auto: true }, // 4 s: the page was closed
      { type: "resume" }, // 5 s: reopened
    ]).map((a, i) => (i === 2 ? { ...a, at: 12_000 } : i === 3 ? { ...a, at: 13_000 } : i === 4 ? { ...a, at: 63_000 } : a)),
    0,
  );
  // 64 s on the clock, 10 s paused by hand and 50 s with the page closed: 4 s of check time.
  expect(elapsedMs(s, 64_000)).toBe(4_000);
  expect(s.paused).toBe(false);
});

test("closing the page pauses the check; reopening resumes it and the closed time is not counted", async ({ page, context }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 2);
  await waitSaved(page);
  await page.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 4_000));

  const again = await context.newPage();
  await again.goto(`/check/${id}`);
  await expect(again.locator("li[aria-current=step]")).toContainText(STEPS[2].name);
  await expect(again.getByRole("button", { name: "Resume", exact: true })).toHaveCount(0);
  await waitSaved(again);
  await expect
    .poll(async () => ((await (await again.request.get(`/api/sessions/${id}`)).json()) as { actions: Action[] }).actions.filter((a) => a.type === "resume").length)
    .toBe(1);
  const { meta, actions } = (await (await again.request.get(`/api/sessions/${id}`)).json()) as { meta: { createdAt: number }; actions: Action[] };
  const pause = actions.find((a) => a.type === "pause" && a.auto)!;
  const resume = actions.find((a) => a.type === "resume")!;
  expect(resume.at - pause.at).toBeGreaterThan(3_500);
  const s = reduce(actions, meta.createdAt);
  expect(s.paused).toBe(false);
  const now = Date.now();
  expect(elapsedMs(s, now)).toBeLessThan(now - meta.createdAt - 3_500);
});

test("no activity for 10 minutes pauses the check; the idle time is not counted", async ({ page }) => {
  await page.clock.install();
  const id = await startCheck(page);
  await doSteps(page, 1, 1);
  await waitSaved(page);
  await page.clock.fastForward("11:00");
  await expect(page.getByTestId("idle-paused")).toContainText("Paused: no activity for 10 min");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByTestId("idle-paused")).toHaveCount(0);
  await waitSaved(page);
  await expect
    .poll(async () => ((await (await page.request.get(`/api/sessions/${id}`)).json()) as { actions: Action[] }).actions.some((a) => a.type === "resume"))
    .toBe(true);
  const { meta, actions } = (await (await page.request.get(`/api/sessions/${id}`)).json()) as { meta: { createdAt: number }; actions: Action[] };
  const done = actions.find((a) => a.type === "next_step")!;
  const pause = actions.find((a) => a.type === "pause" && a.idle)!;
  const resume = actions.find((a) => a.type === "resume")!;
  // Dated when the 10 minutes ran out; the minute after that, while paused, is not counted.
  expect(pause.at - done.at).toBe(600_000);
  const s = reduce(actions, meta.createdAt);
  expect(s.paused).toBe(false);
  expect(elapsedMs(s, resume.at)).toBe(pause.at - meta.createdAt);
});

test("check screen: metrics, the two videos side by side, step details and all 12 steps fit at 1440 x 900; Back works", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startCheck(page);
  await expect(page.locator("li[aria-current=step]")).toContainText("Confirm part, fixture and SOP");
  await expect(page.getByTestId("step-of")).toHaveText("Step 1 of 12 · Setup");
  // Tests add a TEST MODE banner on top that the live app does not have: give the page below it 900 px.
  const banner = (await page.getByTestId("test-mode-banner").boundingBox())?.height ?? 0;
  await page.setViewportSize({ width: 1440, height: 900 + Math.round(banner) });

  const metrics = page.getByTestId("metrics");
  const camera = page.getByTestId("camera-view");
  const ideal = page.getByTestId("ideal-step");
  const details = page.getByTestId("step-details");
  await expect(metrics.locator(":scope > div")).toHaveCount(6);
  await expect(camera).toContainText("Technician cam");
  await expect(camera.getByTestId("cam-video")).toHaveText("Technician cam video: Not recorded yet");
  await expect(ideal).toContainText("SOP video · Step 1");
  await expect(ideal.getByTestId("step-video")).toHaveText("SOP video: Not recorded yet");
  await expect(page.locator("[data-testid=media] svg, [data-testid=media] img")).toHaveCount(0);
  const [m, c, i, d] = await Promise.all([metrics, camera, ideal, details].map((l) => l.boundingBox()));
  expect(m!.y).toBeLessThan(c!.y); // metrics first
  expect(Math.abs(c!.y - i!.y)).toBeLessThan(2); // side by side
  expect(Math.abs(c!.height - i!.height)).toBeLessThan(2); // equal height
  expect(Math.abs(c!.width - i!.width)).toBeLessThan(4); // 50/50
  expect(d!.y).toBeGreaterThan(c!.y + c!.height);
  expect(d!.y + d!.height).toBeLessThanOrEqual(900 + banner); // above the fold
  const list = await page.getByTestId("step-list").boundingBox();
  const last = await page.locator("li button[data-step='12']").boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(list!.y + list!.height + 1); // all 12 steps, no scrolling
  // The SOP column is about 35% of the width.
  const sop = await page.getByTestId("step-list").locator("xpath=ancestor::section[1]").boundingBox();
  expect(sop!.width).toBeGreaterThanOrEqual(420);
  expect(sop!.width).toBeLessThan(1440 * 0.4);
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
