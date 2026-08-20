// Layer 2 — the a11y gate (charter): keyboard-navigable forms, visible
// focus, tap targets ≥44px on the primary actions. Mobile 390.

import { test, expect } from "@playwright/test";
import { resetFixture } from "../harness/db";

test.use({ viewport: { width: 390, height: 844 } });

const SCREENS = ["/today", "/nutrition", "/nutrition/groceries", "/nutrition/pantry", "/journal"];

test.beforeAll(async ({ request }) => {
  await resetFixture(request, "week3");
});

for (const screen of SCREENS) {
  test(`tap targets ≥44px on ${screen}`, async ({ page }) => {
    await page.goto(screen);
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() => {
      const MIN = 44;
      return [...document.querySelectorAll<HTMLElement>("button, a[href], [role='button']")]
        .filter((el) => el.offsetParent !== null) // visible
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent ?? "").trim().slice(0, 30), w: r.width, h: r.height };
        })
        .filter((t) => t.w > 0 && (t.h < MIN - 4 || (t.w < MIN - 4 && t.h < MIN - 4)))
        .slice(0, 8);
    });
    expect(small, `undersized tap targets: ${JSON.stringify(small)}`).toEqual([]);
  });
}

test("keyboard: tab reaches interactive controls with visible focus on Today", async ({ page }) => {
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  const reached: string[] = [];
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const focusVisible =
        style.outlineStyle !== "none" || style.boxShadow !== "none" || el.matches(":focus-visible");
      return { tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 20), focusVisible };
    });
    if (info) {
      reached.push(`${info.tag}:${info.text}`);
      expect(info.focusVisible, `focus invisible on ${info.tag} "${info.text}"`).toBe(true);
    }
  }
  expect(reached.length, "tab must reach interactive controls").toBeGreaterThan(2);
});
