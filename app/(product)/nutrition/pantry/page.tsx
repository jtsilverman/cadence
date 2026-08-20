"use client";

import { useEffect, useState } from "react";

// Pantry (ux.md: suggest-only from inference; ONLY explicit user action
// asserts inventory truth). This screen is that explicit action: the rows
// come from the fold (purchases minus cooking), and the add form posts a
// user assertion via POST /api/pantry.

interface PantryItem {
  name: string;
  qty: number | null;
  unit: string | null;
  cooks_left?: number;
  weekly_use?: { qty: number; unit: string | null };
  expires?: string;
}

const amount = (item: PantryItem) =>
  item.qty === null ? "some" : `${item.qty}${item.unit ? ` ${item.unit}` : ""}`;

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    return fetch("/api/pantry")
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setNotice("Couldn't load the pantry."));
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setNotice(null);
    const body: Record<string, unknown> = { name: name.trim() };
    if (qty.trim()) body.qty = Number(qty);
    if (unit.trim()) body.unit = unit.trim();
    try {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok === false) {
        setNotice(String(data.reason ?? "That didn't save."));
      } else {
        setName("");
        setQty("");
        setUnit("");
        await load(); // the fold is the receipt
      }
    } catch {
      setNotice("That didn't save.");
    }
    setBusy(false);
  }

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Pantry</h1>
        <span className="shell-header-meta">You assert what&rsquo;s true</span>
      </header>
      <main className="shell-main">
        <div className="p-stack">
          {notice && <div className="p-placeholder">{notice}</div>}
          {items && items.length === 0 && (
            <div className="p-placeholder">
              Empty. Check off a grocery run or add what you have below.
            </div>
          )}
          {items?.map((item) => (
            <div key={item.name} className="slot-row">
              <span className="slot-title">{item.name}</span>
              <span className="slot-status">
                {amount(item)}
                {item.cooks_left !== undefined ? ` · ${item.cooks_left} cooks left` : ""}
              </span>
            </div>
          ))}
          <form className="pantry-form" onSubmit={add}>
            <input
              className="set-input pantry-name"
              placeholder="what you have"
              aria-label="Item name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="set-input"
              placeholder="qty"
              inputMode="decimal"
              aria-label="Quantity"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <input
              className="set-input"
              placeholder="unit"
              aria-label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
            <button type="submit" className="set-log" disabled={busy || !name.trim()}>
              {busy ? "…" : "Add"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
