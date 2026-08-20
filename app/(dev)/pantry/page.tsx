"use client";

import { useEffect, useState } from "react";
import type { PantryItem } from "@/lib/pantry";

// The API decorates view rows with fullness where cook history supports it.
type PantryRow = PantryItem & { cooks_left?: number };

export default function PantryPage() {
  const [items, setItems] = useState<PantryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", qty: "", unit: "" });

  useEffect(() => {
    fetch("/api/pantry")
      .then((res) => res.json())
      .then((data) => (data.ok ? setItems(data.items) : setError(data.reason)))
      .catch((e) => setError(String(e)));
  }, []);

  async function assert(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) setItems(data.items);
    else setError(data.reason);
    return data.ok;
  }

  async function add() {
    const ok = await assert({
      name: draft.name,
      qty: draft.qty === "" ? null : Number(draft.qty),
      unit: draft.unit || null,
    });
    if (ok) setDraft({ name: "", qty: "", unit: "" });
  }

  return (
    <div>
      <h1>Pantry</h1>
      <p style={{ color: "#666" }}>
        What you actually have. Leave qty blank for &ldquo;have it, amount unknown&rdquo;.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          style={{ flex: 1, padding: 6 }}
          placeholder="item name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && draft.name.trim() && add()}
        />
        <input
          style={{ width: 80, padding: 6 }}
          type="number"
          step="any"
          min="0"
          placeholder="qty"
          value={draft.qty}
          onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
        />
        <input
          style={{ width: 100, padding: 6 }}
          placeholder="unit"
          value={draft.unit}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
        />
        <button style={{ padding: "6px 16px" }} disabled={!draft.name.trim()} onClick={add}>
          Add
        </button>
      </div>

      {error && <p style={{ color: "#b02a37" }}>{error}</p>}
      {items === null && !error && <p>Loading…</p>}
      {items?.length === 0 && <p>Pantry is empty.</p>}

      {items?.map((item) => (
        <ItemRow key={item.name} item={item} onAssert={assert} />
      ))}
    </div>
  );
}

function ItemRow({
  item,
  onAssert,
}: {
  item: PantryRow;
  onAssert: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  // Display rounds to 2 decimals (storage keeps the full float, criterion 1);
  // an Update after editing asserts the rounded value — a user statement of
  // rough truth, consistent with the rough-counts dial.
  const shownQty = item.qty === null ? "" : String(Math.round(item.qty * 100) / 100);
  const [qty, setQty] = useState(shownQty);
  const [unit, setUnit] = useState(item.unit ?? "");
  const dirty = qty !== shownQty || unit !== (item.unit ?? "");

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
      <span style={{ flex: 1 }}>
        {item.name}
        {item.cooks_left !== undefined && (
          <span
            style={{
              marginLeft: 8,
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 12,
              background: item.cooks_left <= 1 ? "#fde8ea" : "#e8f1fd",
              color: item.cooks_left <= 1 ? "#b02a37" : "#2a5db0",
            }}
          >
            {item.cooks_left <= 1 ? "almost out" : `~${item.cooks_left} cooks left`}
          </span>
        )}
      </span>
      <input
        style={{ width: 80, padding: 6 }}
        type="number"
        step="any"
        min="0"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <input
        style={{ width: 100, padding: 6 }}
        placeholder="unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      />
      <button
        style={{ padding: "6px 12px", visibility: dirty ? "visible" : "hidden" }}
        onClick={() =>
          onAssert({
            name: item.name,
            qty: qty === "" ? null : Number(qty),
            unit: unit || null,
          })
        }
      >
        Update
      </button>
      <button
        style={{ padding: "6px 12px" }}
        onClick={() => onAssert({ name: item.name, removed: true })}
        title="Remove from pantry"
      >
        ✕
      </button>
    </div>
  );
}
