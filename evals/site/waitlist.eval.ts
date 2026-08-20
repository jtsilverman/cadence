// Layer 1 — waitlist submissions at all three demand tiers (charter):
// happy path, survey ride-along, invalid emails with a humane message, empty
// submit, double-click, resubmit, XSS-shaped freetext, attribution on the
// row. THE DB ROW is the assertion, not the thanks page; the thanks page may
// only ever render after the durable write (receipt rule).

import { test, expect, type Page } from "@playwright/test";
import { resetFixture, waitlistRow, waitlistCount, evalDb } from "../harness/db";

test.beforeAll(async ({ request }) => {
  await resetFixture(request, "fresh");
});

const email = (tag: string) => `eval-${tag}-${Date.now()}@example.com`;

async function submitEmail(page: Page, value: string): Promise<void> {
  const input = page.locator("input[type='email'], input[name*='email' i]").first();
  await input.fill(value);
  await page.getByRole("button", { name: /join|sign|wait|submit|list|early access/i }).first().click();
}

test("email-only happy path: durable row, then thanks", async ({ page }) => {
  const addr = email("happy");
  await page.goto("/waitlist");
  await submitEmail(page, addr);
  await page.waitForURL(/thanks/);
  const row = await waitlistRow(addr);
  expect(row, "waitlist row must exist once thanks renders").not.toBeNull();
});

test("attribution: UTM + CTA travel from the landing click to the row", async ({ page }) => {
  const addr = email("utm");
  await page.goto("/?utm_source=tiktok&utm_medium=paid&utm_campaign=aug-launch");
  // click through a landing CTA so the click, not the URL, carries the chain
  await page.locator("main a[href*='waitlist']").first().click();
  await expect(page).toHaveURL(/\/waitlist/);
  // human pacing: let the page hydrate before typing (a pre-hydration submit
  // still banks the email via the native path, but attribution is JS-side)
  await page.waitForLoadState("networkidle");
  await submitEmail(page, addr);
  await page.waitForURL(/thanks/);
  const row = await waitlistRow(addr);
  expect(row).not.toBeNull();
  expect(row!.utm_source).toBe("tiktok");
  expect(row!.utm_medium).toBe("paid");
  expect(row!.utm_campaign).toBe("aug-launch");
  expect(row!.cta, "which button converted must be on the row").toBeTruthy();
});

test("full survey ride-along lands on the same row", async ({ page }) => {
  const addr = email("survey");
  await page.goto("/waitlist");

  // answer whatever the survey offers: first radio-ish pick, a checkbox or
  // two, a worth answer, freetext, opt-in — the demand is that answers RIDE
  // ALONG with the one submit and land on the same row
  // survey controls are custom-styled labels over visually-hidden inputs —
  // drive them the way a user does, by clicking the labels
  const freetext = page.locator("textarea").first();
  if (await freetext.count()) await freetext.fill("I always quit when one bad day snowballs.");
  const radioLabels = page.locator("label:has(input[type='radio'])");
  if (await radioLabels.count()) await radioLabels.first().click();
  const checkLabels = page.locator("label:has(input[type='checkbox'])");
  const checkCount = await checkLabels.count();
  for (let i = 0; i < Math.min(2, checkCount); i++) await checkLabels.nth(i).click();

  await submitEmail(page, addr);
  await page.waitForURL(/thanks/);
  const row = await waitlistRow(addr);
  expect(row).not.toBeNull();
  const surveyed =
    row!.survey_pick || row!.survey_tools || row!.survey_features || row!.survey_wish || row!.surveyed_at;
  expect(surveyed, "survey answers must land on the same waitlist row").toBeTruthy();
});

for (const bad of ["a@b", "has space@example.com", "плохой@пример", "no-at-sign.com"]) {
  test(`invalid email ${JSON.stringify(bad)} is rejected with a humane message, no row`, async ({ page }) => {
    await page.goto("/waitlist");
    await submitEmail(page, bad);
    await expect(page).not.toHaveURL(/thanks/);
    // some visible feedback exists and it is humane (no stack traces, no codes)
    await page.waitForTimeout(500);
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain("error:");
    expect(bodyText).not.toContain("exception");
    const count = await waitlistCount(bad);
    expect(count, "invalid email must not produce a row").toBe(0);
  });
}

test("500-char email is rejected, no row", async ({ page }) => {
  const huge = `${"a".repeat(490)}@example.com`;
  await page.goto("/waitlist");
  await submitEmail(page, huge);
  await expect(page).not.toHaveURL(/thanks/);
  expect(await waitlistCount(huge)).toBe(0);
});

test("empty submit does not navigate and writes nothing", async ({ page }) => {
  const before = Number(
    (await evalDb().execute(`SELECT COUNT(*) AS n FROM waitlist`)).rows[0].n
  );
  await page.goto("/waitlist");
  await page.getByRole("button", { name: /join|sign|wait|submit|list|early access/i }).first().click();
  await page.waitForTimeout(500);
  await expect(page).not.toHaveURL(/thanks/);
  const after = Number(
    (await evalDb().execute(`SELECT COUNT(*) AS n FROM waitlist`)).rows[0].n
  );
  expect(after).toBe(before);
});

test("double-click submit produces exactly one row", async ({ page }) => {
  const addr = email("double");
  await page.goto("/waitlist");
  const input = page.locator("input[type='email'], input[name*='email' i]").first();
  await input.fill(addr);
  const button = page.getByRole("button", { name: /join|sign|wait|submit|list|early access/i }).first();
  await button.click();
  await button.click({ timeout: 2000 }).catch(() => {}); // second tap may race navigation
  await page.waitForURL(/thanks/);
  expect(await waitlistCount(addr)).toBe(1);
});

test("resubmitting the same email is graceful, still one row", async ({ page }) => {
  const addr = email("resubmit");
  await page.goto("/waitlist");
  await submitEmail(page, addr);
  await page.waitForURL(/thanks/);
  await page.goto("/waitlist");
  await submitEmail(page, addr);
  await page.waitForTimeout(1000);
  // no crash: either thanks again or a friendly already-on-it message
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  expect(bodyText).not.toContain("exception");
  expect(bodyText).not.toContain("unique constraint");
  expect(await waitlistCount(addr)).toBe(1);
});

test("XSS-shaped survey freetext is stored inert and never executes", async ({ page }) => {
  const addr = email("xss");
  const payload = `<script>window.__pwned=1</script><img src=x onerror="window.__pwned=2">`;
  await page.goto("/waitlist");
  const freetext = page.locator("textarea").first();
  test.skip((await freetext.count()) === 0, "no freetext field on the waitlist page");
  await freetext.fill(payload);
  await submitEmail(page, addr);
  await page.waitForURL(/thanks/);
  const row = await waitlistRow(addr);
  expect(row).not.toBeNull();
  expect(String(row!.survey_wish ?? "")).toContain("<script>");
  const pwned = await page.evaluate(() => (window as any).__pwned);
  expect(pwned).toBeUndefined();
});
