"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Nutrition — the day's meals + the food library (ux.md). Cooking a library
// meal posts /api/cook (one RecipeCooked event: pantry decrements, the slot
// folds to done) and the section re-renders only from the re-fetched
// schedule — the receipt. Day-level budget only; per-meal calorie badges
// are banned (CLAUDE.md). Grocery list + pantry land next chunk.

interface Slot {
  slot_id: string;
  lane: string;
  title: string;
  status: "planned" | "done" | "skipped";
  library_id?: string;
}
interface Day {
  date: string;
  slots: Slot[];
  budget?: { consumed: number; target: number };
}
interface FoodRow {
  id: string;
  kind: "ingredient" | "product" | "snack" | "recipe" | "meal";
  title: string;
  source_url: string | null;
  created_at: string;
  has_nutrition: boolean;
  favorite: boolean;
  times_eaten: number;
}

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const host = (url: string | null) => {
  if (!url) return "saved by hand";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "saved";
  }
};

export default function NutritionPage() {
  const today = todayLocal();
  const [days, setDays] = useState<Day[] | null>(null);
  const [foods, setFoods] = useState<FoodRow[] | null>(null);
  const [cooking, setCooking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [foodTitle, setFoodTitle] = useState("");
  const [foodDate, setFoodDate] = useState(today);
  const [foodQuantity, setFoodQuantity] = useState("");
  const [foodUnit, setFoodUnit] = useState("serving");
  const [loggingFood, setLoggingFood] = useState(false);
  const [lastFood, setLastFood] = useState<{ eventId: string; title: string } | null>(null);
  const [favoritePrompt, setFavoritePrompt] = useState<{ libraryId: string; title: string } | null>(null);
  const [favoriting, setFavoriting] = useState<string | null>(null);

  // The star renders from the re-read library the server returns — the
  // receipt. Never optimistic: a failed write must not leave the UI claiming
  // a preference that was never stored.
  async function toggleFavorite(food: { id: string; title: string; favorite: boolean }) {
    if (favoriting) return;
    setFavoriting(food.id);
    try {
      const data = await fetch("/api/foods/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_id: food.id, favorite: !food.favorite }),
      }).then((response) => response.json());
      if (!data.ok) throw new Error();
      setFoods(data.foods ?? []);
      if (favoritePrompt?.libraryId === food.id) setFavoritePrompt(null);
    } catch {
      setNotice("That favorite didn't save.");
    }
    setFavoriting(null);
  }

  function loadSchedule() {
    return fetch("/api/schedule")
      .then((res) => res.json())
      .then((data) => setDays(data.days ?? []))
      .catch(() => setNotice("Couldn't load the day."));
  }
  function loadFoods() {
    return fetch("/api/foods")
      .then((res) => res.json())
      .then((data) => setFoods(data.foods ?? []))
      .catch(() => setFoods([]));
  }
  useEffect(() => {
    void loadSchedule();
    void loadFoods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cook(slot: Slot) {
    if (!slot.library_id || cooking) return;
    setCooking(slot.slot_id);
    setNotice(null);
    try {
      const res = await fetch("/api/cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_id: slot.library_id }),
      });
      const data = await res.json();
      if (data.ok && data.event_id) {
        await loadSchedule(); // done state comes from the fold, not optimism
      } else {
        setNotice(`Couldn't log that cook${data.reason ? `: ${data.reason}` : "."}`);
      }
    } catch {
      setNotice("Couldn't log that cook.");
    }
    setCooking(null);
  }

  async function logFood(e: React.FormEvent) {
    e.preventDefault();
    if (!foodTitle.trim() || loggingFood) return;
    setLoggingFood(true);
    try {
      const data = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "food",
          title: foodTitle.trim(),
          date: foodDate,
          ...(foodQuantity ? { quantity: Number(foodQuantity), unit: foodUnit.trim() } : {}),
        }),
      }).then((response) => response.json());
      if (!data.ok || !data.event_id) throw new Error(String(data.reason ?? "log failed"));
      setDays(data.days ?? []);
      setLastFood({ eventId: data.event_id, title: foodTitle.trim() });
      setNotice(`Logged: ${foodTitle.trim()}${foodDate === today ? "" : ` on ${foodDate}`}.`);
      // Second-eat prompt (UX.md): offer the star only on a repeat. Asking on
      // the first bite would make a favorite mean "eaten once".
      if (data.library_id && data.first_time === false) {
        setFavoritePrompt({ libraryId: data.library_id, title: foodTitle.trim() });
      }
      void loadFoods(); // the library gained a row or an eat count
      setFoodTitle("");
      setFoodQuantity("");
    } catch {
      setNotice("That food log didn't save.");
    }
    setLoggingFood(false);
  }

  async function undoFood() {
    if (!lastFood || loggingFood) return;
    setLoggingFood(true);
    try {
      const data = await fetch("/api/retract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: lastFood.eventId }),
      }).then((response) => response.json());
      if (!data.ok) throw new Error();
      setDays(data.days ?? []);
      setNotice(`Removed: ${lastFood.title}.`);
      setLastFood(null);
    } catch {
      setNotice("That undo didn't save.");
    }
    setLoggingFood(false);
  }

  const day = days?.find((d) => d.date === today);
  const meals = day?.slots.filter((s) => s.lane === "meal") ?? [];

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Nutrition</h1>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {day?.budget && (
            <div className="p-card">
              <span className="p-eyebrow">Day budget</span>
              <strong>{day.budget.consumed}</strong>
              <span className="p-muted"> / {day.budget.target} kcal</span>
            </div>
          )}
          {notice && <div className="p-placeholder">{notice}</div>}
          {favoritePrompt && (
            <div className="p-card p-stack" role="status">
              <span className="p-eyebrow">Second time eating this</span>
              <strong>{favoritePrompt.title}</strong>
              <div className="chip-row">
                <button
                  type="button"
                  className="finish-btn"
                  disabled={favoriting === favoritePrompt.libraryId}
                  onClick={() =>
                    void toggleFavorite({
                      id: favoritePrompt.libraryId,
                      title: favoritePrompt.title,
                      favorite: false,
                    })
                  }
                >
                  Save as a favorite
                </button>
                <button type="button" className="chip" onClick={() => setFavoritePrompt(null)}>
                  Not now
                </button>
              </div>
            </div>
          )}

          <form className="p-card p-stack" onSubmit={logFood}>
            <span className="p-eyebrow">Log what you ate</span>
            <input
              className="set-input"
              aria-label="Food eaten"
              placeholder="e.g. two eggs and toast"
              value={foodTitle}
              onChange={(event) => setFoodTitle(event.target.value)}
            />
            <input
              className="set-input"
              aria-label="Date eaten"
              type="date"
              max={today}
              value={foodDate}
              onChange={(event) => setFoodDate(event.target.value)}
            />
            <div className="onb-basics">
              <input
                className="set-input"
                aria-label="Food quantity"
                type="number"
                min="0.01"
                step="any"
                placeholder="amount (optional)"
                value={foodQuantity}
                onChange={(event) => setFoodQuantity(event.target.value)}
              />
              <input
                className="set-input"
                aria-label="Food quantity unit"
                placeholder="serving, g, cup…"
                value={foodUnit}
                onChange={(event) => setFoodUnit(event.target.value)}
              />
            </div>
            <div className="chip-row">
              <button type="submit" className="finish-btn" disabled={loggingFood || !foodTitle.trim()}>
                {loggingFood ? "Logging…" : "Log food"}
              </button>
              {lastFood && (
                <button type="button" className="chip" disabled={loggingFood} onClick={() => void undoFood()}>
                  Undo last log
                </button>
              )}
            </div>
          </form>

          <div className="nutrition-links">
            <Link href="/nutrition/library/new" className="p-card nutrition-link">
              <span className="p-eyebrow">Add food</span>
              Import a link or photo, or enter a recipe, ingredient, product, snack, or meal
            </Link>
            <Link href="/nutrition/groceries" className="p-card nutrition-link">
              <span className="p-eyebrow">Grocery list</span>
              The week&rsquo;s list, built from the plan
            </Link>
            <Link href="/nutrition/pantry" className="p-card nutrition-link">
              <span className="p-eyebrow">Pantry</span>
              What you have on hand
            </Link>
          </div>

          <section>
            <span className="p-eyebrow">Today&rsquo;s meals</span>
            <div className="p-stack">
              {days && meals.length === 0 && (
                <div className="p-placeholder">No meals planned today.</div>
              )}
              {meals.map((slot) => (
                <div
                  key={slot.slot_id}
                  className={slot.status === "done" ? "slot-row slot-row--done" : "slot-row"}
                >
                  <span className="slot-title">{slot.title}</span>
                  {slot.status === "planned" && slot.library_id ? (
                    <button
                      type="button"
                      className="cook-btn"
                      disabled={cooking === slot.slot_id}
                      onClick={() => cook(slot)}
                    >
                      {cooking === slot.slot_id ? "…" : "Cooked it"}
                    </button>
                  ) : (
                    <span className="slot-status">
                      {slot.status === "done" ? "eaten" : slot.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <span className="p-eyebrow">Library</span>
            <div className="p-stack">
              {foods && foods.length === 0 && (
                <div className="p-placeholder">
                  Nothing saved yet. Import a link or photo, scan a barcode, or enter food by
                  hand from Add food.
                </div>
              )}
              {/* Favorites first, then newest. The server already sorts by
                  recency, so this is a stable partition, not a re-sort. */}
              {[...(foods ?? [])]
                .sort((a, b) => Number(b.favorite) - Number(a.favorite))
                .map((food) => {
                  // Only recipes have steps to cook from; the other kinds are
                  // records, so linking them to cook mode would dead-end.
                  const label = food.has_nutrition ? food.kind : `${food.kind} · macros unknown`;
                  return (
                    <div key={food.id} className="slot-row">
                      {food.kind === "recipe" ? (
                        <Link href={`/nutrition/cook/${food.id}`} className="slot-title">
                          {food.title}
                        </Link>
                      ) : (
                        <span className="slot-title">{food.title}</span>
                      )}
                      <span className="slot-status">
                        {food.kind === "recipe" ? host(food.source_url) : label}
                        {food.times_eaten > 0 &&
                          ` · eaten ${food.times_eaten}${food.times_eaten === 1 ? " time" : " times"}`}
                      </span>
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={food.favorite}
                        aria-label={`${food.favorite ? "Unfavorite" : "Favorite"} ${food.title}`}
                        disabled={favoriting === food.id}
                        onClick={() => void toggleFavorite(food)}
                      >
                        {food.favorite ? "★" : "☆"}
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
