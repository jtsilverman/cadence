// week3 — three weeks in: favorites accrued through repeat cooks, a locked
// two-week plan + an open living draft for next week, real pantry state, a
// Whoop connected (tokens + device sleep/recovery), steady logging history.
// No weigh-in storage exists yet (no writer of the profile table), so the
// charter's "weight trend" seeds as journal mentions only.

import type { Client } from "@libsql/client";
import { isoAddDays, mondayOf } from "@/lib/dates";
import {
  BREAKFAST,
  DINNER,
  HOUSEHOLD_ID,
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

export async function seedWeek3(db: Client): Promise<void> {
  const today = todayLocal();
  const start = isoAddDays(today, -21);

  // goal: the onboarding calorie proposal, accepted three weeks ago
  await ev(db, "GoalSet", at(start, "15:00"), {
    goal_id: "g-nutrition",
    title: "Cut to 2,200 a day",
    kind: "nutrition",
    daily_calories: 2200,
    protein_g: 150,
  });

  // library: eight recipes saved over the first week
  for (let i = 0; i < RECIPES.length; i++) {
    await insertLibraryRecipe(db, RECIPES[i], at(isoAddDays(start, i % 7), "14:00"));
  }

  // 21 days of realistic eating up to (not including) today: breakfast
  // alternates oats/parfait, lunch is USUALLY the burrito bowl (the obvious
  // "usual" the coach can cite) except two recurring restaurant lunches
  // (Sweetgreen, Chipotle — the "usual spot" ambiguity), dinner rotates with
  // the caesar as a frequent favorite. Repeats accrue favorites.
  for (let d = 0; d < 21; d++) {
    const date = isoAddDays(start, d);
    if (date >= today) break;
    await cook(db, RECIPES[d % 2 === 0 ? 0 : 3], at(date, BREAKFAST));
    if (d % 7 === 1) {
      await ev(db, "RecipeCooked", at(date, LUNCH), {
        library_id: "chat-sweetgreen",
        title: "Sweetgreen Harvest Bowl",
        ingredients: [],
        nutrition: { calories: 705, protein_g: 30, carbs_g: 65, fat_g: 35, per_serving: true, confidence: "low" },
      }, { source: "chat" });
    } else if (d % 7 === 4) {
      await ev(db, "RecipeCooked", at(date, LUNCH), {
        library_id: "chat-chipotle",
        title: "Chipotle chicken bowl",
        ingredients: [],
        nutrition: { calories: 950, protein_g: 52, carbs_g: 95, fat_g: 36, per_serving: true, confidence: "low" },
      }, { source: "chat" });
    } else {
      await cook(db, RECIPES[1], at(date, LUNCH));
    }
    await cook(db, d % 4 === 1 ? RECIPES[8] : RECIPES[(d + 6) % 6 + 2], at(date, DINNER));
  }

  // today so far (mid-day state the correction cases reference): breakfast
  // oats, a whole-milk latte, a spontaneous caesar lunch, tacos in the
  // early evening — all amendable, none marking the planned burrito lunch
  await cook(db, RECIPES[0], at(today, BREAKFAST));
  await ev(db, "RecipeCooked", at(today, "14:00"), {
    library_id: "chat-latte",
    title: "Latte, whole milk",
    ingredients: [],
    nutrition: { calories: 190, protein_g: 10, carbs_g: 15, fat_g: 10, per_serving: true, confidence: "low" },
  }, { source: "chat" });
  await ev(db, "RecipeCooked", at(today, LUNCH), {
    library_id: "lib-caesar",
    title: "Chicken caesar salad",
    ingredients: [],
    nutrition: { calories: 520, protein_g: 38, carbs_g: 18, fat_g: 32, per_serving: true, confidence: "low" },
  }, { source: "chat" });
  await ev(db, "RecipeCooked", at(today, "23:30"), {
    library_id: "chat-tacos",
    title: "Two tacos",
    ingredients: [],
    nutrition: { calories: 460, protein_g: 24, carbs_g: 40, fat_g: 22, per_serving: true, confidence: "low" },
  }, { source: "chat" });

  // sparse journal with a weight trend the coach can only cite as text
  for (const [offset, note] of [
    [-18, "Weighed in at 187 this morning."],
    [-11, "186.2 today, trending right."],
    [-4, "185.4. Slow and steady."],
  ] as Array<[number, string]>) {
    await ev(db, "JournalEntry", at(isoAddDays(today, offset), "12:00"), { text: note }, { precision: "exact" });
  }

  // the locked two-week plan (latest SchedulePlanned snapshot wins).
  // Lunch is the standing favorite (burrito bowl) every day — realistic
  // repeat-lunch behavior, and it makes the cook→pantry journey
  // deterministic: chicken breast + rice are always on today's plan.
  const weekStart = mondayOf(today);
  const days = twoWeekDays(weekStart, (d, m) =>
    m === 0 ? RECIPES[d % 2 === 0 ? 0 : 3] : m === 1 ? RECIPES[1] : RECIPES[(d + 6) % 6 + 2]
  );
  // today also plans a garden salad snack — the second "the salad" candidate
  const todayEntry = days.find((day) => day.date === today);
  todayEntry?.slots.push({
    slot_id: `slot-${today}-m3`,
    lane: "meal",
    title: "Garden salad",
    library_id: "lib-garden-salad",
  });
  await ev(db, "SchedulePlanned", at(isoAddDays(today, -1), "22:00"), { days }, { precision: "exact" });

  // the living draft: an open plan_draft proposal for next week
  const nextMonday = isoAddDays(weekStart, 7);
  const draftDays = twoWeekDays(nextMonday, (d, m) =>
    m === 0 ? RECIPES[3] : RECIPES[(d + m * 2) % 6 + 2]
  )
    .slice(0, 7)
    .map((day) => ({ date: day.date, slots: day.slots.map(({ slot_id: _s, ...rest }) => rest) }));
  await ev(db, "SuggestionMade", at(today, "13:00"), {
    suggestion_id: "sug-draft-week3",
    kind: "plan_draft",
    scope: "week",
    anchor: nextMonday,
    days: draftDays,
    reason: "next week drafted from your favorites and this week's diary",
  });

  // pantry truth, asserted by the user
  const yesterday = isoAddDays(today, -1);
  await assertPantry(db, at(yesterday, "20:00"), "chicken breast", 2, "lb");
  await assertPantry(db, at(yesterday, "20:01"), "rice", 3, "cup");
  await assertPantry(db, at(yesterday, "20:02"), "olive oil", null, null);
  await assertPantry(db, at(yesterday, "20:03"), "eggs", 12, "count");
  await assertPantry(db, at(yesterday, "20:04"), "greek yogurt", 32, "oz", isoAddDays(today, 6));
  await assertPantry(db, at(yesterday, "20:05"), "spinach", 5, "oz", isoAddDays(today, 2));

  // Whoop connected: tokens + a week of device sleep and recovery
  await db.execute({
    sql: `INSERT INTO wearable_tokens (household_id, provider, access_token, refresh_token, expires_at, updated_at)
          VALUES (?, 'whoop', 'eval-access-token', 'eval-refresh-token', ?, ?)`,
    args: [HOUSEHOLD_ID, at(isoAddDays(today, 30), "12:00"), at(yesterday, "12:00")],
  });
  for (let d = 7; d >= 1; d--) {
    const date = isoAddDays(today, -d);
    await ev(
      db,
      "SleptLogged",
      at(date, "11:00"),
      { date, quality: d % 3 === 0 ? "great" : "ok", hours: 6.5 + (d % 4) * 0.5, score: 70 + (d % 5) * 4, external_id: `whoop:sleep:${date}` },
      { source: "whoop", precision: "exact", schema_version: 2 }
    );
    await ev(
      db,
      "RecoveryLogged",
      at(date, "11:05"),
      { date, score: 55 + (d % 6) * 6, hrv: 60 + (d % 5) * 5, resting_hr: 52 + (d % 3), external_id: `whoop:recovery:${date}` },
      { source: "whoop", precision: "exact" }
    );
  }
}
