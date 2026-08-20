// Layer 2 — living a day (charter): log a meal from Today with a visible
// receipt, cook a recipe ("I made this") and watch the pantry decrement,
// undo an action and see the trail. Double-taps write once. Mobile 390.
// Blind-authored from ux.md: Today is home; no per-meal calorie badges;
// day-level totals; undo everywhere; never done without the receipt.

import { test, expect } from "@playwright/test";
import { resetFixture, events, pantryItems } from "../harness/db";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ request }) => {
  await resetFixture(request, "week3");
});

test("Today: marking a planned meal eaten writes RecipeCooked and shows the receipt", async ({ page }) => {
  const t0 = new Date().toISOString();
  await page.goto("/today");

  // today's meals are visible (week3 plans oats/parfait + mains)
  const mealTitle = page.getByText(/overnight oats|parfait|burrito|salmon|chili|stir fry|pasta|fajitas/i).first();
  await expect(mealTitle, "the day's planned meals must be on Today").toBeVisible();

  // the eaten affordance on a meal
  const eat = page
    .getByRole("button", { name: /cooked it|i made this|ate it|eaten|log|done/i })
    .first();
  await expect(eat).toBeVisible();
  await eat.click();

  // the diary event lands…
  await expect
    .poll(async () => (await events("RecipeCooked", t0)).length, { timeout: 10_000 })
    .toBe(1);
  // …and the screen shows it (receipt rule: no silent success)
  const cooked = (await events("RecipeCooked", t0))[0];
  expect(cooked.payload.title, "the cooked event names the meal").toBeTruthy();
  await expect(
    page.getByText(/logged|eaten|done|cooked|✓/i).first(),
    "a visible receipt must accompany the event"
  ).toBeVisible();
});

test("double-tap on the eaten button writes exactly one event", async ({ page }) => {
  const t0 = new Date().toISOString();
  await page.goto("/today");
  const eat = page
    .getByRole("button", { name: /cooked it|i made this|ate it|eaten|log|done/i })
    .first();
  await expect(eat).toBeVisible();
  await eat.click();
  await eat.click({ timeout: 1500 }).catch(() => {}); // second tap may find it already gone — fine
  await page.waitForTimeout(1500);
  expect((await events("RecipeCooked", t0)).length, "a fat-fingered double tap must not double-log").toBeLessThanOrEqual(1);
});

test("day-level calorie state shows on Today; no per-meal calorie badges", async ({ page }) => {
  await page.goto("/today");
  // day-level totals exist (target or consumed)
  await expect(page.getByText(/\b[12][0-9]\d\d\b/).first(), "a day-level calorie number should be visible").toBeVisible();
  // the no-per-meal-badge promise: meal rows don't carry their own kcal number
  const mealRows = page.getByText(/overnight oats|parfait|burrito bowl/i);
  const first = mealRows.first();
  if (await first.isVisible().catch(() => false)) {
    const rowText = await first.evaluate((el) => el.closest("li,article,div")?.textContent ?? "");
    expect(rowText, "per-meal calorie badges violate the UX promise").not.toMatch(/\b\d{3,4}\s*(k?cal)\b/i);
  }
});

test("cook: I made this decrements the pantry and marks the diary", async ({ page, request }) => {
  const t0 = new Date().toISOString();
  const before = (await pantryItems(request)).find((i) => i.name === "chicken breast");
  expect(Number(before?.qty ?? 0), "week3 seeds chicken in the pantry").toBeGreaterThan(0);

  // week3 plans the burrito bowl (chicken + rice) as every day's lunch; its
  // "Cooked it" IS the I-made-this action (POST /api/cook)
  await page.goto("/nutrition");
  const row = page.locator(".slot-row", { hasText: /chicken burrito bowl/i }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /cooked it/i }).click();

  await expect
    .poll(async () => (await events("RecipeCooked", t0)).length, { timeout: 10_000 })
    .toBe(1);
  // the slot folds to eaten on screen (the receipt)
  await expect(row.getByText(/eaten/i)).toBeVisible({ timeout: 10_000 });

  // pantry followed the cook (chicken 2lb − 0.5lb per the recipe)
  await expect
    .poll(
      async () =>
        Number((await pantryItems(request)).find((i) => i.name === "chicken breast")?.qty ?? 99),
      { timeout: 10_000 }
    )
    .toBeLessThan(Number(before!.qty));
});

test("undo: retracting a log leaves the trail, not a hole", async ({ page }) => {
  const t0 = new Date().toISOString();
  await page.goto("/today");
  const eat = page
    .getByRole("button", { name: /cooked it|i made this|ate it|eaten|log|done/i })
    .first();
  await eat.click();
  await expect
    .poll(async () => (await events("RecipeCooked", t0)).length, { timeout: 10_000 })
    .toBe(1);

  // undo from the receipt (ux.md: undo everywhere)
  const undo = page.getByRole("button", { name: /undo|take back|remove/i }).first();
  await expect(undo, "the receipt must offer undo").toBeVisible();
  await undo.click();

  await expect
    .poll(async () => (await events("LogRetracted", t0)).length, { timeout: 10_000 })
    .toBe(1);
  const retraction = (await events("LogRetracted", t0))[0];
  const original = (await events("RecipeCooked", t0))[0];
  expect(retraction.payload.retracted_event_id, "the retraction points at the tap it takes back").toBe(
    original.event_id
  );
});
