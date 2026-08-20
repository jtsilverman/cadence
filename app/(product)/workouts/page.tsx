"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Workouts — the library list; tapping one opens the live session screen.
// Program position and richer detail come in a later chunk.

interface WorkoutRow {
  id: string;
  title: string;
  exercise_count: number;
}

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<WorkoutRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/workouts")
      .then((res) => res.json())
      .then((data) => setWorkouts(data.workouts ?? []))
      .catch(() => setError(true));
  }, []);

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Workouts</h1>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {error && <div className="p-placeholder">Couldn&rsquo;t load workouts.</div>}
          {workouts && workouts.length === 0 && (
            <div className="p-placeholder">
              No saved workouts yet. Save one from a video or build it with the coach.
            </div>
          )}
          {workouts?.map((w) => (
            <Link key={w.id} href={`/workouts/${w.id}`} className="slot-row">
              <span className="slot-lane">workout</span>
              <span className="slot-title">{w.title}</span>
              <span className="slot-status">
                {w.exercise_count} {w.exercise_count === 1 ? "exercise" : "exercises"}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
