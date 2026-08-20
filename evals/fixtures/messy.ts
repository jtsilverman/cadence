// messy — deviations everywhere: skipped meals, unlogged days, two overshoot
// days this week, a half-checked grocery list, expired pantry items, and a
// correction ("actually two bowls") already in the diary via retraction.

import type { Client } from "@libsql/client";
import { isoAddDays, mondayOf } from "@/lib/dates";
import {
  BREAKFAST,
  DINNER,
  LUNCH,
  RECIPES,
  assertPantry,
  at,
  cook,
  ev,
  insertLibraryRecipe,
  todayLocal,
  twoWeekDays,
} from "./seed";

export async function seedMessy(db: Client): Promise<void> {
  const today = todayLocal();
  const start = isoAddDays(today, -21);

  await ev(db, "GoalSet", at(start, "15:00"), {
    goal_id: "g-nutrition",
    title: "Cut to 2,200 a day",
    kind: "nutrition",
    daily_calories: 2200,
    protein_g: 150,
  });

  for (let i = 0; i < RECIPES.length; i++) {
    await insertLibraryRecipe(db, RECIPES[i], at(isoAddDays(start, i % 7), "14:00"));
  }

  // history with holes: days ≡ 2 (mod 5) are fully unlogged; other days lose
  // breakfast half the time (under-logging, not under-eating)
  const meals = [BREAKFAST, LUNCH, DINNER];
  for (let d = 0; d < 21; d++) {
    const date = isoAddDays(start, d);
    if (date >= today) break;
    if (d % 5 === 2) continue; // unlogged day
    for (let m = 0; m < 3; m++) {
      if (m === 0 && d % 2 === 1) continue; // skipped breakfast log
      // yesterday's dinner is pasta (the "two bowls last night" correction target)
      const r =
        m === 2 && date === isoAddDays(today, -1) ? RECIPES[6] : RECIPES[(d + m * 3) % 6 + 2];
      await cook(db, r, at(date, meals[m]));
    }
  }

  // this week: two overshoot days (pizza night + burger day)
  const weekStart = mondayOf(today);
  if (weekStart < today) {
    await ev(db, "RecipeCooked", at(weekStart, DINNER), {
      library_id: "lib-pizza-night",
      title: "Whole pepperoni pizza",
      ingredients: [{ name: "frozen pizza", qty: 1, unit: "count" }],
      nutrition: { calories: 2300, protein_g: 90, carbs_g: 240, fat_g: 105, per_serving: true, confidence: "low" },
    });
  }
  const overshoot2 = isoAddDays(weekStart, 1);
  if (overshoot2 < today) {
    await ev(db, "RecipeCooked", at(overshoot2, DINNER), {
      library_id: "lib-burgers",
      title: "Double smash burgers and fries",
      ingredients: [{ name: "ground beef", qty: 1, unit: "lb" }, { name: "fries", qty: 1, unit: "count" }],
      nutrition: { calories: 1850, protein_g: 70, carbs_g: 130, fat_g: 110, per_serving: true, confidence: "low" },
    });
  }

  // the locked two-week plan
  const days = twoWeekDays(weekStart, (d, m) =>
    m === 0 ? RECIPES[d % 2 === 0 ? 0 : 3] : RECIPES[(d + m * 3) % 6 + 2]
  );
  await ev(db, "SchedulePlanned", at(isoAddDays(today, -2), "22:00"), { days }, { precision: "exact" });

  // skipped meals this week, on the plan's own slot ids
  const skipDay = weekStart < today ? weekStart : today;
  await ev(db, "SlotSkipped", at(skipDay, "17:00"), { slot_id: `slot-${skipDay}-m1`, lane: "meal" }, { precision: "exact" });
  const skipDay2 = isoAddDays(skipDay, 1) <= today ? isoAddDays(skipDay, 1) : skipDay;
  await ev(db, "SlotSkipped", at(skipDay2, "12:45"), { slot_id: `slot-${skipDay2}-m0`, lane: "meal" }, { precision: "exact" });

  // the correction trail: one bowl logged, retracted, replaced with two bowls
  const chili = RECIPES[4];
  const corrDate = isoAddDays(today, -3);
  const oneBowl = await cook(db, chili, at(corrDate, DINNER));
  await ev(db, "LogRetracted", at(corrDate, "23:20"), { retracted_event_id: oneBowl }, { precision: "exact" });
  await ev(db, "RecipeCooked", at(corrDate, "23:21"), {
    library_id: chili.id,
    title: "Turkey chili, two bowls",
    ingredients: chili.ingredients,
    nutrition: { calories: chili.calories * 2, protein_g: chili.protein_g * 2, carbs_g: chili.carbs_g * 2, fat_g: chili.fat_g * 2, per_serving: true, confidence: "high" },
  });

  // half-checked grocery list: the week was picked, the order placed, and only
  // half the lines have come back in via aisle checkoff
  const picked = [RECIPES[1], RECIPES[4], RECIPES[6]];
  await ev(db, "WeekPlanned", at(isoAddDays(today, -2), "21:00"), {
    recipes: picked.map((r) => ({ library_id: r.id, title: r.title })),
  }, { precision: "exact" });
  const orderId = await ev(db, "OrderPlaced", at(isoAddDays(today, -2), "21:10"), {
    rail: "manual",
    items: [
      { name: "chicken breast", qty: 1, unit: "lb" },
      { name: "rice", qty: 2, unit: "cup" },
      { name: "ground turkey", qty: 1, unit: "lb" },
      { name: "kidney beans", qty: 1, unit: "cup" },
      { name: "crushed tomatoes", qty: 42, unit: "oz" },
      { name: "spaghetti", qty: 4, unit: "oz" },
      { name: "parmesan", qty: 1, unit: "oz" },
      { name: "onion", qty: 1, unit: "count" },
    ],
  }, { precision: "exact" });
  await ev(db, "PantryInflow", at(isoAddDays(today, -1), "19:00"), {
    items: [
      { name: "chicken breast", qty: 1, unit: "lb" },
      { name: "rice", qty: 2, unit: "cup" },
      { name: "ground turkey", qty: 1, unit: "lb" },
      { name: "kidney beans", qty: 1, unit: "cup" },
    ],
    via: "checkoff",
    order_event_id: orderId,
  }, { precision: "exact" });

  // pantry: real state plus expired items
  const yesterday = isoAddDays(today, -1);
  await assertPantry(db, at(yesterday, "20:00"), "chicken breast", 1, "lb");
  await assertPantry(db, at(yesterday, "20:01"), "rice", 2, "cup");
  await assertPantry(db, at(yesterday, "20:02"), "milk", 32, "oz", isoAddDays(today, -2)); // expired
  await assertPantry(db, at(yesterday, "20:03"), "spinach", 5, "oz", isoAddDays(today, -1)); // expired
  await assertPantry(db, at(yesterday, "20:04"), "ground turkey", 1, "lb");
}
