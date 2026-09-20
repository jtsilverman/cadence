import { foodAllowed, MEAT } from "./restrictions";

export const ACTIVITIES = [
  ["sedentary", "Mostly sitting", 1.2],
  ["light", "Lightly active", 1.375],
  ["moderate", "Active most days", 1.55],
  ["high", "Very active", 1.725],
] as const;

export type Activity = (typeof ACTIVITIES)[number][0];

export interface OnboardingBasics {
  sex: "m" | "f";
  weightLb: number;
  heightIn: number;
  age: number;
}

export interface OnboardingMeal {
  library_id: string;
  title: string;
}

export function proposeCalories(
  basics: OnboardingBasics,
  direction: string,
  activity: Activity,
): number {
  const kg = basics.weightLb * 0.4536;
  const cm = basics.heightIn * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * basics.age + (basics.sex === "m" ? 5 : -161);
  const multiplier = ACTIVITIES.find(([key]) => key === activity)?.[2] ?? 1.2;
  const maintenance = bmr * multiplier;
  const adjusted =
    direction === "Get leaner"
      ? maintenance - 400
      : direction === "Gain weight gradually"
        ? maintenance + 250
        : maintenance;
  return Math.max(1400, Math.round(adjusted / 50) * 50);
}

function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return addDays(dateISO, -((d.getUTCDay() + 6) % 7));
}

export function draftTwoWeeks(meals: OnboardingMeal[], today: string, hardRestrictions?: string) {
  const start = mondayOf(today);
  const mealTimes = [
    { label: "Breakfast", meal_type: "breakfast", time: "08:00" },
    { label: "Lunch", meal_type: "lunch", time: "12:30" },
    { label: "Snack", meal_type: "snack", time: "16:00" },
    { label: "Dinner", meal_type: "dinner", time: "19:00" },
  ] as const;
  const allowed = meals.filter((meal) =>
    foodAllowed(
      { title: meal.title, ingredients: [], vegetarian: !MEAT.test(meal.title) },
      hardRestrictions,
    ),
  );
  if (allowed.length === 0) return [];
  return Array.from({ length: 14 }, (_, d) => ({
    date: addDays(start, d),
    slots: mealTimes.map((mealTime, m) => {
      const meal = allowed[(d + m * 3) % allowed.length];
      return {
        lane: "meal" as const,
        title: `${mealTime.label} · ${meal.title}`,
        library_id: meal.library_id,
        meal_type: mealTime.meal_type,
        time: mealTime.time,
        servings: 1,
      };
    }),
  }));
}
