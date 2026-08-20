// Layer 1 — the pre-hydration / no-JS signup path (charter receipt rule).
// A user on a slow connection can submit the waitlist form before React
// hydrates (or with JS off entirely); the conversion must still bank durably
// and end on the thanks page — never a silent reload that loses the email.

import { test, expect } from "@playwright/test";
import { resetFixture, waitlistRow } from "../harness/db";

test.use({ javaScriptEnabled: false });

test.beforeAll(async ({ request }) => {
  await resetFixture(request, "fresh");
});

test("waitlist submit with JS disabled still banks the row and lands on thanks", async ({ page }) => {
  const addr = `eval-nojs-${Date.now()}@example.com`;
  await page.goto("/waitlist");
  await page.locator("input[type='email']").first().fill(addr);
  await page.getByRole("button", { name: /join|sign|wait|submit|list|early access/i }).first().click();
  await expect(page).toHaveURL(/thanks/);
  const row = await waitlistRow(addr);
  expect(row, "the no-JS submit must write the row before thanks renders").not.toBeNull();
});
