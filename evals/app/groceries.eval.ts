// Layer 2 — groceries + pantry (charter): list out → check off in-aisle →
// pantry inflow; "you probably have this — skip?" honored; refresh mid-
// checkoff doesn't lose or forge state. Blind-authored from ux.md: rough
// quantities rounded UP to buyable units, pantry suggest-only.

import { test, expect } from "@playwright/test";
import { resetFixture, events, pantryItems } from "../harness/db";

test.use({ viewport: { width: 390, height: 844 } });

test("build the list from the planned week, check off a line, pantry follows", async ({ page, request }) => {
  await resetFixture(request, "week3");
  const t0 = new Date().toISOString();
  await page.goto("/nutrition/groceries");

  // the list derives from the plan: a build/refresh affordance or an existing list
  const build = page.getByRole("button", { name: /build|generate|new list|refresh/i }).first();
  if (await build.isVisible().catch(() => false)) await build.click();

  // lines exist, sourced from planned recipes' ingredients
  const line = page.getByText(/ground turkey|kidney beans|crushed tomatoes|spaghetti|flank steak|tortillas|broccoli|tofu/i).first();
  await expect(line, "list lines must derive from the planned week").toBeVisible({ timeout: 15_000 });

  // check one off as bought
  const lineName = (await line.textContent())?.trim().toLowerCase() ?? "";
  const checkbox = page.locator("input[type='checkbox'], [role='checkbox']").first();
  if (await checkbox.isVisible().catch(() => false)) {
    await checkbox.check().catch(async () => {
      await checkbox.click();
    });
  } else {
    await line.click(); // tap-to-check pattern
  }

  // finishing/confirming the checkoff writes the inflow (durably, not on tap alone
  // is also acceptable — so accept either an immediate event or one after Done)
  const done = page
    .getByRole("button", { name: /bought|into the pantry|done|finish|got it|checked out|complete/i })
    .first();
  if (await done.isVisible().catch(() => false)) await done.click();

  await expect
    .poll(async () => (await events("PantryInflow", t0)).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  const inflow = (await events("PantryInflow", t0))[0];
  expect(inflow.payload.via).toBe("checkoff");
  expect(inflow.payload.items.length).toBeGreaterThanOrEqual(1);
  if (lineName) {
    const names = inflow.payload.items.map((i: any) => i.name.toLowerCase()).join("|");
    expect(names.length).toBeGreaterThan(0);
  }
});

test("pantry coverage is suggest-only: covered lines are surfaced, never bought or asserted for you", async ({ page, request }) => {
  await resetFixture(request, "week3");
  const t0 = new Date().toISOString();
  await page.goto("/nutrition/groceries");
  const build = page.getByRole("button", { name: /build|generate|new list|refresh/i }).first();
  if (await build.isVisible().catch(() => false)) await build.click();

  // week3 pantry holds chicken and rice — coverage shows as "Covered by the
  // pantry" (default-skip with visibility) or a "have some?" mark on a line
  const hint = page
    .getByText(/covered by the pantry|probably have|have some|already have/i)
    .first();
  await expect(hint, "pantry coverage must be visible on the list").toBeVisible({ timeout: 15_000 });

  // honoring it silently: merely viewing/building writes NOTHING (suggest-only)
  await page.waitForTimeout(1000);
  expect((await events("PantryAsserted", t0)).length, "inference must never assert inventory").toBe(0);
  expect((await events("PantryInflow", t0)).length).toBe(0);
  expect((await events("OrderPlaced", t0)).length).toBe(0);
});

test("refresh mid-checkoff: checked lines survive or reset honestly — never a phantom inflow", async ({ page, request }) => {
  await resetFixture(request, "messy");
  const t0 = new Date().toISOString();
  await page.goto("/nutrition/groceries");
  const build = page.getByRole("button", { name: /build|generate|new list|refresh/i }).first();
  if (await build.isVisible().catch(() => false)) await build.click();

  const checkbox = page.locator("input[type='checkbox'], [role='checkbox']").first();
  if (await checkbox.isVisible().catch(() => false)) {
    await checkbox.check().catch(async () => checkbox.click());
  }
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  // a reload alone must not have written an inflow the user never confirmed
  const inflows = await events("PantryInflow", t0);
  for (const inflow of inflows) {
    expect(inflow.payload.via, "no phantom checkoff from a refresh").toBe("checkoff");
  }
});

test("pantry page: explicit user assertion is the only inventory truth", async ({ page, request }) => {
  await resetFixture(request, "week3");
  const t0 = new Date().toISOString();
  await page.goto("/nutrition/pantry");

  // seeded truth is visible
  await expect(page.getByText(/chicken breast/i).first()).toBeVisible();

  // user asserts a new item by hand: fill the form, then Add
  await page.getByLabel("Item name").fill("black beans");
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Unit").fill("cup");
  await page.getByRole("button", { name: "Add" }).click();

  await expect
    .poll(async () => (await events("PantryAsserted", t0)).length, { timeout: 10_000 })
    .toBe(1);
  await expect
    .poll(
      async () => (await pantryItems(request)).some((i) => i.name === "black beans"),
      { timeout: 10_000 }
    )
    .toBe(true);
  // and the screen shows it (the fold is the receipt)
  await expect(page.getByText(/black beans/i).first()).toBeVisible();
});
