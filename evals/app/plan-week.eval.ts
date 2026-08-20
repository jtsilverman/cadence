// Layer 2 — the plan board (charter): two mapped weeks visible, drag a meal
// between days (desktop), a manual meal swap applied without touching the
// rest of the plan. Realigned post-diagnosis: the board uses pointer-event
// dragging (not HTML5 draggable) and the manual swap lives on the day view.

import { test, expect } from "@playwright/test";
import { resetFixture, events } from "../harness/db";

test.beforeEach(async ({ request }) => {
  await resetFixture(request, "week3");
});

test("week view shows the two planned weeks with every meal named", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  await page.getByRole("tab", { name: /week/i }).click();
  await expect(page.getByText(/this week/i).first()).toBeVisible();
  await expect(page.getByText(/next week/i).first()).toBeVisible();
  await expect(page.getByText(/overnight oats/i).first()).toBeVisible();
  await expect(page.getByText(/chicken burrito bowl/i).first()).toBeVisible();
});

test("desktop: dragging a meal to another day lands a new schedule snapshot with the move", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const t0 = new Date().toISOString();
  await page.goto("/today");
  await page.getByRole("tab", { name: /week/i }).click();

  // drag next week's first planned meal chip onto the following day
  // (planned-only moves; today's chips may already be cooked)
  const before = (await events("SchedulePlanned")).at(-1)!;
  const nextMonday = before.payload.days.map((d: any) => d.date).sort().at(-7);
  const sourceDay = page.locator(`[data-date="${nextMonday}"]`);
  const chip = sourceDay.locator(".board-chip").first();
  await expect(chip).toBeVisible();
  const title = (await chip.textContent())!.trim();

  const targetDate = (() => {
    const d = new Date(`${nextMonday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const target = page.locator(`[data-date="${targetDate}"]`);
  // both source and target must actually be on screen for a pointer drag
  await chip.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  const from = (await chip.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 });
  await page.mouse.up();

  // the move is durable: a fresh snapshot exists and carries the meal on the
  // target day; nothing was lost
  await expect
    .poll(async () => (await events("SchedulePlanned", t0)).length, { timeout: 10_000 })
    .toBe(1);
  const after = (await events("SchedulePlanned", t0))[0];
  const targetDay = after.payload.days.find((d: any) => d.date === targetDate);
  expect(
    targetDay.slots.some((s: any) => s.title === title),
    `${title} should now be on ${targetDate}`
  ).toBe(true);
  const beforeCount = before.payload.days.flatMap((d: any) => d.slots).length;
  const afterCount = after.payload.days.flatMap((d: any) => d.slots).length;
  expect(afterCount, "a move never loses a slot").toBe(beforeCount);
});

test("manual swap changes exactly one slot and shows the receipt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const t0 = new Date().toISOString();
  await page.goto("/today");

  const before = (await events("SchedulePlanned")).at(-1)!;
  const beforeTitles = before.payload.days
    .flatMap((d: any) => d.slots.map((s: any) => `${d.date}|${s.slot_id}|${s.title}`))
    .sort();

  // open the swap options on the first planned meal and pick an alternative
  const swap = page.getByRole("button", { name: "Swap" }).first();
  await expect(swap, "planned meals must offer a manual swap").toBeVisible();
  await swap.click();
  const option = page.locator(".swap-row .chip").first();
  await expect(option).toBeVisible();
  const optionName = (await option.textContent())!.trim();
  await option.click();

  await expect
    .poll(async () => (await events("SchedulePlanned", t0)).length, { timeout: 10_000 })
    .toBe(1);
  const after = (await events("SchedulePlanned", t0))[0];
  const afterTitles = after.payload.days
    .flatMap((d: any) => d.slots.map((s: any) => `${d.date}|${s.slot_id}|${s.title}`))
    .sort();
  const changed = afterTitles.filter((t: string) => !beforeTitles.includes(t));
  expect(changed.length, "a swap changes exactly one slot").toBe(1);
  expect(changed[0]).toContain(optionName);

  // receipt on screen
  await expect(page.getByText(/swapped:/i)).toBeVisible();
});
