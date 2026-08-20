// Layer 2 — onboarding end-to-end (charter): the conversation (chips + typed
// "dictation" seeding) ends in an adjustable calorie proposal and a drafted
// week 1 the user approves. Every step asserts screen state AND the diary.
// Realigned post-diagnosis to the real five-step flow; the demands are
// unchanged from the blind version: adjustable proposal, seeded favorites,
// drafted week, approval → GoalSet + SchedulePlanned + RecipeSaved receipts.

import { test, expect } from "@playwright/test";
import { resetFixture, events } from "../harness/db";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ request }) => {
  await resetFixture(request, "fresh");
});

test("onboarding: chips → dictation seeding → adjustable proposal → week 1 drafted → approve", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/onboarding");

  // step 1: direction chips
  await page.getByRole("button", { name: "Get leaner" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // step 2: activity days
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // step 3: the dictation-first seeding question — favorites materialize
  const seedBox = page.getByLabel(/what you eat/i);
  await seedBox.fill("eggs and toast most mornings, chicken burrito bowls, pasta when I'm tired");
  await page.getByRole("button", { name: /make these favorites/i }).click();
  await expect(page.locator(".chip--on").first(), "seeded favorites must appear as cards").toBeVisible({
    timeout: 30_000,
  });
  const savedRecipes = await events("RecipeSaved");
  expect(savedRecipes.length, "seeding must write real library rows").toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // step 4: body basics → the proposal appears as an ADJUSTABLE number
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await page.getByLabel("Weight (lb)").fill("185");
  await page.getByLabel("Height (inches)").fill("70");
  await page.getByLabel("Age").fill("32");
  const number = page.locator(".onb-number");
  await expect(number).toBeVisible();
  const before = Number((await number.textContent())!.replace(/\D/g, ""));
  expect(before).toBeGreaterThan(1200);
  await page.getByRole("button", { name: "Higher" }).click();
  const after = Number((await number.textContent())!.replace(/\D/g, ""));
  expect(after, "the proposal must respond to adjustment").toBe(before + 50);
  await page.getByRole("button", { name: /lock it in/i }).click();

  // step 5: week 1 drafted → approve
  await expect(page.getByText(/week 1, drafted/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /approve week 1/i }).click();
  await expect(page.getByText(/you.re set/i)).toBeVisible({ timeout: 15_000 });

  // the diary carries the receipts
  const goals = await events("GoalSet");
  const nutrition = goals.find((e) => e.payload.kind === "nutrition");
  expect(nutrition, "the accepted proposal must land as a nutrition GoalSet").toBeTruthy();
  expect(nutrition!.payload.daily_calories).toBe(after);
  const planned = await events("SchedulePlanned");
  expect(planned.length, "approving must write the week snapshot").toBe(1);
  const days = planned[0].payload.days;
  expect(days.length).toBe(7);
  expect(days[0].slots.length).toBe(3);
});

test("sloppy: refresh mid-onboarding neither crashes nor forges diary events", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Get leaner" }).click();
  await page.reload();
  await expect(page.locator("main")).not.toContainText(/error|exception/i);
  expect((await events("GoalSet")).length).toBe(0);
  expect((await events("SchedulePlanned")).length).toBe(0);
});
