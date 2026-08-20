// Layer 1 — render coverage (charter): every site page at 390/768/1440 loads
// with zero console errors, zero horizontal scroll, every image resolved;
// scroll reveals fire; everything renders static under prefers-reduced-motion.
// Authored from site-map.md + the charter, blind to the page code.

import { test, expect, type Page } from "@playwright/test";

const PAGES = ["/", "/faq", "/waitlist", "/waitlist/thanks"];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    test(`render ${path} @${vp.name}: no console errors, no horizontal scroll, images resolve`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const errors = collectErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await page.waitForLoadState("networkidle");

      // no horizontal scroll: the body never scrolls sideways at any width
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement!;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(0);

      // every image actually resolved (naturalWidth 0 = broken)
      const brokenImages = await page.evaluate(() =>
        [...document.querySelectorAll("img")]
          .filter((img) => img.loading !== "lazy" || img.complete)
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.src)
      );
      expect(brokenImages).toEqual([]);

      // scroll the full page so lazy images + scroll-driven work all executes
      await page.evaluate(async () => {
        const el = document.scrollingElement!;
        for (let y = 0; y <= el.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
        window.scrollTo(0, el.scrollHeight);
      });
      await page.waitForTimeout(300);
      const lateBroken = await page.evaluate(() =>
        [...document.querySelectorAll("img")]
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.src)
      );
      expect(lateBroken).toEqual([]);

      expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
    });
  }
}

test("scroll reveals fire on the landing: content scrolled into view becomes visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // the dark Live band's chat moments are the deepest revealed content;
  // center the element so a view()-timeline reveal has fully entered
  const moment = page.getByText(/Caesar salad/i).first();
  await moment.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior })
  );
  await page.waitForTimeout(400);
  await expect(moment).toBeVisible();
  const opacity = await moment.evaluate((el) => {
    let node: Element | null = el;
    while (node) {
      const o = Number(getComputedStyle(node).opacity);
      if (o < 0.99) return o;
      node = node.parentElement;
    }
    return 1;
  });
  expect(opacity, "revealed content still transparent after scrolling into view").toBeGreaterThan(0.99);
});

test("prefers-reduced-motion renders the landing static and fully visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // without motion, revealed content must simply be there — no opacity holes
  const moment = page.getByText(/Caesar salad/i).first();
  await moment.scrollIntoViewIfNeeded();
  await expect(moment).toBeVisible();
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.textContent?.trim() && el.children.length === 0)
      .filter((el) => Number(getComputedStyle(el).opacity) === 0)
      .slice(0, 5)
      .map((el) => el.textContent!.trim().slice(0, 40))
  );
  expect(hidden, "content invisible under reduced motion").toEqual([]);
});
