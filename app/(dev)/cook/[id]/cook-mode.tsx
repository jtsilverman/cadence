"use client";

import { useState } from "react";
import type { RecipePlan } from "@/lib/contracts";
import SourceVideo from "@/app/(dev)/source-video";

type Phase =
  | { name: "ingredients" }
  | { name: "step"; index: number }
  | { name: "logging" }
  | { name: "done" }
  | { name: "failed"; reason: string };

// Cook mode: big type, one step at a time (UX journey 4). Timers are P2.
export default function CookMode({
  libraryId,
  plan,
}: {
  libraryId: string;
  plan: RecipePlan;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "ingredients" });

  async function madeIt() {
    setPhase({ name: "logging" });
    const res = await fetch("/api/cook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library_id: libraryId }),
    });
    const data = await res.json();
    if (data.ok) setPhase({ name: "done" });
    else setPhase({ name: "failed", reason: data.reason });
  }

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>{plan.title}</h1>

      {phase.name === "ingredients" && (
        <>
          <h2>Ingredients</h2>
          <ul style={{ fontSize: 20, lineHeight: 1.7 }}>
            {plan.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.qty !== null ? `${ing.qty} ` : ""}
                {ing.unit ? `${ing.unit} ` : ""}
                {ing.name}
              </li>
            ))}
          </ul>
          <button
            style={{ padding: "14px 32px", fontSize: 20 }}
            onClick={() => setPhase({ name: "step", index: 0 })}
          >
            Start cooking →
          </button>
          {plan.source_embed && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: "#666" }}>Cook along with the original:</p>
              <SourceVideo embed={plan.source_embed} />
            </div>
          )}
        </>
      )}

      {phase.name === "step" && (
        <>
          <p style={{ color: "#666" }}>
            Step {phase.index + 1} of {plan.steps.length}
          </p>
          <p style={{ fontSize: 32, lineHeight: 1.5, minHeight: 160 }}>
            {plan.steps[phase.index]}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            {phase.index > 0 && (
              <button
                style={{ padding: "14px 24px", fontSize: 18 }}
                onClick={() => setPhase({ name: "step", index: phase.index - 1 })}
              >
                ← Back
              </button>
            )}
            {phase.index < plan.steps.length - 1 ? (
              <button
                style={{ padding: "14px 32px", fontSize: 20 }}
                onClick={() => setPhase({ name: "step", index: phase.index + 1 })}
              >
                Next →
              </button>
            ) : (
              <button style={{ padding: "14px 32px", fontSize: 20 }} onClick={madeIt}>
                I made this ✓
              </button>
            )}
          </div>
        </>
      )}

      {phase.name === "logging" && <p style={{ fontSize: 20 }}>Logging the cook…</p>}

      {phase.name === "done" && (
        <>
          <p style={{ fontSize: 24 }}>Logged — pantry adjusted.</p>
          <a href="/nutrition">← back to Nutrition</a>
        </>
      )}

      {phase.name === "failed" && (
        <p style={{ color: "#b02a37" }}>Couldn&apos;t log the cook: {phase.reason}</p>
      )}
    </div>
  );
}
