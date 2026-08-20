// vision:3 — the three funnel pages read as the same site as the main page.
// The palette is not retyped here: it is parsed out of the built main page, so
// a change to drafts/website/page/index.html fails this test instead of
// silently leaving the funnel behind. That drift is exactly what this unit fixes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const MAIN_PAGE = join(ROOT, "drafts/website/page/index.html");
const FUNNEL_CSS = join(ROOT, "app/funnel.css");

// The custom properties the funnel pages must share with the main page. The
// lifted --tomup/--grnup pair is deliberately absent: it exists only to clear
// the ink band, and the funnel pages sit on cream.
const SHARED = ["--cream", "--ink", "--dim", "--rule", "--grn", "--tom"];

function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z]+)\s*:\s*([^;]+);/g)) {
    if (!found.has(match[1])) found.set(match[1], match[2].trim());
  }
  return found;
}

describe("the funnel stylesheet", () => {
  it("declares the main page's palette, value for value", () => {
    const mainPage = declarations(readFileSync(MAIN_PAGE, "utf8"));
    const funnel = declarations(readFileSync(FUNNEL_CSS, "utf8"));

    for (const token of SHARED) {
      expect(mainPage.get(token), `${token} missing from the main page`).toBeTruthy();
      expect(funnel.get(token), `${token} missing from app/funnel.css`).toBe(mainPage.get(token));
    }
  });
});
