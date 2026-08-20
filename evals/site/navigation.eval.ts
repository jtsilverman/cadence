// Layer 1 — click coverage (charter + site-map.md): every link and CTA lands
// where the site map says; FAQ accordion opens one-at-a-time; back button and
// deep loads behave; no dead links anywhere. Blind to the page code.

import { test, expect } from "@playwright/test";

test("nav: How it works anchors to the plan band; Questions goes to /faq; CTA goes to /waitlist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /how it works/i }).click();
  await expect(page).toHaveURL(/#plan/);
  await page.goto("/");
  await page.getByRole("link", { name: /questions/i }).first().click();
  await expect(page).toHaveURL(/\/faq$/);
  await page.goto("/");
  const navCta = page.locator("header a[href*='waitlist'], nav a[href*='waitlist']").first();
  await navCta.click();
  await expect(page).toHaveURL(/\/waitlist/);
});

test("hero and closing CTAs both land on /waitlist", async ({ page }) => {
  await page.goto("/");
  const ctas = page.locator("main a[href*='waitlist']");
  const count = await ctas.count();
  expect(count, "landing should carry at least a hero and a closing CTA").toBeGreaterThanOrEqual(2);
  await ctas.first().click();
  await expect(page).toHaveURL(/\/waitlist/);
  await page.goto("/");
  await ctas.last().scrollIntoViewIfNeeded();
  await ctas.last().click();
  await expect(page).toHaveURL(/\/waitlist/);
});

test("footer: Questions link works; contact is a real mailto", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await footer.scrollIntoViewIfNeeded();
  await footer.getByRole("link", { name: /questions/i }).click();
  await expect(page).toHaveURL(/\/faq$/);
});

test("no dead internal links on any page", async ({ page, request }) => {
  const seen = new Set<string>();
  for (const path of ["/", "/faq", "/waitlist", "/waitlist/thanks"]) {
    await page.goto(path);
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!)
    );
    for (const href of hrefs) {
      expect(href, `empty/hash-only link on ${path}`).not.toMatch(/^#?$/);
      if (href.startsWith("mailto:") || href.startsWith("http")) continue;
      const target = href.split("#")[0];
      if (!target || seen.has(target)) continue;
      seen.add(target);
      const res = await request.get(target);
      expect(res.status(), `dead link ${href} on ${path}`).toBeLessThan(400);
    }
  }
});

test("FAQ accordion opens one at a time", async ({ page }) => {
  await page.goto("/faq");
  const items = page.locator("button[aria-expanded]");
  const n = await items.count();
  expect(n, "FAQ should have several questions").toBeGreaterThanOrEqual(5);

  // never more than one open — including whatever the page opens by default
  const openInitially = await page.locator("button[aria-expanded='true']").count();
  expect(openInitially).toBeLessThanOrEqual(1);

  await items.nth(1).click();
  await expect(items.nth(1)).toHaveAttribute("aria-expanded", "true");
  expect(
    await page.locator("button[aria-expanded='true']").count(),
    "opening a second question must close the first"
  ).toBe(1);
  await expect(items.nth(0)).toHaveAttribute("aria-expanded", "false");

  // an open question closes on its own second tap
  await items.nth(1).click();
  await expect(items.nth(1)).toHaveAttribute("aria-expanded", "false");

  // Closed means closed, measured. aria-expanded flipping is not the same as
  // the answer being gone: the collapsing panel shipped twice with a floor
  // under it, once at full height and once at 30px, and every attribute
  // assertion passed both times
  // (traces/2026-08-18-grid-0fr-accordion-floored-by-child-padding.md).
  const closedHeights = async () =>
    page.$$eval(".faq-panel:not(.faq-panel--open)", (panels) =>
      panels.map((p) => Math.round(p.getBoundingClientRect().height))
    );
  await expect
    .poll(async () => Math.max(...(await closedHeights())), {
      message: "every closed answer must collapse to nothing",
      timeout: 3000,
    })
    .toBe(0);
});

test("back button walks back through the flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /questions/i }).first().click();
  await expect(page).toHaveURL(/\/faq$/);
  const cta = page.locator("a[href*='waitlist']").first();
  await cta.click();
  await expect(page).toHaveURL(/\/waitlist/);
  await page.goBack();
  await expect(page).toHaveURL(/\/faq$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$|\/\?/);
});

test("deep direct loads work for every page", async ({ page }) => {
  for (const path of ["/faq", "/waitlist", "/waitlist/thanks"]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} direct load`).toBe(200);
    await expect(page.locator("main")).toBeVisible();
  }
});
