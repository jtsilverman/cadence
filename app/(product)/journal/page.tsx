"use client";

import { useEffect, useState } from "react";

// Journal — the diary surface (ux.md): what actually happened, the weekly
// review (pulled, never pushed), and streaks recomputed from the diary.
// Nutrition scope: meals + journal entries; training lanes are [LATER].
// Every view here is a fold over the append-only diary — retracted taps are
// dropped by the folds, corrected entries show their final state.

interface MealEntry {
  event_id?: string;
  date: string;
  title: string;
  library_id?: string;
  quantity?: number;
  unit?: string;
  manual_log?: boolean;
  retracted?: boolean;
  precision?: "exact" | "estimated" | "guessed";
  source?: string;
}
interface JournalEntry {
  date: string;
  text: string;
  mood?: number;
}
interface Review {
  week_start: string;
  meals: { planned: number; done: number };
  journal_count: number;
  mood?: { avg: number };
}
interface Streaks {
  cooking?: number;
  journaling?: number;
}
interface SleepEntry {
  date: string;
  quality: string;
  hours?: number;
  score?: number;
  source: string;
}

export default function JournalPage() {
  const [meals, setMeals] = useState<MealEntry[] | null>(null);
  const [notes, setNotes] = useState<JournalEntry[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [streaks, setStreaks] = useState<Streaks>({});
  const [prompt, setPrompt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sleep, setSleep] = useState<SleepEntry[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null);
  const [mealTitle, setMealTitle] = useState("");
  const [mealDate, setMealDate] = useState("");
  const [mealQuantity, setMealQuantity] = useState("");
  const [mealUnit, setMealUnit] = useState("serving");

  async function loadMeals() {
    const data = await fetch("/api/history?kind=meals&trail=1&limit=60").then((res) => res.json());
    setMeals(data.entries ?? []);
  }

  useEffect(() => {
    loadMeals()
      .catch(() => setNotice("Couldn't load history."));
    fetch("/api/history?kind=journal&limit=20")
      .then((res) => res.json())
      .then((data) => setNotes(data.entries ?? []))
      .catch(() => {});
    fetch("/api/reflect")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setReview(data.review ?? null);
          setStreaks(data.streaks ?? {});
          setPrompt(data.prompt?.text ?? null);
        }
      })
      .catch(() => {});
    fetch("/api/history?kind=sleep&limit=14")
      .then((res) => res.json())
      .then((data) => setSleep(data.entries ?? []))
      .catch(() => {});
  }, []);

  async function saveNote() {
    if (!noteDraft.trim() || saving) return;
    setSaving(true);
    try {
      const data = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "journal", text: noteDraft.trim(), ...(mood ? { mood } : {}) }),
      }).then((response) => response.json());
      if (!data.ok || !data.event_id) throw new Error();
      const [history, reflection] = await Promise.all([
        fetch("/api/history?kind=journal&limit=20").then((response) => response.json()),
        fetch("/api/reflect").then((response) => response.json()),
      ]);
      setNotes(history.entries ?? []);
      if (reflection.ok) {
        setReview(reflection.review ?? null);
        setStreaks(reflection.streaks ?? {});
        setPrompt(reflection.prompt?.text ?? null);
      }
      setNoteDraft("");
      setMood(null);
      setNotice("Journal entry saved to your diary.");
    } catch {
      setNotice("That journal entry didn't save.");
    }
    setSaving(false);
  }

  function beginMealCorrection(entry: MealEntry) {
    setEditingMeal(entry);
    setMealTitle(entry.title);
    setMealDate(entry.date);
    setMealQuantity(entry.quantity?.toString() ?? "");
    setMealUnit(entry.unit ?? "serving");
  }

  async function correctMeal() {
    if (!editingMeal?.event_id || !mealTitle.trim() || !mealDate || saving) return;
    setSaving(true);
    try {
      const data = await fetch("/api/log/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: editingMeal.event_id,
          title: mealTitle.trim(),
          date: mealDate,
          ...(mealQuantity ? { quantity: Number(mealQuantity), unit: mealUnit.trim() } : {}),
        }),
      }).then((response) => response.json());
      if (!data.ok) throw new Error(String(data.reason ?? "correction failed"));
      await loadMeals();
      setEditingMeal(null);
      setNotice("Food log corrected in your diary.");
    } catch {
      setNotice("That correction didn't save.");
    }
    setSaving(false);
  }

  async function removeMeal(entry: MealEntry) {
    if (!entry.event_id || saving) return;
    setSaving(true);
    try {
      const data = await fetch("/api/retract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: entry.event_id }),
      }).then((response) => response.json());
      if (!data.ok) throw new Error();
      await loadMeals();
      setNotice("Food log removed from your diary.");
    } catch {
      setNotice("That food log couldn't be removed.");
    }
    setSaving(false);
  }

  const byDate = new Map<string, MealEntry[]>();
  for (const entry of meals ?? []) {
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  }

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Journal</h1>
        <span className="shell-header-meta">The week you actually lived</span>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {notice && <div className="p-placeholder">{notice}</div>}

          {review && (
            <section className="p-card">
              <span className="p-eyebrow">This week&rsquo;s review</span>
              <p className="onb-copy">
                {review.meals.done} of {review.meals.planned} planned meals eaten
                {review.journal_count > 0 ? ` · ${review.journal_count} notes` : ""}
                {review.mood ? ` · mood ${review.mood.avg.toFixed(1)}/5` : ""}
              </p>
              {(streaks.cooking || streaks.journaling) && (
                <p className="onb-copy p-muted">
                  {streaks.cooking ? `${streaks.cooking}-week cooking streak` : ""}
                  {streaks.cooking && streaks.journaling ? " · " : ""}
                  {streaks.journaling ? `${streaks.journaling}-week journaling streak` : ""}
                </p>
              )}
              {prompt && <p className="onb-copy">{prompt}</p>}
            </section>
          )}

          <section className="p-card p-stack">
            <span className="p-eyebrow">Write a note</span>
            {prompt && <p className="onb-copy">{prompt}</p>}
            <textarea className="set-input" rows={3} aria-label="Journal note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
            <div className="chip-row" aria-label="Mood">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" className={mood === value ? "chip chip--on" : "chip"} onClick={() => setMood(value)}>{value}</button>
              ))}
            </div>
            <button type="button" className="finish-btn" disabled={saving || !noteDraft.trim()} onClick={() => void saveNote()}>
              {saving ? "Saving…" : "Save note"}
            </button>
          </section>

          {sleep.length > 0 && (
            <section>
              <span className="p-eyebrow">Sleep from Whoop or manual logs</span>
              <div className="p-stack">
                {sleep.slice(0, 7).map((entry) => (
                  <div key={entry.date} className="slot-row">
                    <span className="slot-lane">{entry.date}</span>
                    <span className="slot-title">{entry.hours != null ? `${entry.hours} hours` : entry.quality}</span>
                    <span className="slot-status">{entry.score != null ? `score ${entry.score}` : entry.source}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {notes.length > 0 && (
            <section>
              <span className="p-eyebrow">Notes</span>
              <div className="p-stack">
                {notes.map((note, i) => (
                  <div key={i} className="slot-row">
                    <span className="slot-lane">{note.date}</span>
                    <span className="slot-title">{note.text}</span>
                    {note.mood !== undefined && <span className="slot-status">mood {note.mood}/5</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <span className="p-eyebrow">Meals eaten</span>
            {meals && meals.length === 0 && (
              <div className="p-placeholder">Nothing logged yet. Tell the coach what you ate.</div>
            )}
            <div className="p-stack">
              {[...byDate.entries()].map(([date, entries]) => (
                <div key={date}>
                  <span className="p-muted week-chip">{date}</span>
                  {entries.map((entry, i) => (
                    <div key={entry.event_id ?? i} className="p-stack">
                      <div className="slot-row" style={entry.retracted ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
                        <span className="slot-title">
                          {entry.title}{entry.quantity !== undefined ? ` · ${entry.quantity} ${entry.unit ?? "serving"}` : ""}
                        </span>
                        <span className="slot-status">{entry.retracted ? "corrected or removed" : entry.precision ?? "recorded"}</span>
                      </div>
                      {!entry.retracted && entry.event_id && entry.source === "web" && (
                        <div className="chip-row">
                          {(entry.manual_log || entry.library_id?.startsWith("manual-")) && (
                            <button type="button" className="chip" onClick={() => beginMealCorrection(entry)}>Correct</button>
                          )}
                          <button type="button" className="chip" disabled={saving} onClick={() => void removeMeal(entry)}>Remove</button>
                        </div>
                      )}
                      {editingMeal?.event_id === entry.event_id && (
                        <div className="p-card p-stack">
                          <input className="set-input" aria-label="Corrected food" value={mealTitle} onChange={(event) => setMealTitle(event.target.value)} />
                          <input className="set-input" aria-label="Corrected date" type="date" value={mealDate} onChange={(event) => setMealDate(event.target.value)} />
                          <div className="onb-basics">
                            <input className="set-input" aria-label="Corrected quantity" type="number" min="0.01" step="any" placeholder="amount (optional)" value={mealQuantity} onChange={(event) => setMealQuantity(event.target.value)} />
                            <input className="set-input" aria-label="Corrected quantity unit" value={mealUnit} onChange={(event) => setMealUnit(event.target.value)} />
                          </div>
                          <div className="chip-row">
                            <button type="button" className="finish-btn" disabled={saving || !mealTitle.trim() || !mealDate} onClick={() => void correctMeal()}>Save correction</button>
                            <button type="button" className="chip" disabled={saving} onClick={() => setEditingMeal(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
