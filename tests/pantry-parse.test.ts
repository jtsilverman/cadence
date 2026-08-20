import { describe, it, expect } from "vitest";
import { parseAssertion } from "@/lib/pantry";

describe("parseAssertion (untrusted API body -> PantryAssertion)", () => {
  it("accepts an add with name/qty/unit", () => {
    expect(parseAssertion({ name: "Eggs", qty: 12, unit: "count" })).toEqual({
      ok: true,
      assertion: { name: "Eggs", qty: 12, unit: "count", precision: "exact" },
    });
  });

  it("accepts qty null + unit null with explicit estimated precision", () => {
    expect(
      parseAssertion({ name: "flour", qty: null, unit: null, precision: "estimated" })
    ).toEqual({
      ok: true,
      assertion: { name: "flour", qty: null, unit: null, precision: "estimated" },
    });
  });

  it("accepts a removal, ignoring qty/unit noise", () => {
    expect(parseAssertion({ name: "milk", removed: true, qty: 99 })).toEqual({
      ok: true,
      assertion: { name: "milk", removed: true },
    });
  });

  it("rejects blank or missing name", () => {
    expect(parseAssertion({ name: "   ", qty: 1, unit: null }).ok).toBe(false);
    expect(parseAssertion({ qty: 1, unit: null }).ok).toBe(false);
  });

  it("rejects non-finite, negative, and non-number qty", () => {
    for (const qty of [NaN, Infinity, -1, "12", true]) {
      const result = parseAssertion({ name: "eggs", qty, unit: null });
      expect(result.ok, `qty=${String(qty)}`).toBe(false);
    }
  });

  it("rejects an unknown precision value", () => {
    expect(
      parseAssertion({ name: "eggs", qty: 1, unit: null, precision: "vibes" }).ok
    ).toBe(false);
  });

  it("rejects removed that is not literally true", () => {
    expect(parseAssertion({ name: "milk", removed: "yes" }).ok).toBe(false);
  });
});
