// The locked copy decks live in drafts/website/WEBSITE.md as markdown tables,
// because the "backed by" evidence column belongs in prose and has no home in
// code. Both copy tests read them through here rather than hand-rolling the
// same parser twice.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DECK = join(__dirname, "../drafts/website/WEBSITE.md");

// Every numbered row of the table under the given heading, as its trimmed
// cells. The section stops at the next heading, because WEBSITE.md keeps its
// superseded copy below the live decks and those tables are also numbered.
// `columns` is the table's content-column count; a row splits into two more
// than that, one empty cell either side of the outer pipes. Naming it here
// means one place to fix when a deck grows a column, and it drops the header
// row and the divider without a second guard.
export function deckRows(heading: string, columns: number): string[][] {
  const after = readFileSync(DECK, "utf8").split(heading)[1];
  if (after === undefined) throw new Error(`no section titled ${heading} in WEBSITE.md`);
  const section = after.split(/\n## /)[0];
  return section
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length === columns + 2 && /^\d+$/.test(cells[1]));
}
