// vision:3 and the vision's invariant — the three funnel pages wear the main
// page's chrome, and that chrome still captures the campaign that sent the
// visitor. The capture component renders nothing, so the second test asserts
// its side effect on sessionStorage rather than its presence in the DOM. A nav
// rebuilt without it leaves every other test green while every UTM is lost;
// that regression already shipped once in the v4 rebuild.
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FaqPage from "@/app/faq/page";
import WaitlistPage from "@/app/waitlist/page";
import Thanks from "@/app/waitlist/thanks/page";

// The nav CTA points at /waitlist, so neither the waitlist page nor the
// thank-you page carries one: the visitor is already there, or already on.
const PAGES = [
  ["/faq", FaqPage, true],
  ["/waitlist", WaitlistPage, false],
  ["/waitlist/thanks", Thanks, false],
] as const;

afterEach(cleanup);
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/?utm_source=reddit&utm_medium=post&utm_campaign=loseit");
});

describe("the funnel pages wear the main page's chrome", () => {
  for (const [path, Page, hasCta] of PAGES) {
    it(`${path} renders the funnel nav and the funnel footer`, () => {
      const { container } = render(<Page />);
      expect(container.querySelector(".funnel-navbar"), "funnel nav").toBeTruthy();
      expect(container.querySelector(".funnel .foot"), "funnel footer").toBeTruthy();
      const cta = container.querySelector(".funnel-navbar .cta");
      if (hasCta) {
        expect(cta, "the bare CTA").toBeTruthy();
        expect(cta?.getAttribute("href")).toBe("/waitlist");
      } else {
        expect(cta, "no CTA back to the page you are on").toBeNull();
      }
    });
  }
});

describe("the funnel pages still capture the campaign that sent the visitor", () => {
  for (const [path, Page] of PAGES) {
    it(`${path} banks the arriving utm params on mount`, () => {
      render(<Page />);
      const stored = JSON.parse(sessionStorage.getItem("cadence.attribution") ?? "{}");
      expect(stored.utm_source).toBe("reddit");
      expect(stored.utm_medium).toBe("post");
      expect(stored.utm_campaign).toBe("loseit");
    });
  }
});

// vision:4 — the funnel promises nothing Cadence does not do. Jake cut the
// weekly-note promise on 2026-08-18: nothing sends a weekly email, so the
// thank-you page and the waitlist page must not say one is coming.
describe("the funnel makes no promise nobody kept", () => {
  for (const [path, Page] of PAGES) {
    it(`${path} never promises a note every week`, () => {
      const { container } = render(<Page />);
      expect(container.textContent ?? "").not.toMatch(/note a week|weekly note|every week/i);
    });
  }
});
