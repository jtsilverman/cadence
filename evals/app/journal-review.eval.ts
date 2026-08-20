// Layer 2 — the diary surface (charter): history shows what happened
// including the correction trail; the Sunday review exists; unlogged days
// are never claimed as successes. Blind-authored from ux.md §Journal.

import { test, expect } from "@playwright/test";
import { resetFixture } from "../harness/db";

test.use({ viewport: { width: 390, height: 844 } });

test("journal shows real history from the messy household, correction included", async ({ page, request }) => {
  await resetFixture(request, "messy");
  await page.goto("/journal");

  // history renders actual eaten meals
  await expect(page.getByText(/chili|burrito|salmon|stir fry|pasta|fajitas|pizza|burger/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // the two-bowls correction: the final state shows the corrected entry, and
  // the trail is visible or reachable (undo leaves a record, not a hole)
  await expect(page.getByText(/two bowls/i).first(), "the corrected entry is the visible truth").toBeVisible();
});

test("the weekly review surface exists and reflects the week honestly", async ({ page, request }) => {
  await resetFixture(request, "messy");
  await page.goto("/journal");
  const review = page.getByText(/review|reflect|this week|sunday/i).first();
  await expect(review, "ux.md promises a weekly review in Journal").toBeVisible();
  // an honest week: messy seeded overshoots — the review must not read as all-green
  const body = (await page.locator("main").innerText()).toLowerCase();
  expect(body).not.toMatch(/perfect week|100%|flawless/);
});

test("no fabricated streaks: unlogged days don't count as wins", async ({ page, request }) => {
  await resetFixture(request, "messy");
  await page.goto("/journal");
  const body = (await page.locator("main").innerText()).toLowerCase();
  // messy has unlogged days every 5 days — a 21-day streak would be a lie
  expect(body).not.toMatch(/21[- ]day streak|3[- ]week streak/);
});
