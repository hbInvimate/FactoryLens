// Holds: why, waiting time, and the decision recorded by the Quality Technician (made by others).
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { decideHold, doSteps, lodge, openDashboard, startAt, unique, waitSaved } from "./helpers";

const DEFAULT = "Laser cell 3 · FX-014";

async function statusOf(request: APIRequestContext, id: string) {
  const { sessions } = await (await request.get("/api/sessions")).json();
  return (sessions as { id: string; status: string }[]).find((s) => s.id === id)?.status;
}

/** Steps 1 and 2, then a crack at step 3: the check stops and the session is on hold. */
async function stopOnCrack(page: Page, station = DEFAULT): Promise<string> {
  const id = await startAt(page, station);
  await doSteps(page, 1, 2);
  await lodge(page, /Lower the part onto pads P1 to P3/, "Crack seen in the part");
  await page.getByRole("button", { name: "Next: mark and hand off" }).click();
  await expect(page.getByRole("heading", { name: "On hold: the check is stopped" })).toBeVisible();
  return id;
}

const ENDINGS = [
  { outcome: "Part scrapped", title: "Part scrapped", status: "scrapped", by: "Quality" },
  { outcome: "Sent for rework or sorting", title: "Sent for rework or sorting", status: "rework", by: "Shift supervisor" },
  { outcome: "Concession approved", title: "Concession approved", status: "concession", by: "Quality" },
  { outcome: "Check abandoned", title: "Check abandoned", status: "left", by: "Process engineer" },
];

for (const e of ENDINGS) {
  test(`Closing a hold: "${e.outcome}" ends the session with that outcome`, async ({ page, request }) => {
    const id = await stopOnCrack(page);
    // The hold screen says why.
    await expect(page.getByText("Part form or damage")).toBeVisible();
    await expect(page.getByTestId("hold-waiting")).toHaveText(/^\d+:\d\d$/);

    const record = page.getByRole("button", { name: "Record the decision and close the hold" });
    await expect(record).toBeDisabled();
    await decideHold(page, e.outcome, e.by, `Reason for ${e.status}`);

    await expect(page.getByRole("heading", { name: e.title })).toBeVisible();
    await expect(page.getByTestId("held-outcome")).toHaveText(e.outcome);
    await waitSaved(page);
    await expect.poll(() => statusOf(request, id)).toBe(e.status);

    await page.goto(`/dashboard/${id}`);
    await expect(page.getByTestId("report-conformance")).toHaveText("Not scored");
    await expect(page.getByTestId("hold-decision")).toContainText(`${e.outcome}, decided by ${e.by}`);
    await expect(page.getByTestId("hold-decision")).toContainText(`Reason: Reason for ${e.status}`);
    await expect(page.getByTestId("hold-section")).toContainText("Crack seen in the part · Part form or damage · the check stopped");
    await expect(page.getByTestId("hold-section")).toContainText("Shift supervisor, Quality");
    await page.getByRole("link", { name: "Open in the check app" }).click();
    await expect(page).toHaveURL(new RegExp(`/check/${id}$`));
    await expect(page.getByRole("heading", { name: e.title })).toBeVisible();
  });
}

test('"Cleared" resumes the check at the same step, stop and continue holds alike', async ({ page, request }) => {
  const id = await stopOnCrack(page);
  await decideHold(page, "Cleared, the check continues", "Process engineer", "Mark is a scratch, not a crack");
  await expect(page.locator("li[aria-current=step]")).toContainText("Lower the part onto pads P1 to P3");
  await expect(page.getByRole("button", { name: "Done, next step" })).toBeEnabled();

  // A continue hold at step 7, cleared from the hold strip.
  await doSteps(page, 3, 6);
  await lodge(page, /Check holes H1 to H14 with check pins/, "Burr, dross or slug in the hole");
  await page.getByRole("button", { name: "Back to the check" }).click();
  await expect(page.getByTestId("hold-strip")).toBeVisible();
  await page.getByTestId("hold-strip").getByRole("button", { name: "Open the hold" }).click();
  await page.getByRole("button", { name: "Record the decision and close the hold" }).click();
  await decideHold(page, "Cleared, the check continues", "Shift supervisor", "Laser operator cleaned the nozzle");
  await expect(page.getByTestId("hold-strip")).toHaveCount(0);
  await expect(page.locator("li[aria-current=step]")).toContainText("Check holes H1 to H14");

  await doSteps(page, 7, 12);
  await expect(page.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await expect(page.getByTestId("conformance")).toHaveText("100%");
  await waitSaved(page);
  await expect.poll(() => statusOf(request, id)).toBe("complete");

  await page.goto(`/dashboard/${id}`);
  await expect(page.getByTestId("hold-decision").first()).toContainText("Cleared, the check continues, decided by Process engineer");
});

test("Held sessions are left out of conformance and check time; open holds tile", async ({ page }) => {
  const station = unique("Laser cell 7 · FX-HOLD");
  const clean = await startAt(page, station);
  await doSteps(page, 1, 12);
  await waitSaved(page);
  const held = await stopOnCrack(page, station);
  await waitSaved(page);

  await openDashboard(page, station);
  await expect(page.getByTestId("tile-sessions-split")).toHaveText("1 complete · 0 ended without a check · 0 left · 0 running");
  await expect(page.getByTestId("tile-conformance")).toHaveText("100%");
  await expect(page.getByTestId("tile-open-holds")).toHaveText("1");
  await expect(page.getByTestId("oldest-hold")).toHaveText(/^oldest waiting \d+:\d\d$/);

  const row = page.locator(`tr[data-session="${held}"]`);
  await expect(row).toContainText("On hold");
  await expect(row).toContainText("Step 3: Crack seen in the part · check stopped");
  await expect(row.getByTestId("row-conformance")).toHaveText("Not scored");
  await expect(row).toContainText("Not counted");
  await expect(page.locator(`tr[data-session="${clean}"]`).getByTestId("row-conformance")).toHaveText("100%");
});

// ---------- sessions written straight to the API, with times in the past ----------

const MIN = 60_000;
let seq = 0;
const aid = () => `t-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

async function saveSession(request: APIRequestContext, station: string, startedAgoMin: number, actions: Record<string, unknown>[]) {
  const id = aid();
  const createdAt = Date.now() - startedAgoMin * MIN;
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: station, station, operator: "QT-test", createdAt };
  const res = await request.post(`/api/sessions/${id}/actions`, {
    data: { meta, actions: actions.map((a, i) => ({ id: aid(), seq: i + 1, ...a })) },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return id;
}

/** Steps 1 and 2, then a crack lodged `lodgedAgoMin` minutes ago. */
const crackActions = (startedAgoMin: number, lodgedAgoMin: number, did: string) => [
  { type: "next_step", step: 1, at: Date.now() - (startedAgoMin - 1) * MIN },
  { type: "next_step", step: 2, at: Date.now() - (startedAgoMin - 2) * MIN },
  { type: "lodge", did, step: 3, issue: "Crack seen in the part", tried: [], at: Date.now() - lodgedAgoMin * MIN },
];

test("Waiting time is amber, and red once it has waited over 30 minutes", async ({ page, request }) => {
  const station = unique("Laser cell 8 · FX-WAIT");
  const fresh = await saveSession(request, station, 10, crackActions(10, 5, aid()));
  const old = await saveSession(request, station, 50, crackActions(50, 40, aid()));

  await openDashboard(page, station);
  const freshWait = page.locator(`tr[data-session="${fresh}"]`).getByTestId("hold-wait");
  const oldWait = page.locator(`tr[data-session="${old}"]`).getByTestId("hold-wait");
  await expect(freshWait).toHaveText(/^Waiting [45]:\d\d$/);
  await expect(freshWait).toHaveAttribute("data-tone", "amber");
  await expect(oldWait).toHaveText(/^Waiting (39|40):\d\d$/);
  await expect(oldWait).toHaveAttribute("data-tone", "red");
  await expect(page.getByTestId("tile-open-holds")).toHaveText("2");
  await expect(page.getByTestId("oldest-hold")).toHaveAttribute("data-tone", "red");

  await page.locator(`tr[data-session="${old}"]`).click();
  await expect(page.getByTestId("report-outcome")).toContainText("On hold");
  await expect(page.getByTestId("report-hold-wait")).toHaveAttribute("data-tone", "red");
  await expect(page.getByTestId("hold-decision")).toHaveText("No decision recorded yet");
});

test("Older sessions still show: no decision recorded, and the old part-held clearance", async ({ page, request }) => {
  const station = unique("Laser cell 9 · FX-OLD");
  const did = aid();
  // Saved before hold decisions: the old "clear" action ended a stop as "part held".
  const legacy = await saveSession(request, station, 120, [
    ...crackActions(120, 110, did),
    { type: "clear", did, who: "Quality", outcome: "scrapped", reason: "Crack confirmed (old flow)", at: Date.now() - 100 * MIN },
  ]);
  const open = await saveSession(request, station, 90, crackActions(90, 80, aid()));

  await openDashboard(page, station);
  const legacyRow = page.locator(`tr[data-session="${legacy}"]`);
  await expect(legacyRow).toContainText("Part held, not checked");
  await expect(legacyRow.getByTestId("row-conformance")).toHaveText("Not scored");
  await expect(page.getByTestId("tile-sessions-split")).toHaveText("0 complete · 1 ended without a check · 0 left · 0 running");

  await legacyRow.click();
  await expect(page.getByTestId("report-outcome")).toContainText("Part held and not scored");
  await expect(page.getByTestId("hold-decision")).toContainText("Part scrapped, by Quality: Crack confirmed (old flow) (recorded before hold decisions)");

  await page.goto(`/dashboard/${open}`);
  await expect(page.getByTestId("hold-decision")).toHaveText("No decision recorded yet");
  await expect(page.getByTestId("report-conformance")).toHaveText("Not scored");
});
