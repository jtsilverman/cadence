// Layer 1 — the FAQ ask-a-question box (site-map.md): a question with an
// email and one without both persist as objection data; hostile input stays
// inert. DB rows are the assertion.

import { test, expect } from "@playwright/test";
import { resetFixture, questionRows } from "../harness/db";

test.beforeAll(async ({ request }) => {
  await resetFixture(request, "fresh");
});

// There is no email field on the FAQ page by design: a question carries the
// asker's email only when they already joined the waitlist (joinedEmail is
// remembered client-side). The "with email" journey is join → ask.
test("question from a joined member carries their email", async ({ page }) => {
  const addr = `asker-${Date.now()}@example.com`;
  await page.goto("/waitlist");
  await page.locator("input[type='email']").first().fill(addr);
  await page.getByRole("button", { name: /join|sign|wait|submit|list|early access/i }).first().click();
  await page.waitForURL(/thanks/);

  await page.goto("/faq");
  const q = `Will this work for a family of four? ${Date.now()}`;
  const box = page.locator("textarea, input[type='text']").last();
  await box.scrollIntoViewIfNeeded();
  await box.fill(q);
  await page.getByRole("button", { name: /ask|send|submit/i }).last().click();
  await expect
    .poll(async () => (await questionRows()).some((r) => r.question === q))
    .toBe(true);
  const row = (await questionRows()).find((r) => r.question === q)!;
  expect(row.email, "a joined member's question should carry their address").toBe(addr);
});

test("question without email still persists — a reply address is optional", async ({ page }) => {
  await page.goto("/faq");
  const q = `Anonymous objection ${Date.now()}`;
  const box = page.locator("textarea, input[type='text']").last();
  await box.scrollIntoViewIfNeeded();
  await box.fill(q);
  await page.getByRole("button", { name: /ask|send|submit/i }).last().click();
  await expect
    .poll(async () => (await questionRows()).some((r) => r.question === q))
    .toBe(true);
});

test("empty question does not persist a blank row", async ({ page }) => {
  await page.goto("/faq");
  const before = (await questionRows()).length;
  const btn = page.getByRole("button", { name: /ask|send|submit/i }).last();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(500);
  expect((await questionRows()).length).toBe(before);
});

test("injection-shaped question is stored verbatim, table intact", async ({ page }) => {
  await page.goto("/faq");
  const q = `'); DROP TABLE questions; -- ${Date.now()}`;
  const box = page.locator("textarea, input[type='text']").last();
  await box.scrollIntoViewIfNeeded();
  await box.fill(q);
  await page.getByRole("button", { name: /ask|send|submit/i }).last().click();
  await expect
    .poll(async () => (await questionRows()).some((r) => r.question === q))
    .toBe(true);
});
