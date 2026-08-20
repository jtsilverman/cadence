import { describe, it, expect } from "vitest";
import { canonicalUnit, convert, dimensionOf } from "@/lib/units";

// Expected values are hand-known constants (16 oz = 1 lb, 3 tsp = 1 tbsp,
// 8 fl oz = 1 cup, 1 lb = 453.59237 g), never recomputed through convert().

describe("canonicalUnit (criterion 2: aliases normalize before comparison)", () => {
  it("maps every spec-named alias to one canonical token, case-insensitive", () => {
    expect(canonicalUnit("Cups")).toBe("cup");
    expect(canonicalUnit("cup")).toBe("cup");
    expect(canonicalUnit("LBS")).toBe("lb");
    expect(canonicalUnit("pound")).toBe("lb");
    expect(canonicalUnit("lb")).toBe("lb");
    expect(canonicalUnit("grams")).toBe("g");
    expect(canonicalUnit("g")).toBe("g");
    expect(canonicalUnit("Tablespoons")).toBe("tbsp");
    expect(canonicalUnit("teaspoons")).toBe("tsp");
    expect(canonicalUnit("ounces")).toBe("oz");
  });

  it("passes unknown units through trimmed + lowercased, blank/null to null", () => {
    expect(canonicalUnit(" Bottle ")).toBe("bottle");
    expect(canonicalUnit("")).toBeNull();
    expect(canonicalUnit("   ")).toBeNull();
    expect(canonicalUnit(null)).toBeNull();
  });
});

describe("dimensionOf", () => {
  it("classifies mass and volume units through the canonicalizer", () => {
    for (const u of ["g", "kg", "oz", "pounds"]) expect(dimensionOf(u), u).toBe("mass");
    for (const u of ["ml", "l", "tsp", "Tablespoons", "fl oz", "cups"])
      expect(dimensionOf(u), u).toBe("volume");
  });

  it("returns null for count, unknown units, and null", () => {
    expect(dimensionOf("count")).toBeNull();
    expect(dimensionOf("bottle")).toBeNull();
    expect(dimensionOf(null)).toBeNull();
  });
});

describe("convert (criterion 1: same-dimension conversion)", () => {
  it("converts within mass: 16 oz = 1 lb, 2 kg = 2000 g, 100 g ≈ 0.22 lb", () => {
    expect(convert(16, "oz", "lb")).toBeCloseTo(1, 10);
    expect(convert(8, "oz", "lb")).toBeCloseTo(0.5, 10);
    expect(convert(2, "kg", "g")).toBeCloseTo(2000, 10);
    expect(convert(100, "g", "lb")).toBeCloseTo(0.22, 2);
  });

  it("converts within volume: 3 tsp = 1 tbsp, 8 fl oz = 1 cup, 1 l = 1000 ml", () => {
    expect(convert(3, "tsp", "tbsp")).toBeCloseTo(1, 10);
    expect(convert(8, "fl oz", "cup")).toBeCloseTo(1, 10);
    expect(convert(16, "tbsp", "cup")).toBeCloseTo(1, 10);
    expect(convert(1, "l", "ml")).toBeCloseTo(1000, 10);
  });

  it("converts through aliases: 1 pound = 1 lbs, 2 cups = 32 tablespoons", () => {
    expect(convert(1, "pound", "lbs")).toBe(1);
    expect(convert(2, "cups", "Tablespoons")).toBeCloseTo(32, 10);
  });

  it("refuses cross-dimension (criterion 3: no invented density)", () => {
    expect(convert(2, "cup", "g")).toBeNull();
    expect(convert(100, "g", "cup")).toBeNull();
  });

  it("identity for matching count/unknown/null units, refusal otherwise", () => {
    expect(convert(3, "count", "count")).toBe(3);
    expect(convert(1, "bottle", "Bottle")).toBe(1);
    expect(convert(5, null, null)).toBe(5);
    expect(convert(5, null, "g")).toBeNull();
    expect(convert(1, "bottle", "bag")).toBeNull();
  });

  it("property: round-trip a→b→a recovers qty and conversion is linear", () => {
    const pairs: Array<[string, string]> = [
      ["g", "kg"], ["g", "oz"], ["oz", "lb"], ["kg", "lb"],
      ["ml", "l"], ["ml", "tsp"], ["tsp", "tbsp"], ["tbsp", "cup"],
      ["fl oz", "cup"], ["ml", "cup"],
    ];
    const qtys = [0.001, 0.25, 1, 3, 7.5, 100, 4096];
    for (const [a, b] of pairs) {
      for (const q of qtys) {
        const there = convert(q, a, b);
        expect(there, `${q} ${a}→${b}`).not.toBeNull();
        expect(convert(there!, b, a), `${q} ${a}→${b}→${a}`).toBeCloseTo(q, 6);
        expect(convert(2 * q, a, b), `linear ${a}→${b}`).toBeCloseTo(2 * there!, 6);
      }
    }
  });
});
