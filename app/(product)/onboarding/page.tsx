"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "../../telemetry";

// Onboarding (ux.md: one conversation, tap-chips + a dictation-first seeding
// question, calorie target as an adjustable proposal — never a blank field —
// ending at the standard plan-proposal flow: week 1 drafted → approve).
// Real rails: seeding writes library recipes, the locked proposal writes
// GoalSet events, approving the draft posts the full week snapshot. The
// Future You simulator is designed but not built yet (ux.md DECISIONS).

const DIRECTIONS = [
  "Get leaner",
  "Build strength",
  "Both, honestly",
  "Just eat like an adult",
] as const;
const DAYS = [2, 3, 4, 5, 6] as const;

interface Basics {
  sex: "m" | "f";
  weightLb: number;
  heightIn: number;
  age: number;
}
interface SeededMeal {
  library_id: string;
  title: string;
}

function proposeCalories(basics: Basics, direction: string): number {
  const kg = basics.weightLb * 0.4536;
  const cm = basics.heightIn * 2.54;
  // Mifflin-St Jeor, light-activity multiplier, coarse honest numbers
  const bmr = 10 * kg + 6.25 * cm - 5 * basics.age + (basics.sex === "m" ? 5 : -161);
  const maintenance = bmr * 1.4;
  const adjusted = direction === "Get leaner" ? maintenance - 400 : maintenance;
  return Math.max(1400, Math.round(adjusted / 50) * 50);
}

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Week 1: today through +6, three meals a day rotated from the seeded
// favorites. Deterministic — the draft the user sees is exactly what applies.
function draftWeek(meals: SeededMeal[], today: string) {
  return Array.from({ length: 7 }, (_, d) => ({
    date: addDays(today, d),
    slots: [0, 1, 2].map((m) => {
      const meal = meals[(d + m * 3) % meals.length];
      return { lane: "meal" as const, title: meal.title, library_id: meal.library_id };
    }),
  }));
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [seedText, setSeedText] = useState("");
  const [seeded, setSeeded] = useState<SeededMeal[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [sex, setSex] = useState<"m" | "f" | null>(null);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [calories, setCalories] = useState<number | null>(null);
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const [approving, setApproving] = useState(false);

  const basics: Basics | null = useMemo(() => {
    const w = Number(weight);
    const h = Number(height);
    const a = Number(age);
    if (!sex || !(w > 0) || !(h > 0) || !(a > 0)) return null;
    return { sex, weightLb: w, heightIn: h, age: a };
  }, [sex, weight, height, age]);

  const proposal = basics && direction ? proposeCalories(basics, direction) : null;

  // funnel telemetry (charter Layer 4): one event per step reached
  useEffect(() => {
    const names = ["start", "activity", "seeding", "body_basics", "week_draft", "done"] as const;
    track("onboarding_step", { step: names[Math.min(step, 5)] });
  }, [step]);

  async function seed() {
    if (seeding || !seedText.trim()) return;
    setSeeding(true);
    setState("open");
    try {
      const res = await fetch("/api/onboard/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: seedText }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.meals) && data.meals.length > 0) {
        setSeeded(data.meals);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
    setSeeding(false);
  }

  async function lockGoals() {
    if (!direction || !days || !proposal || state === "busy") return;
    setState("busy");
    const target = calories ?? proposal;
    try {
      const posts = [
        { kind: "custom", title: direction },
        { kind: "cadence", title: `Train ${days} days a week`, per_week: days },
        { kind: "nutrition", title: "Daily energy budget", daily_calories: target },
      ];
      for (const body of posts) {
        const res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.reason);
      }
      track("onboarding_step", { step: "proposal_locked", calories: target });
      setState("open");
      setStep(4);
    } catch {
      setState("error");
    }
  }

  async function approveWeek() {
    if (approving || seeded.length === 0) return;
    setApproving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: draftWeek(seeded, todayLocal()) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error();
      setState("done");
      setStep(5);
    } catch {
      setState("error");
    }
    setApproving(false);
  }

  const draft = seeded.length > 0 ? draftWeek(seeded, todayLocal()) : [];

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Let&rsquo;s set you up</h1>
        <span className="shell-header-meta">{Math.min(step + 1, 5)} of 5</span>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {step === 0 && (
            <section className="p-card">
              <span className="p-eyebrow">First: what are you after?</span>
              <div className="chip-row">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={direction === d ? "chip chip--on" : "chip"}
                    onClick={() => setDirection(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <button type="button" className="finish-btn" disabled={!direction} onClick={() => setStep(1)}>
                Next
              </button>
            </section>
          )}

          {step === 1 && (
            <section className="p-card">
              <span className="p-eyebrow">How many days a week can you train?</span>
              <div className="chip-row">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={days === d ? "chip chip--on" : "chip"}
                    onClick={() => setDays(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <button type="button" className="finish-btn" disabled={!days} onClick={() => setStep(2)}>
                Next
              </button>
            </section>
          )}

          {step === 2 && (
            <section className="p-card">
              <span className="p-eyebrow">What do you actually eat on repeat?</span>
              <p className="onb-copy">
                Talk or type — &ldquo;eggs and toast most mornings, chicken burrito bowls, pasta
                when I&rsquo;m tired.&rdquo; These become your first favorites; week 1 drafts from
                them.
              </p>
              <textarea
                className="set-input onb-seed-input"
                rows={3}
                aria-label="What you eat on repeat"
                placeholder="eggs and toast, chicken burrito bowls, pasta…"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
              />
              {seeded.length > 0 && (
                <div className="chip-row">
                  {seeded.map((meal) => (
                    <span key={meal.library_id} className="chip chip--on">
                      {meal.title}
                    </span>
                  ))}
                </div>
              )}
              {seeded.length === 0 ? (
                <button type="button" className="finish-btn" disabled={seeding || !seedText.trim()} onClick={seed}>
                  {seeding ? "Reading…" : "Make these favorites"}
                </button>
              ) : (
                <button type="button" className="finish-btn" onClick={() => setStep(3)}>
                  Next
                </button>
              )}
              {state === "error" && <p className="onb-copy">That didn&rsquo;t take. Try again.</p>}
            </section>
          )}

          {step === 3 && (
            <section className="p-card">
              <span className="p-eyebrow">Your daily energy budget</span>
              <p className="onb-copy">
                A few basics and Cadence proposes the number. You adjust it; nothing is a blank
                form.
              </p>
              <div className="chip-row">
                {(["m", "f"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={sex === s ? "chip chip--on" : "chip"}
                    onClick={() => setSex(s)}
                  >
                    {s === "m" ? "Male" : "Female"}
                  </button>
                ))}
              </div>
              <div className="onb-basics">
                <input className="set-input" placeholder="lb" inputMode="decimal" aria-label="Weight (lb)" value={weight} onChange={(e) => setWeight(e.target.value)} />
                <input className="set-input" placeholder="height in" inputMode="decimal" aria-label="Height (inches)" value={height} onChange={(e) => setHeight(e.target.value)} />
                <input className="set-input" placeholder="age" inputMode="numeric" aria-label="Age" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              {proposal && (
                <div className="onb-proposal">
                  <span className="p-eyebrow">Proposed</span>
                  <div className="onb-proposal-row">
                    <button type="button" className="day-nav-btn" aria-label="Lower" onClick={() => setCalories((calories ?? proposal) - 50)}>
                      ‹
                    </button>
                    <strong className="onb-number">{calories ?? proposal} kcal</strong>
                    <button type="button" className="day-nav-btn" aria-label="Higher" onClick={() => setCalories((calories ?? proposal) + 50)}>
                      ›
                    </button>
                  </div>
                </div>
              )}
              <button type="button" className="finish-btn" disabled={!proposal || state === "busy"} onClick={lockGoals}>
                {state === "busy" ? "Saving…" : "Lock it in"}
              </button>
              {state === "error" && (
                <p className="onb-copy">That didn&rsquo;t save. Try again.</p>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="p-card">
              <span className="p-eyebrow">Week 1, drafted</span>
              <p className="onb-copy">
                Seven days from your favorites. Proposed, never imposed — approve it and it&rsquo;s
                on the calendar; everything stays adjustable there.
              </p>
              <div className="p-stack">
                {draft.map((day) => (
                  <div key={day.date} className="slot-row">
                    <span className="slot-lane">{day.date.slice(5)}</span>
                    <span className="slot-title">{day.slots.map((s) => s.title).join(" · ")}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="finish-btn" disabled={approving || seeded.length === 0} onClick={approveWeek}>
                {approving ? "Applying…" : "Approve week 1"}
              </button>
              {state === "error" && <p className="onb-copy">That didn&rsquo;t apply. Try again.</p>}
            </section>
          )}

          {step === 5 && (
            <section className="p-card">
              <span className="p-eyebrow">You&rsquo;re set</span>
              <p className="onb-copy">
                Goals are live and week 1 is on the calendar: {direction?.toLowerCase()}, {days}{" "}
                training days a week, a {calories ?? proposal} kcal day, and {seeded.length}{" "}
                favorites drafting your meals. Everything tunes as you log.
              </p>
              <a href="/today" className="finish-btn onb-done-link">
                Go to Today
              </a>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
