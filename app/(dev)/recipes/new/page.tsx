"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RecipePlan, RecipeIngredient } from "@/lib/contracts";
import SourceVideo from "@/app/(dev)/source-video";

type Phase =
  | { name: "input" }
  | { name: "extracting" }
  | { name: "review"; plan: RecipePlan }
  | { name: "failed"; reason: string }
  | { name: "saving"; plan: RecipePlan }
  | { name: "saved"; title: string };

const low = { background: "#fff3cd", borderColor: "#e0a800" };

// useSearchParams needs a Suspense boundary in the App Router.
export default function NewRecipePage() {
  return (
    <Suspense>
      <NewRecipe />
    </Suspense>
  );
}

function NewRecipe() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "input" });
  const sharedUrl = useSearchParams().get("url");
  const autoStarted = useRef(false);

  // Shortcut bridge: /recipes/new?url=<shared> starts extraction on load.
  useEffect(() => {
    if (sharedUrl && !autoStarted.current) {
      autoStarted.current = true;
      setUrl(sharedUrl);
      extract(sharedUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl]);

  async function extract(target = url) {
    setPhase({ name: "extracting" });
    const res = await fetch("/api/recipes/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: target }),
    });
    const data = await res.json();
    if (data.ok) setPhase({ name: "review", plan: data.plan });
    else setPhase({ name: "failed", reason: data.reason });
  }

  async function extractPhoto(file: File) {
    setPhase({ name: "extracting" });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const res = await fetch("/api/recipes/extract-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64, media_type: file.type }),
    });
    const data = await res.json();
    if (data.ok) setPhase({ name: "review", plan: data.plan });
    else setPhase({ name: "failed", reason: data.reason });
  }

  async function save(plan: RecipePlan) {
    setPhase({ name: "saving", plan });
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: plan.title,
        servings: plan.servings,
        total_minutes: plan.total_minutes,
        ingredients: plan.ingredients,
        steps: plan.steps,
        confidence: plan.confidence,
        source_url: plan.source_url,
        source_embed: plan.source_embed,
      }),
    });
    const data = await res.json();
    if (data.ok) setPhase({ name: "saved", title: plan.title });
    else setPhase({ name: "failed", reason: data.reason ?? "save failed" });
  }

  return (
    <div>
      <h1>Add a recipe</h1>

      {(phase.name === "input" || phase.name === "extracting" || phase.name === "failed") && (
        <div>
          <input
            style={{ width: "70%", padding: 8 }}
            placeholder="Paste a recipe URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            style={{ padding: 8, marginLeft: 8 }}
            onClick={() => extract()}
            disabled={phase.name === "extracting"}
          >
            {phase.name === "extracting" ? "Extracting…" : "Extract"}
          </button>
          <p style={{ color: "#666", margin: "12px 0 4px" }}>
            …or photograph a cookbook page:
          </p>
          <input
            type="file"
            accept="image/*"
            disabled={phase.name === "extracting"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) extractPhoto(file);
            }}
          />
          {phase.name === "failed" && (
            <p style={{ color: "#b02a37" }}>Couldn&apos;t extract: {phase.reason}</p>
          )}
        </div>
      )}

      {(phase.name === "review" || phase.name === "saving") && (
        <ReviewForm
          plan={phase.plan}
          saving={phase.name === "saving"}
          onSave={save}
        />
      )}

      {phase.name === "saved" && (
        <p>
          Saved <strong>{phase.title}</strong> to your cookbook.{" "}
          <button onClick={() => { setUrl(""); setPhase({ name: "input" }); }}>
            Add another
          </button>{" "}
          or <a href="/week">plan it into your week</a>.
        </p>
      )}
    </div>
  );
}

function ReviewForm({
  plan: initial,
  saving,
  onSave,
}: {
  plan: RecipePlan;
  saving: boolean;
  onSave: (plan: RecipePlan) => void;
}) {
  const [plan, setPlan] = useState(initial);

  const setIngredient = (i: number, patch: Partial<RecipeIngredient>) =>
    setPlan({
      ...plan,
      ingredients: plan.ingredients.map((ing, j) =>
        j === i ? { ...ing, ...patch } : ing
      ),
    });

  return (
    <div>
      <p style={{ color: "#666" }}>
        Review before saving — <mark style={low}>highlighted</mark> fields are
        low-confidence guesses.
      </p>

      {plan.source_embed && (
        <div style={{ marginBottom: 12 }}>
          <SourceVideo embed={plan.source_embed} />
        </div>
      )}

      <label>
        Title{" "}
        <input
          style={{ width: "100%", padding: 6, ...(plan.confidence.title === "low" ? low : {}) }}
          value={plan.title}
          onChange={(e) => setPlan({ ...plan, title: e.target.value })}
        />
      </label>

      <div style={{ display: "flex", gap: 16, margin: "8px 0" }}>
        <label>
          Servings{" "}
          <input
            type="number"
            style={{ width: 80, padding: 6, ...(plan.confidence.servings === "low" ? low : {}) }}
            value={plan.servings ?? ""}
            onChange={(e) =>
              setPlan({ ...plan, servings: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </label>
        <label>
          Minutes{" "}
          <input
            type="number"
            style={{ width: 80, padding: 6, ...(plan.confidence.total_minutes === "low" ? low : {}) }}
            value={plan.total_minutes ?? ""}
            onChange={(e) =>
              setPlan({ ...plan, total_minutes: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </label>
      </div>

      <h3>Ingredients</h3>
      {plan.ingredients.map((ing, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <input
            style={{ width: 70, padding: 6, ...(ing.confidence === "low" ? low : {}) }}
            type="number"
            step="any"
            value={ing.qty ?? ""}
            onChange={(e) =>
              setIngredient(i, { qty: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <input
            style={{ width: 100, padding: 6, ...(ing.confidence === "low" ? low : {}) }}
            value={ing.unit ?? ""}
            placeholder="unit"
            onChange={(e) => setIngredient(i, { unit: e.target.value || null })}
          />
          <input
            style={{ flex: 1, padding: 6, ...(ing.confidence === "low" ? low : {}) }}
            value={ing.name}
            onChange={(e) => setIngredient(i, { name: e.target.value })}
          />
          <button
            onClick={() =>
              setPlan({ ...plan, ingredients: plan.ingredients.filter((_, j) => j !== i) })
            }
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          setPlan({
            ...plan,
            ingredients: [
              ...plan.ingredients,
              { name: "", qty: null, unit: null, confidence: "high" },
            ],
          })
        }
      >
        + ingredient
      </button>

      <h3>Steps</h3>
      <ol>
        {plan.steps.map((step, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            <textarea
              style={{ width: "100%", padding: 6 }}
              rows={2}
              value={step}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  steps: plan.steps.map((s, j) => (j === i ? e.target.value : s)),
                })
              }
            />
          </li>
        ))}
      </ol>

      <button
        style={{ padding: "10px 24px", fontSize: 16 }}
        disabled={saving}
        onClick={() => onSave(plan)}
      >
        {saving ? "Saving…" : "Save to library"}
      </button>
    </div>
  );
}
