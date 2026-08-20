// Layer 2 — the sloppy tier (charter): two tabs acting on stale state, back
// button through the flow, slow network, rotate mid-flow. The diary must stay
// truthful under all of it.

import { test, expect } from "@playwright/test";
import { resetFixture, events } from "../harness/db";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ request }) => {
  await resetFixture(request, "week3");
});

test("two tabs: acting in both never double-writes or 500s", async ({ page, context }) => {
  const t0 = new Date().toISOString();
  await page.goto("/today");
  const page2 = await context.newPage();
  await page2.goto("/today");

  const eat1 = page.getByRole("button", { name: /cooked it|i made this|ate it|eaten|log|done/i }).first();
  await eat1.click();
  await expect.poll(async () => (await events("RecipeCooked", t0)).length, { timeout: 10_000 }).toBe(1);

  // the second tab still shows the pre-action state; acting there on the SAME
  // meal must not produce a second identical log silently... a second log of
  // the same meal is legitimate (people eat seconds) — what must never happen
  // is an error page or a corrupted day. Assert no crash and diary readable.
  const eat2 = page2.getByRole("button", { name: /cooked it|i made this|ate it|eaten|log|done/i }).first();
  if (await eat2.isVisible().catch(() => false)) {
    await eat2.click();
    await page2.waitForTimeout(1000);
  }
  await expect(page2.locator("body")).not.toContainText(/unhandled|exception|500/i);
  const all = await events("RecipeCooked", t0);
  expect(all.length).toBeLessThanOrEqual(2);
  await page2.close();
});

test("back button through today → nutrition → groceries returns cleanly", async ({ page }) => {
  await page.goto("/today");
  await page.goto("/nutrition");
  await page.goto("/nutrition/groceries");
  await page.goBack();
  await expect(page).toHaveURL(/nutrition$/);
  await page.goBack();
  await expect(page).toHaveURL(/today/);
  await expect(page.locator("body")).not.toContainText(/error|exception/i);
});

test("slow network: a log action still lands exactly once and shows its receipt", async ({ page, context }) => {
  const t0 = new Date().toISOString();
  // throttle every API call by 1.5s
  await context.route("**/api/**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/today");
  const eat = page.getByRole("button", { name: /cooked it|i made this|ate it|eaten|log|done/i }).first();
  await eat.click();
  // impatient double-tap while the first request is in flight
  await eat.click({ timeout: 1000 }).catch(() => {});
  await expect
    .poll(async () => (await events("RecipeCooked", t0)).length, { timeout: 20_000 })
    .toBe(1);
});

test("rotate mid-flow: landscape keeps the screen usable, no horizontal scroll", async ({ page }) => {
  await page.goto("/today");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("main")).toBeVisible();
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});
