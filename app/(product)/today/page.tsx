"use client";

import { useEffect, useRef, useState } from "react";

// Today / day view — home (ux.md). One /api/schedule read feeds both views:
// the day (slots + day-level budget; per-meal calorie badges are banned,
// CLAUDE.md) and the week — the two-week plan board, where dragging a
// workout chip onto another day re-posts the full snapshot (latest wins)
// and the board re-renders only from the receipt.

interface Slot {
  slot_id: string;
  lane: string;
  title: string;
  status: "planned" | "done" | "skipped";
  library_id?: string;
  priority?: unknown;
}
interface Day {
  date: string;
  slots: Slot[];
  budget?: { consumed: number; target: number };
  recovery?: { score?: number; hrv?: number; resting_hr?: number };
  repair_proposals?: Array<{
    suggestion_id: string;
    option: string;
    reason: string;
    recommended?: boolean;
  }>;
  nutrition_proposals?: Array<{
    suggestion_id: string;
    reason: string;
  }>;
}

function todayLocal(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
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
const longDate = (dateISO: string) =>
  new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
const dayChip = (dateISO: string) =>
  new Date(`${dateISO}T12:00:00Z`)
    .toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
    .toUpperCase();

// The write mirror of lib/schedule proposedSnapshot: the full plan, fold
// decorations stripped. A partial days array would delete unlisted days.
function toSnapshot(days: Day[]) {
  return days.map((day) => ({
    date: day.date,
    slots: day.slots.map(({ status: _s, ...slot }) => slot),
  }));
}

function movedDays(days: Day[], slotId: string, fromDate: string, toDate: string): Day[] {
  const from = days.find((d) => d.date === fromDate);
  const slot = from?.slots.find((s) => s.slot_id === slotId);
  if (!from || !slot) return days;
  const withTarget = days.some((d) => d.date === toDate)
    ? days
    : [...days, { date: toDate, slots: [] }];
  return withTarget.map((day) => {
    if (day.date === fromDate) {
      return { ...day, slots: day.slots.filter((s) => s.slot_id !== slotId) };
    }
    if (day.date === toDate) {
      return { ...day, slots: [...day.slots, slot] };
    }
    return day;
  });
}

interface RecipeOption {
  id: string;
  title: string;
}

interface DraftProposal {
  suggestion_id: string;
  reason: string;
  days: Array<{ date: string; slots: Array<{ title: string; meal_type?: string; time?: string }> }>;
}

function DayView({
  day,
  cooking,
  undoable,
  swapOptions,
  onCook,
  onSkip,
  onUndo,
  onSwap,
  onResolve,
}: {
  day: Day | undefined;
  cooking: string | null;
  undoable: Map<string, string>; // slot_id → event_id of this session's cook
  swapOptions: RecipeOption[];
  onCook: (slot: Slot) => void;
  onSkip: (slot: Slot) => void;
  onUndo: (slot: Slot) => void;
  onSwap: (slot: Slot, next: RecipeOption) => void;
  onResolve: (suggestionId: string, outcome: "accepted" | "dismissed", appliesPlan: boolean) => void;
}) {
  const [swapOpen, setSwapOpen] = useState<string | null>(null);
  return (
    <div className="p-stack">
      {day?.recovery && (
        <div className="p-card">
          <span className="p-eyebrow">Whoop recovery</span>
          <strong>{day.recovery.score ?? "—"}</strong>
          <span className="p-muted">
            {day.recovery.hrv != null ? ` · HRV ${day.recovery.hrv}` : ""}
            {day.recovery.resting_hr != null ? ` · resting ${day.recovery.resting_hr}` : ""}
          </span>
        </div>
      )}
      {day?.budget && (
        <div className="p-card">
          <span className="p-eyebrow">Day budget</span>
          <strong>{day.budget.consumed}</strong>
          <span className="p-muted"> / {day.budget.target} kcal</span>
        </div>
      )}
      {!day?.slots.length && (
        <div className="p-placeholder">
          Nothing planned for this day. The week board and the coach both fill this in.
        </div>
      )}
      {day?.slots.map((slot) => (
        <div key={slot.slot_id}>
          <div className={slot.status === "done" ? "slot-row slot-row--done" : "slot-row"}>
            <span className="slot-lane">{slot.lane}</span>
            <span className="slot-title">{slot.title}</span>
            {slot.lane === "meal" && slot.status === "planned" && slot.library_id ? (
              <span className="slot-actions">
                <button
                  type="button"
                  className="cook-btn"
                  disabled={cooking === slot.slot_id}
                  onClick={() => onCook(slot)}
                >
                  {cooking === slot.slot_id ? "…" : "Cooked it"}
                </button>
                <button
                  type="button"
                  className="cook-btn cook-btn--ghost"
                  onClick={() => setSwapOpen(swapOpen === slot.slot_id ? null : slot.slot_id)}
                >
                  Swap
                </button>
                <button type="button" className="cook-btn cook-btn--ghost" onClick={() => onSkip(slot)}>
                  Skipped
                </button>
              </span>
            ) : (slot.status === "done" || slot.status === "skipped") && undoable.has(slot.slot_id) ? (
              <span className="slot-actions">
                <span className="slot-status">{slot.status === "done" ? "eaten" : "skipped"}</span>
                <button type="button" className="cook-btn cook-btn--ghost" onClick={() => onUndo(slot)}>
                  Undo
                </button>
              </span>
            ) : (
              <span className="slot-status">{slot.status}</span>
            )}
          </div>
          {swapOpen === slot.slot_id && (
            <div className="chip-row swap-row">
              {swapOptions
                .filter((option) => option.id !== slot.library_id)
                .slice(0, 6)
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setSwapOpen(null);
                      onSwap(slot, option);
                    }}
                  >
                    {option.title}
                  </button>
                ))}
            </div>
          )}
        </div>
      ))}
      {day?.repair_proposals?.map((proposal) => (
        <div key={proposal.suggestion_id} className="p-card">
          <span className="p-eyebrow">{proposal.recommended ? "Recommended repair" : "Repair option"}</span>
          <p className="onb-copy">{proposal.reason}</p>
          <div className="chip-row">
            <button type="button" className="chip chip--on" onClick={() => onResolve(proposal.suggestion_id, "accepted", true)}>Apply {proposal.option}</button>
            <button type="button" className="chip" onClick={() => onResolve(proposal.suggestion_id, "dismissed", true)}>Dismiss</button>
          </div>
        </div>
      ))}
      {day?.nutrition_proposals?.map((proposal) => (
        <div key={proposal.suggestion_id} className="p-card">
          <span className="p-eyebrow">Week adjustment</span>
          <p className="onb-copy">{proposal.reason}</p>
          <div className="chip-row">
            <button type="button" className="chip chip--on" onClick={() => onResolve(proposal.suggestion_id, "accepted", false)}>Use this adjustment</button>
            <button type="button" className="chip" onClick={() => onResolve(proposal.suggestion_id, "dismissed", false)}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface DragState {
  slotId: string;
  fromDate: string;
  title: string;
  x: number;
  y: number;
  overDate: string | null;
}

function WeekBoard({
  days,
  today,
  onPick,
  onMove,
}: {
  days: Day[];
  today: string;
  onPick: (date: string) => void;
  onMove: (slotId: string, fromDate: string, toDate: string) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  function updateDrag(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function dateUnderPointer(x: number, y: number): string | null {
    const hit = document
      .elementsFromPoint(x, y)
      .find((el) => el instanceof HTMLElement && el.dataset.date) as HTMLElement | undefined;
    return hit?.dataset.date ?? null;
  }

  function startDrag(e: React.PointerEvent, slot: Slot, fromDate: string) {
    // done/skipped stay where they happened; only planned work moves
    if (slot.status !== "planned") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateDrag({
      slotId: slot.slot_id,
      fromDate,
      title: slot.title,
      x: e.clientX,
      y: e.clientY,
      overDate: null,
    });
  }
  function moveDrag(e: React.PointerEvent) {
    const current = dragRef.current;
    if (!current) return;
    updateDrag({
      ...current,
      x: e.clientX,
      y: e.clientY,
      overDate: dateUnderPointer(e.clientX, e.clientY),
    });
  }
  function endDrag() {
    const current = dragRef.current;
    updateDrag(null);
    if (current?.overDate && current.overDate !== current.fromDate) {
      onMove(current.slotId, current.fromDate, current.overDate);
    }
  }

  const monday = mondayOf(today);
  const weeks = [
    { label: "This week", start: monday },
    { label: "Next week", start: addDays(monday, 7) },
  ];
  const byDate = new Map(days.map((d) => [d.date, d]));

  return (
    <div className="p-stack">
      {weeks.map((week) => (
        <section key={week.start}>
          <span className="p-eyebrow">{week.label}</span>
          <div className="week-list">
            {Array.from({ length: 7 }, (_, i) => addDays(week.start, i)).map((date) => {
              const day = byDate.get(date);
              const over = drag?.overDate === date && drag.fromDate !== date;
              return (
                <div
                  key={date}
                  data-date={date}
                  className={[
                    "board-day",
                    date === today ? "board-day--today" : "",
                    over ? "board-day--over" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button type="button" className="board-day-head" onClick={() => onPick(date)}>
                    <span className="week-chip">{dayChip(date)}</span>
                    <span className="p-muted board-day-count">
                      {day?.slots.length ? `${day.slots.length} planned` : "Unplanned"}
                    </span>
                  </button>
                  <div className="board-chips">
                    {day?.slots
                      .filter((s) => s.lane !== "sleep")
                      .map((slot) => (
                        <span
                          key={slot.slot_id}
                          className={[
                            "board-chip",
                            slot.lane === "workout" ? "board-chip--workout" : "",
                            slot.status === "done" ? "board-chip--done" : "",
                            drag?.slotId === slot.slot_id ? "board-chip--lifted" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onPointerDown={
                            slot.lane === "workout" || slot.lane === "meal"
                              ? (e) => startDrag(e, slot, date)
                              : undefined
                          }
                          onPointerMove={
                            slot.lane === "workout" || slot.lane === "meal" ? moveDrag : undefined
                          }
                          onPointerUp={
                            slot.lane === "workout" || slot.lane === "meal" ? endDrag : undefined
                          }
                        >
                          {slot.title}
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {drag && (
        <span className="board-ghost" style={{ left: drag.x + 12, top: drag.y - 16 }}>
          {drag.title}
        </span>
      )}
    </div>
  );
}

export default function TodayPage() {
  const today = todayLocal();
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(today);
  const [goalCount, setGoalCount] = useState<number | null>(null);
  const [cooking, setCooking] = useState<string | null>(null);
  const [undoable, setUndoable] = useState<Map<string, string>>(new Map());
  const [swapOptions, setSwapOptions] = useState<RecipeOption[]>([]);
  const [draft, setDraft] = useState<DraftProposal | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [whoop, setWhoop] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [whoopSyncing, setWhoopSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/schedule")
      .then((res) => res.json())
      .then((data) => setDays(data.days ?? []))
      .catch(() => setError(true));
    fetch("/api/goals")
      .then((res) => res.json())
      .then((data) => setGoalCount((data.goals ?? []).length))
      .catch(() => setGoalCount(null));
    fetch("/api/recipes")
      .then((res) => res.json())
      .then((data) =>
        setSwapOptions(
          (data.recipes ?? []).map((r: { id: string; title: string }) => ({ id: r.id, title: r.title }))
        )
      )
      .catch(() => setSwapOptions([]));
    fetch("/api/whoop/status")
      .then((res) => res.json())
      .then((data) => data.ok && setWhoop({ configured: Boolean(data.configured), connected: Boolean(data.connected) }))
      .catch(() => setWhoop(null));
  }, []);

  async function refetchSchedule() {
    const data = await fetch("/api/schedule").then((res) => res.json());
    if (data.days) setDays(data.days);
  }

  // "Cooked it" from Today: the receipt-gated log (the same /api/cook the
  // Nutrition page uses), with a session-scoped Undo handle on the receipt.
  async function cookSlot(slot: Slot) {
    if (cooking || !slot.library_id) return;
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
        setUndoable((prev) => new Map(prev).set(slot.slot_id, data.event_id));
        await refetchSchedule();
      } else {
        setNotice("Couldn't log that. Nothing was written.");
      }
    } catch {
      setNotice("Couldn't log that. Nothing was written.");
    }
    setCooking(null);
  }

  async function skipSlot(slot: Slot) {
    if (cooking) return;
    setCooking(slot.slot_id);
    setNotice(null);
    try {
      const data = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "skip", slot_id: slot.slot_id, lane: "meal" }),
      }).then((response) => response.json());
      if (!data.ok || !data.event_id || !data.days) throw new Error();
      setUndoable((previous) => new Map(previous).set(slot.slot_id, data.event_id));
      setDays(data.days);
      setNotice(`Skipped: ${slot.title}. Choose a repair below or leave the plan alone.`);
    } catch {
      setNotice("Couldn't record that skip. Nothing was written.");
    }
    setCooking(null);
  }

  async function undoSlot(slot: Slot) {
    const eventId = undoable.get(slot.slot_id);
    if (!eventId) return;
    try {
      const res = await fetch("/api/retract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      const data = await res.json();
      if (data.ok) {
        setUndoable((prev) => {
          const next = new Map(prev);
          next.delete(slot.slot_id);
          return next;
        });
        setNotice("Taken back — the tap and the undo both stay on your trail.");
        await refetchSchedule();
      } else {
        setNotice("Couldn't undo that.");
      }
    } catch {
      setNotice("Couldn't undo that.");
    }
  }

  // Manual swap: replace this slot's meal in a FULL snapshot post (latest
  // wins; a partial days array would delete unlisted days).
  async function swapSlot(slot: Slot, next: RecipeOption) {
    if (!days) return;
    const swapped = days.map((day) => ({
      ...day,
      slots: day.slots.map((s) =>
        s.slot_id === slot.slot_id ? { ...s, title: next.title, library_id: next.id } : s
      ),
    }));
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: toSnapshot(swapped) }),
      });
      const data = await res.json();
      if (data.ok && data.days) {
        setDays(data.days);
        setNotice(`Swapped: ${slot.title} → ${next.title}.`);
      } else {
        setNotice("That swap didn't save. The plan is unchanged.");
      }
    } catch {
      setNotice("That swap didn't save. The plan is unchanged.");
    }
  }

  async function moveSlot(slotId: string, fromDate: string, toDate: string) {
    if (!days) return;
    const optimistic = movedDays(days, slotId, fromDate, toDate);
    setDays(optimistic);
    setNotice(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: toSnapshot(optimistic) }),
      });
      const data = await res.json();
      if (data.ok && data.days) {
        setDays(data.days); // the receipt is the truth
      } else {
        setDays(days);
        setNotice("That move didn't save. The board is back the way it was.");
      }
    } catch {
      setDays(days);
      setNotice("That move didn't save. The board is back the way it was.");
    }
  }

  async function loadDraft() {
    if (draftBusy) return;
    setDraftBusy(true);
    setNotice(null);
    try {
      const data = await fetch("/api/plan/draft").then((response) => response.json());
      if (data.ok && data.suggestion_id && data.draft?.days) {
        setDraft({
          suggestion_id: data.suggestion_id,
          reason: String(data.draft.reason ?? "Next week drafted from your food library."),
          days: data.draft.days,
        });
      } else if (data.ok) {
        setNotice("The next-week draft is currently dismissed. Change the inputs or ask the coach to revisit it.");
      } else {
        setNotice("Couldn't draft next week.");
      }
    } catch {
      setNotice("Couldn't draft next week.");
    }
    setDraftBusy(false);
  }

  async function resolveDraft(outcome: "accepted" | "dismissed") {
    if (!draft || draftBusy) return;
    setDraftBusy(true);
    try {
      const data = await fetch("/api/plan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: draft.suggestion_id, outcome }),
      }).then((response) => response.json());
      if (!data.ok) {
        if (String(data.reason ?? "").includes("fresh draft")) setDraft(null);
        setNotice(data.reason ?? "That draft decision didn't save. The calendar is unchanged.");
        setDraftBusy(false);
        return;
      }
      setDraft(null);
      setNotice(outcome === "accepted" ? "Next week approved and on the calendar." : "Draft dismissed. The calendar is unchanged.");
      if (outcome === "accepted") await refetchSchedule();
    } catch {
      setNotice("That draft decision didn't save. The calendar is unchanged.");
    }
    setDraftBusy(false);
  }

  async function resolveVisibleSuggestion(
    suggestionId: string,
    outcome: "accepted" | "dismissed",
    appliesPlan: boolean,
  ) {
    try {
      const data = await fetch(appliesPlan ? "/api/plan/resolve" : "/api/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: suggestionId, outcome }),
      }).then((response) => response.json());
      if (!data.ok) throw new Error();
      setNotice(
        outcome === "accepted"
          ? appliesPlan
            ? "Repair approved and on the calendar."
            : "Adjustment accepted."
          : "Suggestion dismissed. The plan is unchanged.",
      );
      await refetchSchedule();
    } catch {
      setNotice("That decision didn't save. The plan is unchanged.");
    }
  }

  async function syncWhoop() {
    if (whoopSyncing) return;
    setWhoopSyncing(true);
    try {
      const data = await fetch("/api/whoop/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14 }),
      }).then((response) => response.json());
      if (!data.ok) throw new Error();
      setNotice("Whoop synced. Recovery and sleep context are up to date.");
      await refetchSchedule();
    } catch {
      setNotice("Whoop couldn't sync. Your nutrition plan still works without it.");
    }
    setWhoopSyncing(false);
  }

  const day = days?.find((d) => d.date === date);
  const title = view === "week" ? "Week" : date === today ? "Today" : longDate(date).split(",")[0];

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">{title}</h1>
        <div className="seg" role="tablist" aria-label="Calendar view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "day"}
            className={view === "day" ? "seg-btn seg-btn--on" : "seg-btn"}
            onClick={() => setView("day")}
          >
            Day
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "week"}
            className={view === "week" ? "seg-btn seg-btn--on" : "seg-btn"}
            onClick={() => setView("week")}
          >
            Week
          </button>
        </div>
      </header>
      <main className="shell-main">
        {view === "day" && (
          <div className="day-nav">
            <button type="button" className="day-nav-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
              ‹
            </button>
            <span className="day-nav-date">{longDate(date)}</span>
            <button type="button" className="day-nav-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
              ›
            </button>
          </div>
        )}
        {error && <div className="p-placeholder">Couldn&rsquo;t load the schedule.</div>}
        {notice && <div className="p-placeholder">{notice}</div>}
        {goalCount === 0 && (
          <a href="/onboarding" className="p-card nutrition-link onboarding-cta">
            <span className="p-eyebrow">Start here</span>
            No goals yet. Three quick questions and the plan drafts itself.
          </a>
        )}
        {whoop?.configured && (
          <section className="p-card">
            <span className="p-eyebrow">Whoop</span>
            {whoop.connected ? (
              <div className="chip-row">
                <span className="chip chip--on">Connected</span>
                <button type="button" className="chip" disabled={whoopSyncing} onClick={() => void syncWhoop()}>
                  {whoopSyncing ? "Syncing…" : "Sync recent data"}
                </button>
              </div>
            ) : (
              <a className="finish-btn" href="/api/whoop/connect">Connect Whoop</a>
            )}
          </section>
        )}
        {view === "week" && goalCount !== 0 && (
          <section className="p-card p-stack">
            <span className="p-eyebrow">Living draft</span>
            {!draft ? (
              <button type="button" className="finish-btn" disabled={draftBusy} onClick={() => void loadDraft()}>
                {draftBusy ? "Drafting…" : "Review next week draft"}
              </button>
            ) : (
              <>
                <p className="onb-copy">{draft.reason}</p>
                <div className="p-stack">
                  {draft.days.map((draftDay) => (
                    <div key={draftDay.date} className="slot-row">
                      <span className="slot-lane">{dayChip(draftDay.date)}</span>
                      <span className="slot-title">
                        {draftDay.slots.map((slot) => `${slot.meal_type ?? "meal"}: ${slot.title}`).join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="chip-row">
                  <button type="button" className="finish-btn" disabled={draftBusy} onClick={() => void resolveDraft("accepted")}>Approve next week</button>
                  <button type="button" className="chip" disabled={draftBusy} onClick={() => void resolveDraft("dismissed")}>Not now</button>
                </div>
              </>
            )}
          </section>
        )}
        {days &&
          (view === "day" ? (
            <DayView
              day={day}
              cooking={cooking}
              undoable={undoable}
              swapOptions={swapOptions}
              onCook={cookSlot}
              onSkip={skipSlot}
              onUndo={undoSlot}
              onSwap={swapSlot}
              onResolve={resolveVisibleSuggestion}
            />
          ) : (
            <WeekBoard
              days={days}
              today={today}
              onPick={(picked) => {
                setDate(picked);
                setView("day");
              }}
              onMove={moveSlot}
            />
          ))}
      </main>
    </>
  );
}
