"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FoodKind, RecipeIngredient, RecipePlan } from "@/lib/contracts";
import SourceVideo from "@/app/(dev)/source-video";

type Phase =
  | { name: "input" }
  | { name: "working" }
  | { name: "review"; plan: RecipePlan }
  | { name: "saving"; plan: RecipePlan }
  | { name: "food"; kind: Exclude<FoodKind, "recipe"> }
  | { name: "saved"; title: string; libraryId: string; cookable: boolean }
  | { name: "failed"; reason: string };

const blankRecipe = (): RecipePlan => ({
  plan_version: 1,
  kind: "recipe",
  title: "",
  servings: 1,
  total_minutes: null,
  ingredients: [{ name: "", qty: null, unit: null, confidence: "high" }],
  steps: [""],
  source_url: "manual",
  confidence: { title: "high", servings: "high", total_minutes: "high" },
});

const NON_RECIPE_KINDS = [
  { kind: "ingredient", label: "Ingredient" },
  { kind: "product", label: "Packaged product" },
  { kind: "snack", label: "Snack" },
  { kind: "meal", label: "Meal" },
] as const;

export default function AddFoodPage() {
  return (
    <Suspense>
      <AddFood />
    </Suspense>
  );
}

function AddFood() {
  const [url, setUrl] = useState("");
  const [wish, setWish] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "input" });
  const sharedUrl = useSearchParams().get("url");
  const autoStarted = useRef(false);

  useEffect(() => {
    if (sharedUrl && !autoStarted.current) {
      autoStarted.current = true;
      setUrl(sharedUrl);
      void extractUrl(sharedUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl]);

  async function extractUrl(target = url) {
    if (!target.trim()) return;
    setPhase({ name: "working" });
    try {
      const response = await fetch("/api/recipes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.trim() }),
      });
      const data = await response.json();
      if (data.ok && data.plan?.kind === "recipe") setPhase({ name: "review", plan: data.plan });
      else setPhase({ name: "failed", reason: data.reason ?? "That source is not a recipe." });
    } catch {
      setPhase({ name: "failed", reason: "The recipe could not be read." });
    }
  }

  async function extractPhoto(file: File) {
    setPhase({ name: "working" });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/recipes/extract-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
          media_type: file.type,
        }),
      });
      const data = await response.json();
      if (data.ok && data.plan?.kind === "recipe") setPhase({ name: "review", plan: data.plan });
      else setPhase({ name: "failed", reason: data.reason ?? "That photo is not a recipe." });
    } catch {
      setPhase({ name: "failed", reason: "The photo could not be read." });
    }
  }

  async function invent() {
    if (!wish.trim()) return;
    setPhase({ name: "working" });
    try {
      const response = await fetch("/api/foods/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wish: wish.trim() }),
      });
      const data = await response.json();
      if (data.ok && data.plan?.kind === "recipe") {
        setPhase({ name: "review", plan: data.plan });
      } else {
        setPhase({ name: "failed", reason: data.reason ?? "A safe recipe could not be invented." });
      }
    } catch {
      setPhase({ name: "failed", reason: "A recipe could not be invented." });
    }
  }

  async function save(plan: RecipePlan) {
    setPhase({ name: "saving", plan });
    try {
      const response = await fetch("/api/recipes", {
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
          nutrition: plan.nutrition,
        }),
      });
      const data = await response.json();
      if (data.ok)
        setPhase({ name: "saved", title: plan.title, libraryId: data.library_id, cookable: true });
      else setPhase({ name: "failed", reason: data.reason ?? "The recipe could not be saved." });
    } catch {
      setPhase({ name: "failed", reason: "The recipe could not be saved." });
    }
  }

  // The four non-recipe kinds share one gate and one route; only the form
  // fields differ, so the save path here stays kind-agnostic.
  async function saveFood(body: Record<string, unknown>, title: string) {
    try {
      const response = await fetch("/api/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.ok)
        setPhase({ name: "saved", title, libraryId: data.library_id, cookable: false });
      else setPhase({ name: "failed", reason: data.reason ?? "That food could not be saved." });
    } catch {
      setPhase({ name: "failed", reason: "That food could not be saved." });
    }
  }

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Add food</h1>
        <a href="/nutrition" className="shell-header-meta">Nutrition</a>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {(phase.name === "input" || phase.name === "working" || phase.name === "failed") && (
            <section className="p-card p-stack">
              <span className="p-eyebrow">Recipe link or video</span>
              <input
                className="set-input"
                aria-label="Recipe URL"
                placeholder="Paste a recipe, TikTok, or YouTube URL"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <button className="finish-btn" type="button" disabled={phase.name === "working" || !url.trim()} onClick={() => void extractUrl()}>
                {phase.name === "working" ? "Reading…" : "Import link"}
              </button>
              <label className="finish-btn">
                Import a photo
                <input
                  className="g-input-hidden"
                  type="file"
                  accept="image/*"
                  disabled={phase.name === "working"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void extractPhoto(file);
                  }}
                />
              </label>
              <button className="chip" type="button" disabled={phase.name === "working"} onClick={() => setPhase({ name: "review", plan: blankRecipe() })}>
                Enter a recipe manually
              </button>
              <span className="p-eyebrow">Invent from your foods</span>
              <input
                className="set-input"
                aria-label="What should Cadence invent?"
                placeholder="Something warm with chicken and rice"
                value={wish}
                onChange={(event) => setWish(event.target.value)}
              />
              <button className="chip" type="button" disabled={phase.name === "working" || !wish.trim()} onClick={() => void invent()}>
                {phase.name === "working" ? "Inventing…" : "Invent a recipe"}
              </button>
              <span className="p-eyebrow">Or save food you don&rsquo;t cook</span>
              <div className="chip-row">
                {NON_RECIPE_KINDS.map(({ kind, label }) => (
                  <button
                    key={kind}
                    className="chip"
                    type="button"
                    disabled={phase.name === "working"}
                    onClick={() => setPhase({ name: "food", kind })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {phase.name === "failed" && <p role="alert">{phase.reason}</p>}
            </section>
          )}

          {phase.name === "food" && (
            <FoodForm
              kind={phase.kind}
              onCancel={() => setPhase({ name: "input" })}
              onSave={(body, title) => void saveFood(body, title)}
            />
          )}

          {(phase.name === "review" || phase.name === "saving") && (
            <RecipeReview
              initial={phase.plan}
              saving={phase.name === "saving"}
              onCancel={() => setPhase({ name: "input" })}
              onSave={(plan) => void save(plan)}
            />
          )}

          {phase.name === "saved" && (
            <section className="p-card p-stack">
              <span className="p-eyebrow">Saved</span>
              <strong>{phase.title}</strong>
              {phase.cookable && (
                <a className="finish-btn" href={`/nutrition/cook/${phase.libraryId}`}>Open cook mode</a>
              )}
              <a className="chip" href="/nutrition">Return to Nutrition</a>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

function RecipeReview({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: RecipePlan;
  saving: boolean;
  onSave: (plan: RecipePlan) => void;
  onCancel: () => void;
}) {
  const [plan, setPlan] = useState(initial);
  const ingredient = (index: number, patch: Partial<RecipeIngredient>) =>
    setPlan({
      ...plan,
      ingredients: plan.ingredients.map((item, i) => i === index ? { ...item, ...patch } : item),
    });

  return (
    <section className="p-card p-stack">
      <span className="p-eyebrow">Review before saving</span>
      {plan.source_embed && <SourceVideo embed={plan.source_embed} />}
      <label>Title<input className="set-input" value={plan.title} onChange={(event) => setPlan({ ...plan, title: event.target.value })} /></label>
      <div className="onb-basics">
        <label>Servings<input className="set-input" type="number" min="1" value={plan.servings ?? ""} onChange={(event) => setPlan({ ...plan, servings: event.target.value ? Number(event.target.value) : null })} /></label>
        <label>Minutes<input className="set-input" type="number" min="0" value={plan.total_minutes ?? ""} onChange={(event) => setPlan({ ...plan, total_minutes: event.target.value ? Number(event.target.value) : null })} /></label>
      </div>
      <span className="p-eyebrow">Ingredients</span>
      {plan.ingredients.map((item, index) => (
        <div className="onb-basics" key={index}>
          <input className="set-input" aria-label={`Ingredient ${index + 1} quantity`} type="number" step="any" value={item.qty ?? ""} onChange={(event) => ingredient(index, { qty: event.target.value ? Number(event.target.value) : null })} />
          <input className="set-input" aria-label={`Ingredient ${index + 1} unit`} placeholder="unit" value={item.unit ?? ""} onChange={(event) => ingredient(index, { unit: event.target.value || null })} />
          <input className="set-input" aria-label={`Ingredient ${index + 1} name`} placeholder="ingredient" value={item.name} onChange={(event) => ingredient(index, { name: event.target.value })} />
          <button className="chip" type="button" onClick={() => setPlan({ ...plan, ingredients: plan.ingredients.filter((_, i) => i !== index) })}>Remove</button>
        </div>
      ))}
      <button className="chip" type="button" onClick={() => setPlan({ ...plan, ingredients: [...plan.ingredients, { name: "", qty: null, unit: null, confidence: "high" }] })}>Add ingredient</button>
      <span className="p-eyebrow">Steps</span>
      {plan.steps.map((step, index) => (
        <textarea key={index} className="set-input" aria-label={`Step ${index + 1}`} value={step} onChange={(event) => setPlan({ ...plan, steps: plan.steps.map((value, i) => i === index ? event.target.value : value) })} />
      ))}
      <button className="chip" type="button" onClick={() => setPlan({ ...plan, steps: [...plan.steps, ""] })}>Add step</button>
      <button className="finish-btn" type="button" disabled={saving || !plan.title.trim() || !plan.ingredients.some((item) => item.name.trim()) || !plan.steps.some((step) => step.trim())} onClick={() => onSave(plan)}>
        {saving ? "Saving…" : "Save to library"}
      </button>
      <button className="chip" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    </section>
  );
}

// Manual entry for the four kinds Jake doesn't cook. Macros are optional
// everywhere: a blank block saves as unknown rather than as zeros, so the
// day's total never gains calories the app invented. The basis selector is
// visible because a label number and a per-100g number are not the same fact.
function FoodForm({
  kind,
  onSave,
  onCancel,
}: {
  kind: "ingredient" | "product" | "snack" | "meal";
  onSave: (body: Record<string, unknown>, title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("g");
  const [brand, setBrand] = useState("");
  const [upc, setUpc] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [servings, setServings] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [macros, setMacros] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  const [basis, setBasis] = useState<"per_serving" | "per_100g">(
    kind === "ingredient" ? "per_100g" : "per_serving"
  );
  const [components, setComponents] = useState<Array<{ library_id: string; servings: string }>>([]);
  const [candidates, setCandidates] = useState<Array<{ id: string; title: string }>>([]);
  const [saving, setSaving] = useState(false);

  // A meal is assembled from rows that already exist, so the picker is the
  // library itself rather than free text — that keeps a plate's macros tied
  // to its parts instead of duplicating them.
  useEffect(() => {
    if (kind !== "meal") return;
    fetch("/api/foods")
      .then((response) => response.json())
      .then((data) => setCandidates(data.foods ?? []))
      .catch(() => setCandidates([]));
  }, [kind]);

  const macroEntries = Object.values(macros);
  const macrosStarted = macroEntries.some((value) => value.trim() !== "");
  const macrosComplete = macroEntries.every((value) => value.trim() !== "");

  function submit() {
    setSaving(true);
    const body: Record<string, unknown> = { kind, title: title.trim() };
    if (sourceUrl.trim()) body.source_url = sourceUrl.trim();
    if (kind === "ingredient") body.unit = unit.trim();
    if (kind === "product") {
      body.brand = brand;
      body.upc = upc;
      body.serving_size = servingSize;
    }
    if (kind === "snack") body.servings = servings;
    if (kind === "meal") {
      body.components = components
        .filter((row) => row.library_id && row.servings)
        .map((row) => ({ library_id: row.library_id, servings: Number(row.servings) }));
    }
    if (macrosComplete) {
      body.nutrition = {
        calories: Number(macros.calories),
        protein_g: Number(macros.protein_g),
        carbs_g: Number(macros.carbs_g),
        fat_g: Number(macros.fat_g),
        basis,
        confidence: "low",
      };
    }
    onSave(body, title.trim());
  }

  const ready =
    title.trim() !== "" &&
    (kind !== "ingredient" || unit.trim() !== "") &&
    (kind !== "meal" || components.some((row) => row.library_id && row.servings)) &&
    (!macrosStarted || macrosComplete);

  return (
    <section className="p-card p-stack">
      <span className="p-eyebrow">New {kind}</span>
      <label>Name<input className="set-input" aria-label="Name" value={title} onChange={(event) => setTitle(event.target.value)} /></label>

      {kind === "ingredient" && (
        <label>Counted in<input className="set-input" aria-label="Unit" placeholder="g, ml, each" value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
      )}

      {kind === "product" && (
        <>
          <label>Brand<input className="set-input" aria-label="Brand" value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
          <label>Barcode<input className="set-input" aria-label="Barcode" inputMode="numeric" placeholder="8-14 digits" value={upc} onChange={(event) => setUpc(event.target.value)} /></label>
          <label>Serving size<input className="set-input" aria-label="Serving size" placeholder="as printed on the label" value={servingSize} onChange={(event) => setServingSize(event.target.value)} /></label>
        </>
      )}

      {kind === "snack" && (
        <label>Servings<input className="set-input" aria-label="Servings" type="number" min="0" step="any" value={servings} onChange={(event) => setServings(event.target.value)} /></label>
      )}

      {kind === "meal" && (
        <>
          <span className="p-eyebrow">What&rsquo;s on the plate</span>
          {candidates.length === 0 && (
            <p className="p-placeholder">Save an ingredient, product, snack, or recipe first — a meal is built from them.</p>
          )}
          {components.map((row, index) => (
            <div className="onb-basics" key={index}>
              <select
                className="set-input"
                aria-label={`Component ${index + 1}`}
                value={row.library_id}
                onChange={(event) => setComponents(components.map((item, i) => i === index ? { ...item, library_id: event.target.value } : item))}
              >
                <option value="">Choose…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
                ))}
              </select>
              <input
                className="set-input"
                aria-label={`Component ${index + 1} servings`}
                type="number"
                min="0"
                step="any"
                value={row.servings}
                onChange={(event) => setComponents(components.map((item, i) => i === index ? { ...item, servings: event.target.value } : item))}
              />
              <button className="chip" type="button" onClick={() => setComponents(components.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
          <button className="chip" type="button" disabled={candidates.length === 0} onClick={() => setComponents([...components, { library_id: "", servings: "1" }])}>Add component</button>
        </>
      )}

      <label>Source link<input className="set-input" aria-label="Source link" placeholder="optional" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>

      <span className="p-eyebrow">Macros (optional — leave blank if unknown)</span>
      <div className="onb-basics">
        <input className="set-input" aria-label="Calories" type="number" min="0" step="any" placeholder="kcal" value={macros.calories} onChange={(event) => setMacros({ ...macros, calories: event.target.value })} />
        <input className="set-input" aria-label="Protein grams" type="number" min="0" step="any" placeholder="protein g" value={macros.protein_g} onChange={(event) => setMacros({ ...macros, protein_g: event.target.value })} />
        <input className="set-input" aria-label="Carb grams" type="number" min="0" step="any" placeholder="carbs g" value={macros.carbs_g} onChange={(event) => setMacros({ ...macros, carbs_g: event.target.value })} />
        <input className="set-input" aria-label="Fat grams" type="number" min="0" step="any" placeholder="fat g" value={macros.fat_g} onChange={(event) => setMacros({ ...macros, fat_g: event.target.value })} />
      </div>
      <label>
        Those numbers are
        <select className="set-input" aria-label="Macro basis" value={basis} onChange={(event) => setBasis(event.target.value as "per_serving" | "per_100g")}>
          <option value="per_serving">per serving</option>
          <option value="per_100g">per 100g</option>
        </select>
      </label>
      {macrosStarted && !macrosComplete && (
        <p role="alert">Fill in all four macros or clear them — a partial block would be saved as unknown.</p>
      )}

      <button className="finish-btn" type="button" disabled={saving || !ready} onClick={submit}>
        {saving ? "Saving…" : "Save to library"}
      </button>
      <button className="chip" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    </section>
  );
}
