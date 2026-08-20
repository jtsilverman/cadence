"use client";

import { useEffect, useState } from "react";
import type { CartLine } from "@/lib/cart";
import type { LineItem } from "@/lib/contracts";
import type { RecipeSummary } from "@/lib/library";
import type { PrefRow } from "@/lib/prefs";
import type { OrderSummary } from "@/lib/rails";

// Prefs joined onto lines by normalized name (the same key the fold uses).
type PrefMap = Record<string, PrefRow>;
const prefKey = (name: string) => name.trim().toLowerCase();
const prefText = (p: PrefRow | undefined) =>
  p ? [p.brand, p.size, p.note].filter(Boolean).join(" · ") : "";

function usePrefs(): [PrefMap, (p: PrefRow[]) => void] {
  const [prefs, setPrefs] = useState<PrefMap>({});
  const apply = (rows: PrefRow[]) =>
    setPrefs(Object.fromEntries(rows.map((r) => [r.name, r])));
  useEffect(() => {
    fetch("/api/prefs")
      .then((res) => res.json())
      .then((data) => data.ok && apply(data.prefs))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [prefs, apply];
}

// Inline editor for one ingredient's stated preference (brand/size/note).
function PrefEditor({
  name,
  pref,
  onSaved,
  onClose,
}: {
  name: string;
  pref: PrefRow | undefined;
  onSaved: (rows: PrefRow[]) => void;
  onClose: () => void;
}) {
  const [brand, setBrand] = useState(pref?.brand ?? "");
  const [size, setSize] = useState(pref?.size ?? "");
  const [note, setNote] = useState(pref?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch("/api/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        brand: brand.trim() || null,
        size: size.trim() || null,
        note: note.trim() || null,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      onSaved(data.prefs);
      onClose();
    } else setError(data.reason);
  }

  return (
    <div style={{ display: "flex", gap: 6, margin: "4px 0 8px 24px", alignItems: "center" }}>
      <input
        style={{ width: 130, padding: 4 }}
        placeholder="brand"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
      />
      <input
        style={{ width: 110, padding: 4 }}
        placeholder="size"
        value={size}
        onChange={(e) => setSize(e.target.value)}
      />
      <input
        style={{ flex: 1, padding: 4 }}
        placeholder="note (e.g. unsalted ok)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button onClick={save}>Save</button>
      <button onClick={onClose}>✕</button>
      {error && <span style={{ color: "#b02a37" }}>{error}</span>}
    </div>
  );
}

type ListSuggestion = {
  suggestion_id: string;
  name: string;
  qty: number | null;
  unit: string | null;
  reason: string;
};

type Phase =
  | { name: "picking" }
  | { name: "building" }
  | {
      name: "list";
      toBuy: CartLine[];
      stocked: CartLine[];
      rails: string[];
      suggestions: ListSuggestion[];
    }
  | { name: "run"; orderId: string; items: LineItem[] };

// Run checkoff state lives in the browser until "Done shopping" writes the
// one batch event — reload-safe via localStorage, keyed by the run's order id.
const runKey = (orderId: string) => `cadence-run:${orderId}`;

function loadChecked(orderId: string): Set<number> {
  try {
    const raw = localStorage.getItem(runKey(orderId));
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveChecked(orderId: string, checked: Set<number>) {
  try {
    localStorage.setItem(runKey(orderId), JSON.stringify([...checked]));
  } catch {
    // storage full/blocked: checks still work for this page's lifetime
  }
}

export default function WeekPage() {
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>({ name: "picking" });
  const [error, setError] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<OrderSummary | null>(null);

  useEffect(() => {
    fetch("/api/recipes")
      .then((res) => res.json())
      .then((data) => (data.ok ? setRecipes(data.recipes) : setError(data.reason)))
      .catch((e) => setError(String(e)));
    // Abandoned-run banner: the latest unsettled instore run, if any.
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) return;
        const open = (data.orders as OrderSummary[]).find(
          (o) => o.rail === "instore" && !o.settled
        );
        if (open) setOpenRun(open);
      })
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function buildList() {
    setPhase({ name: "building" });
    setError(null);
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library_ids: [...picked] }),
    });
    const data = await res.json();
    if (data.ok)
      setPhase({
        name: "list",
        toBuy: data.toBuy,
        stocked: data.stocked,
        rails: data.rails,
        suggestions: data.suggestions,
      });
    else {
      setError(data.reason);
      setPhase({ name: "picking" });
    }
  }

  if (phase.name === "run") {
    return (
      <RunScreen
        orderId={phase.orderId}
        items={phase.items}
        onDone={() => {
          setOpenRun(null);
          setPhase({ name: "picking" });
        }}
      />
    );
  }

  return (
    <div>
      <h1>This week</h1>

      {openRun && phase.name === "picking" && (
        <div style={{ padding: 12, background: "#fff8e1", border: "1px solid #f0e0a0", marginBottom: 16 }}>
          Finish your store run? {loadChecked(openRun.event_id).size} of {openRun.items.length}{" "}
          items checked.{" "}
          <button
            onClick={() => setPhase({ name: "run", orderId: openRun.event_id, items: openRun.items })}
          >
            Review &amp; finish
          </button>
        </div>
      )}

      {phase.name !== "list" && (
        <>
          <p style={{ color: "#666" }}>Pick the recipes you&apos;re cooking this week.</p>
          {error && <p style={{ color: "#b02a37" }}>{error}</p>}
          {recipes === null && !error && <p>Loading…</p>}
          {recipes?.length === 0 && (
            <p>
              No saved recipes yet — <a href="/recipes/new">add one</a>.
            </p>
          )}
          {recipes?.map((r) => (
            <label key={r.id} style={{ display: "block", padding: 6 }}>
              <input
                type="checkbox"
                checked={picked.has(r.id)}
                onChange={() => toggle(r.id)}
              />{" "}
              {r.title}
            </label>
          ))}
          <button
            style={{ padding: "10px 24px", fontSize: 16, marginTop: 12 }}
            disabled={picked.size === 0 || phase.name === "building"}
            onClick={buildList}
          >
            {phase.name === "building" ? "Building…" : "Build shopping list"}
          </button>
        </>
      )}

      {phase.name === "list" && (
        <ShoppingList
          initial={phase.toBuy}
          stocked={phase.stocked}
          rails={phase.rails}
          suggestions={phase.suggestions}
          onBack={() => setPhase({ name: "picking" })}
          onRunStarted={(orderId, items) => setPhase({ name: "run", orderId, items })}
        />
      )}
    </div>
  );
}

// One store run: toggle checks freely (localStorage-backed), one batch event
// at Done. No per-check writes — un-check is free until you commit.
function RunScreen({
  orderId,
  items,
  onDone,
}: {
  orderId: string;
  items: LineItem[];
  onDone: () => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => loadChecked(orderId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [prefs, applyPrefs] = usePrefs();
  const [editingPref, setEditingPref] = useState<number | null>(null);

  function toggle(i: number) {
    const next = new Set(checked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setChecked(next);
    saveChecked(orderId, next);
  }

  function gotEverything() {
    const all = new Set(items.map((_, i) => i));
    setChecked(all);
    saveChecked(orderId, all);
  }

  async function done() {
    setSaving(true);
    setError(null);
    const bought = items.filter((_, i) => checked.has(i));
    const res = await fetch("/api/pantry/inflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: bought, via: "checkoff", order_event_id: orderId }),
    });
    const data = await res.json();
    if (data.ok) {
      try {
        localStorage.removeItem(runKey(orderId));
      } catch {}
      setFinished(true);
    } else {
      setError(data.reason);
      setSaving(false);
    }
  }

  if (finished) {
    return (
      <div>
        <h2>Run recorded 🎉</h2>
        <p>
          {checked.size} of {items.length} items in — <a href="/pantry">pantry is up to date</a>
          {checked.size < items.length ? "; skipped items stay on the order record" : ""}.
        </p>
        <button onClick={onDone}>Back to this week</button>
      </div>
    );
  }

  return (
    <div>
      <h2>In the store</h2>
      <p style={{ color: "#666" }}>
        Check items as you grab them — nothing is saved until &ldquo;Done shopping&rdquo;.
      </p>
      {error && <p style={{ color: "#b02a37" }}>{error}</p>}
      {items.map((item, i) => (
        <div key={i}>
          <label style={{ display: "block", padding: 8, fontSize: 18 }}>
            <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />{" "}
            <span style={{ textDecoration: checked.has(i) ? "line-through" : "none" }}>
              {item.qty !== null ? `${item.qty} ` : ""}
              {item.unit ? `${item.unit} ` : ""}
              {item.name}
            </span>
            {prefText(prefs[prefKey(item.name)]) && (
              <span style={{ color: "#2a5db0", fontSize: 13, marginLeft: 8 }}>
                {prefText(prefs[prefKey(item.name)])}
              </span>
            )}{" "}
            <button
              style={{ fontSize: 12 }}
              onClick={(e) => {
                e.preventDefault();
                setEditingPref(editingPref === i ? null : i);
              }}
            >
              pref
            </button>
          </label>
          {editingPref === i && (
            <PrefEditor
              name={item.name}
              pref={prefs[prefKey(item.name)]}
              onSaved={applyPrefs}
              onClose={() => setEditingPref(null)}
            />
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={gotEverything} disabled={checked.size === items.length}>
          Got everything
        </button>
        <button
          style={{ padding: "10px 24px", fontSize: 16 }}
          disabled={checked.size === 0 || saving}
          onClick={done}
        >
          {saving ? "Recording…" : `Done shopping (${checked.size}/${items.length})`}
        </button>
      </div>
    </div>
  );
}

type ExecuteMode =
  | { name: "editing" }
  | { name: "ordering" }
  | { name: "ordered"; url: string }
  | { name: "orderFailed"; reason: string };

function ShoppingList({
  initial,
  stocked,
  rails,
  suggestions,
  onBack,
  onRunStarted,
}: {
  initial: CartLine[];
  stocked: CartLine[];
  rails: string[];
  suggestions: ListSuggestion[];
  onBack: () => void;
  onRunStarted: (orderId: string, items: LineItem[]) => void;
}) {
  const [lines, setLines] = useState(initial);
  const [mode, setMode] = useState<ExecuteMode>({ name: "editing" });
  const [prefs, applyPrefs] = usePrefs();
  const [editingPref, setEditingPref] = useState<number | null>(null);
  const [open, setOpen] = useState(suggestions);

  // Suggest-only: accepting adds a line; the resolution is logged either way.
  async function resolveSuggestion(s: ListSuggestion, outcome: "accepted" | "dismissed") {
    setOpen(open.filter((o) => o.suggestion_id !== s.suggestion_id));
    if (outcome === "accepted")
      setLines([...lines, { name: s.name, qty: s.qty, unit: s.unit, sources: [] }]);
    fetch("/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestion_id: s.suggestion_id, outcome }),
    }).catch(() => {});
  }

  const setLine = (i: number, patch: Partial<CartLine>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const toItems = (ls: CartLine[]): LineItem[] =>
    ls
      .filter((l) => l.name.trim())
      .map((l) => ({ name: l.name.trim(), qty: l.qty, unit: l.unit }));

  async function order() {
    setMode({ name: "ordering" });
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: toItems(lines), rail: "instacart" }),
    });
    const data = await res.json();
    if (data.ok) {
      window.open(data.url, "_blank");
      setMode({ name: "ordered", url: data.url });
    } else setMode({ name: "orderFailed", reason: data.reason });
  }

  async function startRun() {
    const items = toItems(lines);
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, rail: "instore" }),
    });
    const data = await res.json();
    if (data.ok) onRunStarted(data.order_event_id, items);
    else setMode({ name: "orderFailed", reason: data.reason });
  }

  return (
    <div>
      <button onClick={onBack}>← change recipes</button>
      <h2>Shopping list</h2>
      {open.map((s) => (
        <div
          key={s.suggestion_id}
          style={{ padding: 8, background: "#eef6ee", border: "1px solid #cfe6cf", marginBottom: 6 }}
        >
          Suggested: {s.qty !== null ? `${s.qty} ` : ""}
          {s.unit ? `${s.unit} ` : ""}
          <strong>{s.name}</strong>{" "}
          <span style={{ color: "#666" }}>— {s.reason}</span>{" "}
          <button onClick={() => resolveSuggestion(s, "accepted")}>Add</button>{" "}
          <button onClick={() => resolveSuggestion(s, "dismissed")}>✕</button>
        </div>
      ))}
      {lines.length === 0 && <p>Nothing to buy — pantry covers it all.</p>}
      {lines.map((line, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              style={{ width: 70, padding: 6 }}
              type="number"
              step="any"
              min="0"
              value={line.qty ?? ""}
              placeholder="qty"
              onChange={(e) =>
                setLine(i, { qty: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
            <input
              style={{ width: 90, padding: 6 }}
              value={line.unit ?? ""}
              placeholder="unit"
              onChange={(e) => setLine(i, { unit: e.target.value || null })}
            />
            <input
              style={{ flex: 1, padding: 6 }}
              value={line.name}
              onChange={(e) => setLine(i, { name: e.target.value })}
            />
            <span style={{ color: "#999", fontSize: 12 }} title={line.sources.join(", ")}>
              {line.sources.length} recipe{line.sources.length > 1 ? "s" : ""}
            </span>
            <button
              style={{ fontSize: 12 }}
              title="brand/size preference"
              onClick={() => setEditingPref(editingPref === i ? null : i)}
            >
              pref
            </button>
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
          </div>
          {prefText(prefs[prefKey(line.name)]) && editingPref !== i && (
            <p style={{ color: "#2a5db0", fontSize: 13, margin: "2px 0 0 78px" }}>
              {prefText(prefs[prefKey(line.name)])}
            </p>
          )}
          {editingPref === i && (
            <PrefEditor
              name={line.name}
              pref={prefs[prefKey(line.name)]}
              onSaved={applyPrefs}
              onClose={() => setEditingPref(null)}
            />
          )}
        </div>
      ))}
      <button
        onClick={() =>
          setLines([...lines, { name: "", qty: null, unit: null, sources: [] }])
        }
      >
        + item
      </button>

      {lines.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button style={{ padding: "10px 24px", fontSize: 16 }} onClick={startRun}>
            Shop in store
          </button>
          {rails.includes("instacart") && (
            <button
              style={{ padding: "10px 24px", fontSize: 16 }}
              disabled={mode.name === "ordering"}
              onClick={order}
            >
              {mode.name === "ordering" ? "Building cart…" : "Order (Instacart)"}
            </button>
          )}
        </div>
      )}
      {mode.name === "ordered" && (
        <p>
          Cart created — <a href={mode.url} target="_blank">open it on Instacart</a>. When it
          arrives, mark it delivered on the <a href="/orders">Orders page</a>.
        </p>
      )}
      {mode.name === "orderFailed" && (
        <p style={{ color: "#b02a37" }}>Order failed: {mode.reason}</p>
      )}

      {stocked.length > 0 && (
        <>
          <h3 style={{ color: "#666" }}>Already in pantry</h3>
          <ul style={{ color: "#666" }}>
            {stocked.map((line, i) => (
              <li key={i}>{line.name}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
