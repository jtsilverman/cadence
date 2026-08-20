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
interface RecipeRow {
  id: string;
  title: string;
  source_url: string | null;
  created_at: string;
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
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [cooking, setCooking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function loadSchedule() {
    return fetch("/api/schedule")
      .then((res) => res.json())
      .then((data) => setDays(data.days ?? []))
      .catch(() => setNotice("Couldn't load the day."));
  }
  useEffect(() => {
    void loadSchedule();
    fetch("/api/recipes")
      .then((res) => res.json())
      .then((data) => setRecipes(data.recipes ?? []))
      .catch(() => setRecipes([]));
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

          <div className="nutrition-links">
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
              {recipes && recipes.length === 0 && (
                <div className="p-placeholder">
                  Nothing saved yet. Drop a TikTok or a link with the coach and it comes back
                  a structured recipe.
                </div>
              )}
              {recipes?.map((recipe) => (
                <div key={recipe.id} className="slot-row">
                  <span className="slot-title">{recipe.title}</span>
                  <span className="slot-status">{host(recipe.source_url)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
