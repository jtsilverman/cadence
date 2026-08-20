"use client";

import { useEffect, useState } from "react";

// Grocery list (ux.md: list goes out, checked off as bought, pantry follows).
// POST /api/cart computes the week's list (pure read, nothing persists);
// checking off runs the real execute pair: /api/order records the in-store
// run, /api/pantry/inflow puts exactly the checked amounts in the pantry.
// Suggestions are suggest-only: a line joins the list ONLY when tapped
// (CLAUDE.md pantry rule); "have some?" marks ride along, never auto-skip.

interface Line {
  name: string;
  qty: number | null;
  unit: string | null;
  sources: string[];
  have_some?: true;
}
interface Suggestion {
  name: string;
  qty?: number | null;
  unit?: string | null;
  reason?: string;
}

const amount = (line: Line) =>
  line.qty === null ? "some" : `${line.qty}${line.unit ? ` ${line.unit}` : ""}`;

export default function GroceriesPage() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [stocked, setStocked] = useState<Line[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setLines(data.toBuy ?? []);
          setStocked(data.stocked ?? []);
          setSuggestions(data.suggestions ?? []);
        } else {
          setLines([]);
          setReason(String(data.reason ?? "Couldn't build the list."));
        }
      })
      .catch(() => {
        setLines([]);
        setReason("Couldn't build the list.");
      });
  }, []);

  function toggle(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addSuggestion(s: Suggestion) {
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
    setLines((prev) => [
      ...(prev ?? []),
      { name: s.name, qty: s.qty ?? null, unit: s.unit ?? null, sources: ["suggested"] },
    ]);
  }

  async function checkout() {
    if (!lines || state === "busy") return;
    const items = lines.filter((l) => checked.has(l.name));
    if (items.length === 0) return;
    setState("busy");
    try {
      const order = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rail: "instore", items }),
      }).then((r) => r.json());
      if (!order.ok || !order.order_event_id) throw new Error();
      const inflow = await fetch("/api/pantry/inflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ via: "checkoff", items, order_event_id: order.order_event_id }),
      }).then((r) => r.json());
      if (!inflow.ok) throw new Error();
      setState("done");
      setReceipt(`${items.length} ${items.length === 1 ? "item" : "items"} into the pantry.`);
      setLines(lines.filter((l) => !checked.has(l.name)));
      setChecked(new Set());
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Grocery list</h1>
        <span className="shell-header-meta">This week</span>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {reason && <div className="p-placeholder">{reason}</div>}
          {lines?.map((line) => (
            <label key={line.name} className="grocery-row">
              <input
                type="checkbox"
                className="g-input-hidden"
                checked={checked.has(line.name)}
                onChange={() => toggle(line.name)}
              />
              <span className={checked.has(line.name) ? "g-box g-box--on" : "g-box"} aria-hidden="true">
                {checked.has(line.name) && "✓"}
              </span>
              <span className="slot-title">{line.name}</span>
              <span className="slot-status">
                {amount(line)}
                {line.have_some ? " · have some?" : ""}
              </span>
            </label>
          ))}
          {suggestions.length > 0 && (
            <section>
              <span className="p-eyebrow">You might be low (tap to add)</span>
              <div className="p-stack">
                {suggestions.map((s) => (
                  <button key={s.name} type="button" className="grocery-row grocery-row--suggest" onClick={() => addSuggestion(s)}>
                    <span className="g-box" aria-hidden="true">+</span>
                    <span className="slot-title">{s.name}</span>
                    {s.reason && <span className="slot-status">{s.reason}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
          {stocked.length > 0 && (
            <section>
              <span className="p-eyebrow">Covered by the pantry</span>
              <div className="p-stack">
                {stocked.map((line) => (
                  <div key={line.name} className="grocery-row grocery-row--stocked">
                    <span className="slot-title">{line.name}</span>
                    <span className="slot-status">{amount(line)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {receipt && (
            <div className="p-card">
              <span className="p-eyebrow">Checked off</span>
              {receipt}
            </div>
          )}
          {state === "error" && (
            <div className="p-placeholder">That checkoff didn&rsquo;t save. Try again.</div>
          )}
          {lines && lines.length > 0 && (
            <button
              type="button"
              className="finish-btn"
              disabled={state === "busy" || checked.size === 0}
              onClick={checkout}
            >
              {state === "busy"
                ? "Saving…"
                : checked.size === 0
                  ? "Check off what you bought"
                  : `Bought ${checked.size}: into the pantry`}
            </button>
          )}
        </div>
      </main>
    </>
  );
}
