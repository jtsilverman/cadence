// Landing v4 (specs/landing-v4.md): Eight Sleep anatomy transplant.
// Behavioral coverage for the acceptance criteria a DOM render can observe:
// AC1 board gone, AC4 hotspot popups + mobile story parity, AC5 carousels,
// AC6 copy sources, AC7 shared chrome, AC10 persona grid.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Landing from "@/app/page";
import FaqPage from "@/app/faq/page";

afterEach(cleanup);

describe("landing v4: the board is gone (AC1)", () => {
  it("renders no week board and no meal chips", () => {
    const { container } = render(<Landing />);
    expect(container.querySelector(".week-board")).toBeNull();
    expect(container.querySelector(".week-meal")).toBeNull();
  });

  it("hero is static: no cycling photo layers (AC8)", () => {
    const { container } = render(<Landing />);
    expect(container.querySelector(".hero-cycle")).toBeNull();
  });
});

describe("plan band (AC4, revised again 2026-08-04: eightsleep-144 photo band)", () => {
  it("is a photo feature band: eyebrow + headline + one-liner, nothing interactive, no story cards", () => {
    const { container } = render(<Landing />);
    const plan = container.querySelector("#plan") as HTMLElement;
    expect(plan).toBeTruthy();
    expect(within(plan).getByText("Plan")).toBeTruthy();
    expect(within(plan).getByText("Your week, drafted around your life.")).toBeTruthy();
    expect(plan.querySelector(".photo-band-photo")).toBeTruthy();
    expect(plan.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector(".plan-story")).toBeNull();
    expect(container.textContent).not.toMatch(/Press a marker/);
  });
});

describe("shop row and save grid (AC5, revised 2026-08-04: no carousel)", () => {
  it("shop renders exactly three cards", () => {
    const { container } = render(<Landing />);
    expect(container.querySelectorAll(".shop-card")).toHaveLength(3);
  });

  it("save shows all four cards at once with no arrow controls", () => {
    const { container } = render(<Landing />);
    expect(container.querySelectorAll(".save-card")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /examples/ })).toBeNull();
    expect(container.querySelector(".save-track")).toBeNull();
  });
});

describe("faq speaks in the present tense", () => {
  it("never describes the product as unbuilt or undecided", () => {
    const { container } = render(<FaqPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/still deciding|We.re building now|where it.s at/i);
  });
});

describe("copy sources (AC6)", () => {
  it("keeps the shipped hero, statement band, and close lines", () => {
    render(<Landing />);
    expect(screen.getByText("Your food life, finally organized.")).toBeTruthy();
    expect(
      screen.getByText(/You don.t need more discipline\. You need less overhead\./),
    ).toBeTruthy();
    expect(screen.getByText(/You.re not logging food\./)).toBeTruthy();
    // The trust line runs under both asks: the hero button and the close.
    expect(screen.getAllByText("Early members shape what gets built. One note a week.")).toHaveLength(2);
  });

  it("never names the coach and never claims no-weighing", () => {
    const { container } = render(<Landing />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bCade\b/);
    expect(text).not.toMatch(/no (weighing|scale)/i);
  });
});

describe("persona grid (AC10)", () => {
  it("renders exactly the six approved cards", () => {
    const { container } = render(<Landing />);
    const cards = container.querySelectorAll(".persona-card");
    expect(cards).toHaveLength(6);
    for (const headline of [
      "Friday night is not a cheat.",
      "Actually cook the thing you saved.",
      "Stop starting over on Monday.",
      "One bad meal is just a meal.",
      "Chipotle with the team, on plan.",
      "A cart that matches a plan.",
    ]) {
      expect(screen.getByText(headline)).toBeTruthy();
    }
  });
});

// The three funnel pages moved to their own chrome on 2026-08-18
// (specs/funnel-pages-restyle.md); tests/funnel-chrome.test.tsx covers them.
// The v4 landing is the only page left on the shared chrome.
describe("shared chrome (AC7)", () => {
  it("landing renders the shared nav wordmark and footer", () => {
    const { container } = render(<Landing />);
    expect(within(container.querySelector("header.nav") as HTMLElement).getByText("Cadence")).toBeTruthy();
    expect(screen.getByText("© 2026 Cadence Health")).toBeTruthy();
  });

  it("landing nav carries the Eight Sleep layout links and the waitlist CTA", () => {
    render(<Landing />);
    const nav = screen.getByRole("banner");
    expect(within(nav).getByRole("link", { name: "How it works" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Questions" })).toBeTruthy();
    const cta = within(nav).getByRole("link", { name: "Join the waitlist" });
    expect(cta.getAttribute("href")).toBe("/waitlist");
  });
});
