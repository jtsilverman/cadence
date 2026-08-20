// vision:1, vision:2, vision:4 — the FAQ answers ten plain mechanics questions,
// each with one orange phrase in the question and one green phrase in the
// answer.
//
// The copy is not retyped here. drafts/website/WEBSITE.md is the copy
// authority, so this test parses the locked deck out of it and asserts the code
// matches, in order. Editing one without the other fails here rather than
// shipping two versions of the same sentence.
import { cleanup, render } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deckRows } from "./deck";

import FaqPage from "@/app/faq/page";
import { FAQ, segments } from "@/lib/faq";

// | nn | question | answer | backed by |
const lockedDeck = () => deckRows("## The FAQ deck", 4).map((c) => ({ q: c[2], a: c[3] }));

afterEach(cleanup);

describe("the FAQ copy", () => {
  it("matches the locked deck in WEBSITE.md, entry for entry", () => {
    const deck = lockedDeck();
    expect(deck.length, "the deck parsed no rows").toBe(11);
    expect(FAQ.map((entry) => ({ q: entry.q, a: entry.a }))).toEqual(deck);
  });

  it("marks one phrase in every question and one in every answer", () => {
    // Counting the set, not each entry: ten entries each passing on their own
    // still leaves the set incomplete if one entry marks nothing.
    const { container } = render(<FaqPage />);
    expect(container.querySelectorAll(".faq-q em")).toHaveLength(11);
    expect(container.querySelectorAll(".faq-a em")).toHaveLength(11);
  });

  it("marks exactly one phrase per line, because the notation has no escape", () => {
    // An ordinary parenthetical aside in an answer would silently turn green.
    for (const entry of FAQ) {
      expect(segments(entry.q).filter((s) => s.accent), entry.q).toHaveLength(1);
      expect(segments(entry.a).filter((s) => s.accent), entry.a).toHaveLength(1);
    }
  });

  it("asks about travel, restaurants and fasting, and never about the numbers", () => {
    const { container } = render(<FaqPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("Does it plan around travel days?");
    expect(text).toContain("Can it tell me what to order at a restaurant?");
    expect(text).toContain("Does it work with intermittent fasting?");
    expect(text).toContain("Does it write my grocery list?");
    expect(text).not.toMatch(/numbers come from/);
  });
});

// vision:4 — the deck's evidence column is the milestone's own proof, and three
// stale cells survived a green suite because nothing read it. This does not
// judge whether a citation says what the cell claims; it catches the citation
// that stopped existing.
describe("the FAQ deck's evidence column", () => {
  const REPO = join(__dirname, "..");

  it("cites a real file in every row", () => {
    const rows = deckRows("## The FAQ deck", 4);
    expect(rows).toHaveLength(11);
    for (const cells of rows) {
      const evidence = cells[4];
      expect(evidence, `row ${cells[1]} cites nothing`).not.toBe("");
      const paths = evidence.match(/`([\w./()[\]-]+\.(?:ts|tsx|md|jsonl))(?::\d+)?`/g) ?? [];
      expect(paths.length, `row ${cells[1]} names no file`).toBeGreaterThan(0);
      for (const quoted of paths) {
        const path = quoted.replace(/`/g, "").split(":")[0];
        expect(existsSync(join(REPO, path)), `row ${cells[1]} cites missing ${path}`).toBe(true);
      }
    }
  });
});
