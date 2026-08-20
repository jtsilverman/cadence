// Unit canonicalization + same-dimension conversion (spec: units-fullness).
// One canonicalizer feeds every comparison; conversion covers mass and volume
// only. Cross-dimension (cup ↔ g) is per-ingredient density knowledge we
// don't have — convert() refuses (null) and callers degrade honestly.

// Alias → canonical token. Unknown units pass through trimmed + lowercased
// and merge only with themselves (count, bottle, stick, ...).
const ALIASES: Record<string, string> = {
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  ounce: "oz",
  ounces: "oz",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  milliliter: "ml",
  milliliters: "ml",
  liter: "l",
  liters: "l",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  cups: "cup",
};

// Canonical unit → [dimension, factor to base unit (g or ml)].
const DIMENSIONS: Record<string, ["mass" | "volume", number]> = {
  g: ["mass", 1],
  kg: ["mass", 1000],
  oz: ["mass", 28.349523125],
  lb: ["mass", 453.59237],
  ml: ["volume", 1],
  l: ["volume", 1000],
  tsp: ["volume", 4.92892159375],
  tbsp: ["volume", 14.78676478125],
  "fl oz": ["volume", 29.5735295625],
  cup: ["volume", 236.5882365],
};

export function canonicalUnit(unit: string | null): string | null {
  const n = unit?.trim().toLowerCase();
  if (!n) return null;
  return ALIASES[n] ?? n;
}

export function dimensionOf(unit: string | null): "mass" | "volume" | null {
  const c = canonicalUnit(unit);
  return c ? DIMENSIONS[c]?.[0] ?? null : null;
}

// Same canonical unit (count/unknown/null included): identity. Same
// dimension: exact factor math. Anything else: null — never invent.
export function convert(
  qty: number,
  fromUnit: string | null,
  toUnit: string | null
): number | null {
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);
  if (from === to) return qty;
  if (from === null || to === null) return null;
  const f = DIMENSIONS[from];
  const t = DIMENSIONS[to];
  if (!f || !t || f[0] !== t[0]) return null;
  return (qty * f[1]) / t[1];
}
