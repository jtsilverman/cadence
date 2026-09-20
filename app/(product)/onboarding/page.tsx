"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACTIVITIES,
  draftTwoWeeks,
  proposeCalories,
  type Activity,
  type OnboardingBasics,
  type OnboardingMeal,
} from "@/lib/onboarding-plan";
import { track } from "../../telemetry";

// Onboarding (ux.md: one conversation, tap-chips + a dictation-first seeding
// question, calorie target as an adjustable proposal — never a blank field —
// ending at the standard plan-proposal flow: week 1 drafted → approve).
// Real rails: seeding writes library recipes, the locked proposal writes
// GoalSet events, approving the draft posts the full week snapshot. The
// Future You simulator is designed but not built yet (ux.md DECISIONS).

const DIRECTIONS = [
  "Get leaner",
  "Maintain my weight",
  "Gain weight gradually",
  "Just eat like an adult",
] as const;

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function OnboardingPage() {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [seedText, setSeedText] = useState("");
  const [seeded, setSeeded] = useState<OnboardingMeal[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [sex, setSex] = useState<"m" | "f" | null>(null);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [units, setUnits] = useState<"imperial" | "metric">("imperial");
  const [restrictions, setRestrictions] = useState("");
  const [calories, setCalories] = useState<number | null>(null);
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const [approving, setApproving] = useState(false);

  const basics: OnboardingBasics | null = useMemo(() => {
    const w = Number(weight);
    const h = Number(height);
    const a = Number(age);
    if (!sex || !(w > 0) || !(h > 0) || !(a > 0)) return null;
    return {
      sex,
      weightLb: units === "metric" ? w * 2.20462 : w,
      heightIn: units === "metric" ? h / 2.54 : h,
      age: a,
    };
  }, [sex, weight, height, age, units]);

  const proposal = basics && direction && activity ? proposeCalories(basics, direction, activity) : null;

  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok || !data.profile) return;
        const p = data.profile as Record<string, string>;
        if (p.direction) setDirection(p.direction);
        if (ACTIVITIES.some(([key]) => key === p.activity)) setActivity(p.activity as Activity);
        if (p.seed_text) setSeedText(p.seed_text);
        if (p.seeded_meals) {
          try {
            const parsed = JSON.parse(p.seeded_meals);
            if (Array.isArray(parsed)) setSeeded(parsed);
          } catch {
            // A malformed optional draft never blocks restarting onboarding.
          }
        }
        if (p.sex === "m" || p.sex === "f") setSex(p.sex);
        if (p.weight) setWeight(p.weight);
        if (p.height) setHeight(p.height);
        if (p.age) setAge(p.age);
        if (p.units === "metric" || p.units === "imperial") setUnits(p.units);
        if (p.hard_restrictions) setRestrictions(p.hard_restrictions);
        if (p.calorie_proposal) setCalories(Number(p.calorie_proposal));
        if (p.onboarding_step) setStep(Math.min(5, Math.max(0, Number(p.onboarding_step) || 0)));
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  async function saveProgress(values: Record<string, string>, nextStep?: number) {
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: { ...values, ...(nextStep === undefined ? {} : { onboarding_step: String(nextStep) }) } }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.reason ?? "profile save failed");
    if (nextStep !== undefined) setStep(nextStep);
  }

  // funnel telemetry (charter Layer 4): one event per step reached
  useEffect(() => {
    if (!hydrated) return;
    const names = ["start", "activity", "seeding", "body_basics", "week_draft", "done"] as const;
    track("onboarding_step", { step: names[Math.min(step, 5)] });
  }, [hydrated, step]);

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
        await saveProgress({ seed_text: seedText, seeded_meals: JSON.stringify(data.meals) });
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
    setSeeding(false);
  }

  async function lockGoals() {
    if (!direction || !activity || !proposal || !restrictions.trim() || state === "busy") return;
    setState("busy");
    const target = calories ?? proposal;
    try {
      const posts = [
        { kind: "custom", title: direction },
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
      await saveProgress(
        {
          direction,
          activity,
          sex: sex!,
          weight,
          height,
          age,
          units,
          hard_restrictions: restrictions.trim(),
          calorie_proposal: String(target),
        },
        4,
      );
      track("onboarding_step", { step: "proposal_locked", calories: target });
      setState("open");
    } catch {
      setState("error");
    }
  }

  async function approveWeek() {
    if (approving || draft.length === 0) return;
    setApproving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: draft }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error();
      await saveProgress({}, 5);
      setState("done");
    } catch {
      setState("error");
    }
    setApproving(false);
  }

  const draft = seeded.length > 0 ? draftTwoWeeks(seeded, todayLocal(), restrictions) : [];

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Let&rsquo;s set you up</h1>
        <span className="shell-header-meta">{Math.min(step + 1, 5)} of 5</span>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {!hydrated && <div className="p-placeholder">Loading your setup…</div>}
          {hydrated && step === 0 && (
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
              <button
                type="button"
                className="finish-btn"
                disabled={!direction}
                onClick={() => void saveProgress({ direction: direction! }, 1).catch(() => setState("error"))}
              >
                Next
              </button>
            </section>
          )}

          {hydrated && step === 1 && (
            <section className="p-card">
              <span className="p-eyebrow">What does a normal week feel like?</span>
              <p className="onb-copy">This sets the first energy estimate. You can change it later.</p>
              <div className="chip-row">
                {ACTIVITIES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={activity === key ? "chip chip--on" : "chip"}
                    onClick={() => setActivity(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="finish-btn"
                disabled={!activity}
                onClick={() => void saveProgress({ activity: activity! }, 2).catch(() => setState("error"))}
              >
                Next
              </button>
            </section>
          )}

          {hydrated && step === 2 && (
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
                <button
                  type="button"
                  className="finish-btn"
                  onClick={() => void saveProgress({ seed_text: seedText, seeded_meals: JSON.stringify(seeded) }, 3).catch(() => setState("error"))}
                >
                  Next
                </button>
              )}
              {state === "error" && <p className="onb-copy">That didn&rsquo;t take. Try again.</p>}
            </section>
          )}

          {hydrated && step === 3 && (
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
              <div className="chip-row">
                {(["imperial", "metric"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={units === value ? "chip chip--on" : "chip"}
                    onClick={() => {
                      setUnits(value);
                      setWeight("");
                      setHeight("");
                      setCalories(null);
                    }}
                  >
                    {value === "imperial" ? "lb / inches" : "kg / cm"}
                  </button>
                ))}
              </div>
              <div className="onb-basics">
                <input className="set-input" placeholder={units === "metric" ? "kg" : "lb"} inputMode="decimal" aria-label={units === "metric" ? "Weight (kg)" : "Weight (lb)"} value={weight} onChange={(e) => setWeight(e.target.value)} />
                <input className="set-input" placeholder={units === "metric" ? "height cm" : "height in"} inputMode="decimal" aria-label={units === "metric" ? "Height (cm)" : "Height (inches)"} value={height} onChange={(e) => setHeight(e.target.value)} />
                <input className="set-input" placeholder="age" inputMode="numeric" aria-label="Age" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <label>
                Hard restrictions
                <textarea
                  className="set-input onb-seed-input"
                  rows={2}
                  aria-label="Hard food restrictions"
                  placeholder="For example: peanuts, shellfish, vegetarian. Write none if there are none."
                  value={restrictions}
                  onChange={(event) => setRestrictions(event.target.value)}
                />
              </label>
              {proposal && (
                <div className="onb-proposal">
                  <span className="p-eyebrow">Proposed</span>
                  <div className="onb-proposal-row">
                    <button type="button" className="day-nav-btn" aria-label="Lower" onClick={() => setCalories(Math.max(1200, (calories ?? proposal) - 50))}>
                      ‹
                    </button>
                    <strong className="onb-number">{calories ?? proposal} kcal</strong>
                    <button type="button" className="day-nav-btn" aria-label="Higher" onClick={() => setCalories((calories ?? proposal) + 50)}>
                      ›
                    </button>
                  </div>
                </div>
              )}
              <button type="button" className="finish-btn" disabled={!proposal || !restrictions.trim() || state === "busy"} onClick={lockGoals}>
                {state === "busy" ? "Saving…" : "Lock it in"}
              </button>
              {state === "error" && (
                <p className="onb-copy">That didn&rsquo;t save. Try again.</p>
              )}
            </section>
          )}

          {hydrated && step === 4 && (
            <section className="p-card">
              <span className="p-eyebrow">Your first two weeks, drafted</span>
              <p className="onb-copy">
                Fourteen Monday-start days from your favorites. Proposed, never imposed — approve it and it&rsquo;s
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
              {draft.length === 0 && (
                <div className="p-placeholder">None of the seeded meals satisfy your hard restrictions. Go back and add safe foods.</div>
              )}
              <button type="button" className="finish-btn" disabled={approving || draft.length === 0} onClick={approveWeek}>
                {approving ? "Applying…" : "Approve both weeks"}
              </button>
              {state === "error" && <p className="onb-copy">That didn&rsquo;t apply. Try again.</p>}
            </section>
          )}

          {hydrated && step === 5 && (
            <section className="p-card">
              <span className="p-eyebrow">You&rsquo;re set</span>
              <p className="onb-copy">
                Your nutrition goal is live and two weeks are on the calendar: {direction?.toLowerCase()}, a{" "}
                {calories ?? proposal} kcal proposal, and {seeded.length} favorites drafting your meals.
                Everything tunes as you log.
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
