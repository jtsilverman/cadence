// Layer 2 — the coach through the UI (charter): the dock reaches the
// conversation from every screen; a sentence log writes the diary with the
// receipt in the reply; a chat-prompted plan change is proposed then
// approved, never silent. Realigned post-diagnosis: the dock is a one-tap
// entry point into /coach (the conversation surface), not an inline input.

import { test, expect, type Page } from "@playwright/test";
import { resetFixture, events } from "../harness/db";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ request }) => {
  await resetFixture(request, "week3");
});

async function coachSay(page: Page, text: string): Promise<void> {
  const input = page.getByLabel("Message");
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
}

test("the coach dock is one tap away on Today, Nutrition, and Journal", async ({ page }) => {
  for (const screen of ["/today", "/nutrition", "/journal"]) {
    await page.goto(screen);
    const dock = page.locator(".coach-dock a, a[href='/coach']").first();
    await expect(dock, `coach dock missing on ${screen}`).toBeVisible();
  }
  await page.locator(".coach-dock a").first().click();
  await expect(page).toHaveURL(/\/coach/);
  await expect(page.getByLabel("Message")).toBeVisible();
});

test("sentence log via coach: one diary event, receipt in the reply", async ({ page }) => {
  test.setTimeout(90_000);
  const t0 = new Date().toISOString();
  await page.goto("/coach");
  await coachSay(page, "I had a chicken chipotle bowl and 3 rice cakes with peanut butter");

  await expect
    .poll(async () => (await events("RecipeCooked", t0)).length, { timeout: 45_000 })
    .toBe(1);
  const logged = (await events("RecipeCooked", t0))[0];
  expect(logged.source).toBe("chat");
  expect(logged.payload.nutrition?.calories, "a sentence log carries an estimate").toBeGreaterThan(300);
  expect(logged.precision, "an estimate must never claim exactness").not.toBe("exact");

  // the receipt is visible in the conversation
  await expect(page.getByText(/✓ Logged/i).first()).toBeVisible({ timeout: 15_000 });
});

test("chat-prompted plan change is proposed, then approved, then on the calendar", async ({ page }) => {
  test.setTimeout(120_000);
  const t0 = new Date().toISOString();
  await page.goto("/coach");
  await coachSay(page, "swap tomorrow's dinner for something faster to cook");

  // proposed, never imposed: the pair opens, the locked week is untouched
  await expect
    .poll(async () => (await events("SuggestionMade", t0)).length, { timeout: 45_000 })
    .toBeGreaterThanOrEqual(1);
  expect(
    (await events("SchedulePlanned", t0)).length,
    "the locked week must not change before approval"
  ).toBe(0);

  // approve from the conversation
  const approve = page.getByRole("button", { name: /approve/i }).first();
  await expect(approve, "the proposal must be approvable on screen").toBeVisible({ timeout: 15_000 });
  await approve.click();

  await expect
    .poll(async () => (await events("SchedulePlanned", t0)).length, { timeout: 30_000 })
    .toBe(1);
  await expect
    .poll(
      async () => (await events("SuggestionResolved", t0)).some((e) => e.payload.outcome === "accepted"),
      { timeout: 15_000 }
    )
    .toBe(true);
  // the confirmation names the change
  await expect(page.getByText(/done — it's on the calendar/i)).toBeVisible();
});
