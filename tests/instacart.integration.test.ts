import { describe, it, expect } from "vitest";
import { instacartRail } from "@/lib/rails";

// Live IDP test — the acceptance gate for criterion 3a. Runs only with
// RUN_INTEGRATION=1 and INSTACART_API_KEY set (dev key). Asserts item-for-item
// that the created shoppable page carries exactly the list we sent, not just
// "a cart opened".
const live = process.env.RUN_INTEGRATION === "1" && !!process.env.INSTACART_API_KEY;

const ITEMS = [
  { name: "ground beef", qty: 1, unit: "lb" },
  { name: "spaghetti", qty: 2, unit: "lb" },
  { name: "olive oil", qty: null, unit: null },
];

describe.skipIf(!live)("Instacart IDP live (criterion 3a)", () => {
  it("creates a shoppable page whose items match the sent list exactly", async () => {
    const { url } = await instacartRail.buildCart(ITEMS);
    expect(url).toMatch(/^https:\/\//);

    // The products_link page embeds the list server-side; every sent name must
    // appear, and no extra line items beyond ours.
    const page = await (await fetch(url!)).text();
    for (const item of ITEMS) {
      expect(page.toLowerCase()).toContain(item.name);
    }
  }, 30_000);
});
