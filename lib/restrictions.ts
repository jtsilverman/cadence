export interface RestrictionFood {
  title: string;
  ingredients: string[];
  vegetarian: boolean;
}

const GROUPS: Record<string, RegExp> = {
  shellfish: /\b(shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop)\b/i,
  nuts: /\b(peanut|almond|cashew|walnut|pistachio|pecan|hazelnut|macadamia)\b/i,
  nut: /\b(peanut|almond|cashew|walnut|pistachio|pecan|hazelnut|macadamia)\b/i,
  peanut: /\bpeanuts?\b/i,
  peanuts: /\bpeanuts?\b/i,
  gluten: /\b(wheat|flour|bread|pasta|barley|rye|couscous)\b/i,
  dairy: /\b(milk|cheese|butter|cream|yogurt|whey|casein)\b/i,
};

export const MEAT = /\b(beef|steak|chicken|turkey|pork|bacon|ham|lamb|sausage|fish|salmon|tuna|shrimp|prawn|crab|lobster)\b/i;

export function parseRestrictions(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/,|;|\n|\band\b/i)
    .map((part) => part.trim().toLowerCase().replace(/^no\s+/, ""))
    .filter((part) => part && !/^(none|nothing|no restrictions|n\/a)$/.test(part));
}

export function foodAllowed(food: RestrictionFood, raw: string | undefined): boolean {
  const restrictions = parseRestrictions(raw);
  if (restrictions.length === 0) return true;
  const text = `${food.title} ${food.ingredients.join(" ")}`.toLowerCase();
  return restrictions.every((restriction) => {
    if (restriction === "vegetarian") return food.vegetarian;
    const group = GROUPS[restriction];
    if (group) return !group.test(text);
    return !text.includes(restriction);
  });
}
