"use client";

import { useEffect, useState } from "react";

// Journal — the diary surface (ux.md): what actually happened, the weekly
// review (pulled, never pushed), and streaks recomputed from the diary.
// Nutrition scope: meals + journal entries; training lanes are [LATER].
// Every view here is a fold over the append-only diary — retracted taps are
// dropped by the folds, corrected entries show their final state.

interface MealEntry {
  date: string;
  title: string;
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

export default function JournalPage() {
  const [meals, setMeals] = useState<MealEntry[] | null>(null);
  const [notes, setNotes] = useState<JournalEntry[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [streaks, setStreaks] = useState<Streaks>({});
  const [prompt, setPrompt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history?kind=meals&limit=60")
      .then((res) => res.json())
      .then((data) => setMeals(data.entries ?? []))
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
  }, []);

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
                    <div key={i} className="slot-row">
                      <span className="slot-title">{entry.title}</span>
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
