// Session history marks sample sessions and can hide them, like the dashboard.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { build } from "./fixtures";

async function post(request: APIRequestContext, sample: boolean): Promise<string> {
  const id = `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  // Started a moment ago, so it is near the top of the newest-first list.
  const { actions } = build(id, { day: "2026-09-20", time: "08:00", minutes: 30 });
  const createdAt = Date.now() - 60_000;
  const shifted = actions.map((a, i) => ({ ...a, at: createdAt + (i + 1) * 200 }));
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: "Laser cell 3 · FX-014", operator: "QT-test", createdAt };
  const res = await request.post(`/api/sessions/${id}/actions`, {
    data: { meta, actions: shifted },
    headers: sample ? { "x-fl-sample": "1" } : {}, // test server only (FL_STORAGE=memory)
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return id;
}

test("Session history: SAMPLE chip on sample rows, and the Include sample data switch", async ({ page, request }) => {
  const sample = await post(request, true);
  const real = await post(request, false);

  await page.goto("/sessions?sample=1");
  await expect(page.getByLabel("Include sample data")).toBeChecked();
  await expect(page.locator(`tr[data-session="${sample}"]`).getByTestId("sample-row-chip")).toHaveText("SAMPLE");
  await expect(page.locator(`tr[data-session="${real}"]`)).toBeVisible();
  await expect(page.locator(`tr[data-session="${real}"]`).getByTestId("sample-row-chip")).toHaveCount(0);

  await page.getByLabel("Include sample data").uncheck();
  await expect(page).toHaveURL(/\/sessions\?sample=0/);
  await expect(page.locator(`tr[data-session="${sample}"]`)).toHaveCount(0);
  await expect(page.locator(`tr[data-session="${real}"]`)).toBeVisible();
  await expect(page.getByLabel("Include sample data")).not.toBeChecked();
});
