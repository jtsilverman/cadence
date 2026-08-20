// vision:6 — the waitlist page asks Jake's five questions, in his order, with
// his option lists, and every one of them stays optional.
//
// The questions are parsed out of the locked survey deck in
// drafts/website/WEBSITE.md rather than retyped, so a reworded option fails
// here instead of quietly shipping two versions of the same question.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deckRows } from "./deck";

import WaitlistPage from "@/app/waitlist/page";
import { SURVEY } from "@/lib/survey";

// | n | question | type | options |
const lockedSurvey = () =>
  deckRows("## The waitlist survey", 4).map((c) => ({
    question: c[2],
    options: c[4] === "\u2014" ? [] : c[4].split(" \u00b7 ").map((o) => o.trim()),
  }));

afterEach(cleanup);

describe("the waitlist survey", () => {
  it("matches the locked deck in WEBSITE.md, question for question", () => {
    const deck = lockedSurvey();
    expect(deck.length, "the deck parsed no rows").toBe(5);
    expect(
      SURVEY.map((q) => ({
        question: q.question,
        options: q.kind === "text" ? [] : [...q.options],
      }))
    ).toEqual(deck);
  });

  it("renders the five questions in that order", () => {
    const { container } = render(<WaitlistPage />);
    const asked = [...container.querySelectorAll(".survey-q")].map((el) =>
      (el.textContent ?? "").trim()
    );
    expect(asked).toEqual(SURVEY.map((q) => q.question));
  });

  it("asks for nothing but the email", () => {
    const { container } = render(<WaitlistPage />);
    const required = [...container.querySelectorAll("[required]")].map((el) =>
      el.getAttribute("name")
    );
    expect(required).toEqual(["email"]);
  });

  it("offers willpower, travel-free wording and the price ladder", () => {
    render(<WaitlistPage />);
    expect(screen.getByLabelText("Lacking willpower")).toBeTruthy();
    expect(screen.getByLabelText("~$15+ a month")).toBeTruthy();
    // the coach is never named on the site
    expect(screen.queryByLabelText(/AI coach/)).toBeNull();
  });
});
