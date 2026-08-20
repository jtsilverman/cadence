"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";

// The live session screen — Hevy-shaped (ux.md): planned exercises listed,
// set rows of weight × reps × effort, tap-through logging. Every logged set
// is a real POST /api/log {kind:"set"} and the row shows done only after
// the event_id receipt. Finish posts the structured session log.

interface Exercise {
  name: string;
  sets?: number;
  reps?: number;
  weight?: number;
  unit?: string;
  next?: { weight: number; unit: string; reason: string };
}
interface Plan {
  title: string;
  exercises: Exercise[];
}

interface RowState {
  weight: string;
  reps: string;
  rpe: string;
  state: "open" | "busy" | "logged" | "error";
}

function SetRow({
  index,
  row,
  unit,
  onChange,
  onLog,
}: {
  index: number;
  row: RowState;
  unit: string;
  onChange: (next: Partial<RowState>) => void;
  onLog: () => void;
}) {
  const locked = row.state === "logged" || row.state === "busy";
  return (
    <div className={row.state === "logged" ? "set-row set-row--logged" : "set-row"}>
      <span className="set-index">{index}</span>
      <input
        className="set-input"
        inputMode="decimal"
        placeholder={unit}
        aria-label={`Set ${index} weight (${unit})`}
        value={row.weight}
        disabled={locked}
        onChange={(e) => onChange({ weight: e.target.value })}
      />
      <input
        className="set-input"
        inputMode="numeric"
        placeholder="reps"
        aria-label={`Set ${index} reps`}
        value={row.reps}
        disabled={locked}
        onChange={(e) => onChange({ reps: e.target.value })}
      />
      <input
        className="set-input"
        inputMode="numeric"
        placeholder="rpe"
        aria-label={`Set ${index} effort (RPE)`}
        value={row.rpe}
        disabled={locked}
        onChange={(e) => onChange({ rpe: e.target.value })}
      />
      <button
        type="button"
        className={row.state === "logged" ? "set-log set-log--done" : "set-log"}
        disabled={locked || !row.reps}
        onClick={onLog}
      >
        {row.state === "logged" ? "✓" : row.state === "busy" ? "…" : "Log"}
      </button>
      {row.state === "error" && <span className="set-error">retry</span>}
    </div>
  );
}

export default function LiveSession({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState[]>>({});
  const [finish, setFinish] = useState<"open" | "busy" | "done" | "error">("open");
  const sessionId = useRef<string>("");
  if (!sessionId.current && typeof crypto !== "undefined") {
    sessionId.current = `session-${crypto.randomUUID()}`;
  }

  useEffect(() => {
    fetch(`/api/workouts/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) return setError(true);
        const p: Plan = data.plan;
        setPlan(p);
        // engine fills reps and targets; the user fills weight (cold-start
        // calibrator, ux.md) — planned weight prefills when it exists
        setRows(
          Object.fromEntries(
            p.exercises.map((ex) => [
              ex.name,
              Array.from({ length: ex.sets ?? 1 }, () => ({
                weight: ex.weight ? String(ex.weight) : "",
                reps: ex.reps ? String(ex.reps) : "",
                rpe: "",
                state: "open" as const,
              })),
            ])
          )
        );
      })
      .catch(() => setError(true));
  }, [id]);

  function patchRow(exercise: string, i: number, patch: Partial<RowState>) {
    setRows((all) => ({
      ...all,
      [exercise]: all[exercise].map((row, j) => (j === i ? { ...row, ...patch } : row)),
    }));
  }

  async function logSet(exercise: Exercise, i: number) {
    const row = rows[exercise.name][i];
    const reps = Number(row.reps);
    if (!Number.isInteger(reps) || reps <= 0) return patchRow(exercise.name, i, { state: "error" });
    patchRow(exercise.name, i, { state: "busy" });
    const body: Record<string, unknown> = {
      kind: "set",
      session_id: sessionId.current,
      exercise: exercise.name,
      set_index: i + 1,
      reps,
      library_id: id,
    };
    const weight = Number(row.weight);
    if (row.weight && Number.isFinite(weight) && weight > 0) {
      body.weight = weight;
      body.unit = exercise.unit ?? "lb";
    }
    const rpe = Number(row.rpe);
    if (row.rpe && rpe >= 1 && rpe <= 10) body.rpe = rpe;
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      patchRow(exercise.name, i, { state: data.ok && data.event_id ? "logged" : "error" });
    } catch {
      patchRow(exercise.name, i, { state: "error" });
    }
  }

  async function finishSession() {
    if (!plan || finish === "busy") return;
    setFinish("busy");
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "session",
          title: plan.title,
          session_kind: "structured",
          session_id: sessionId.current,
          library_id: id,
        }),
      });
      const data = await res.json();
      setFinish(data.ok && data.event_id ? "done" : "error");
    } catch {
      setFinish("error");
    }
  }

  const loggedCount = Object.values(rows).flat().filter((r) => r.state === "logged").length;

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">{plan?.title ?? "Session"}</h1>
        <span className="shell-header-meta">
          {loggedCount} {loggedCount === 1 ? "set" : "sets"} logged
        </span>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {error && <div className="p-placeholder">Couldn&rsquo;t load this workout.</div>}
          {plan?.exercises.map((ex) => (
            <section key={ex.name} className="p-card">
              <div className="exercise-head">
                <h2 className="exercise-name">{ex.name}</h2>
                <span className="p-muted exercise-target">
                  {ex.sets ?? 1} × {ex.reps ?? "?"}
                </span>
              </div>
              {ex.next && (
                <p className="exercise-next">
                  Suggested: {ex.next.weight} {ex.next.unit}. {ex.next.reason}
                </p>
              )}
              <div className="set-head">
                <span className="set-index">#</span>
                <span>{ex.unit ?? "lb"}</span>
                <span>reps</span>
                <span>rpe</span>
                <span />
              </div>
              {rows[ex.name]?.map((row, i) => (
                <SetRow
                  key={i}
                  index={i + 1}
                  row={row}
                  unit={ex.unit ?? "lb"}
                  onChange={(patch) => patchRow(ex.name, i, patch)}
                  onLog={() => logSet(ex, i)}
                />
              ))}
            </section>
          ))}
          {plan && finish !== "done" && (
            <button type="button" className="finish-btn" disabled={finish === "busy"} onClick={finishSession}>
              {finish === "busy" ? "Saving…" : "Finish session"}
            </button>
          )}
          {finish === "error" && (
            <div className="p-placeholder">The session log didn&rsquo;t save. Try Finish again.</div>
          )}
          {finish === "done" && (
            <div className="p-card">
              <span className="p-eyebrow">Logged</span>
              Session saved to your diary.{" "}
              <Link href="/today" className="finish-link">
                Back to Today
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
