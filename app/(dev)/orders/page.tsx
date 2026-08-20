"use client";

import { useEffect, useState } from "react";
import type { LineItem } from "@/lib/contracts";
import type { OrderSummary } from "@/lib/rails";

// Orders + the delivery reconcile (UX reliability rule: what arrives ≠ what
// was ordered; pantry inflow records actuals, not the order).
export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<OrderSummary | null>(null);

  const refresh = () =>
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => (data.ok ? setOrders(data.orders) : setError(data.reason)))
      .catch((e) => setError(String(e)));

  useEffect(() => {
    refresh();
  }, []);

  if (reconciling) {
    return (
      <Reconcile
        order={reconciling}
        onDone={() => {
          setReconciling(null);
          refresh();
        }}
        onCancel={() => setReconciling(null)}
      />
    );
  }

  return (
    <div>
      <h1>Orders</h1>
      {error && <p style={{ color: "#b02a37" }}>{error}</p>}
      {orders === null && !error && <p>Loading…</p>}
      {orders?.length === 0 && <p>No orders yet — build one from <a href="/week">this week</a>.</p>}
      {orders?.map((order) => (
        <div key={order.event_id} style={{ padding: 12, border: "1px solid #eee", marginBottom: 8 }}>
          <p style={{ margin: "0 0 4px" }}>
            <strong>{order.rail}</strong> · {new Date(order.ts).toLocaleString()} ·{" "}
            {order.items.length} items{" "}
            {order.url && (
              <>
                · <a href={order.url} target="_blank">open cart</a>
              </>
            )}
          </p>
          {order.settled ? (
            <div style={{ margin: 0 }}>
              <p style={{ color: "#2e7d32", margin: 0 }}>
                {order.rail === "instore" ? "Completed ✓" : "Delivered ✓"}
              </p>
              <Outcome order={order} />
            </div>
          ) : order.rail === "instore" ? (
            // An instore run settles through its own Done batch on /week —
            // the delivery reconcile must not write against it (spec c2).
            <p style={{ color: "#666", margin: 0 }}>
              In progress — <a href="/week">finish the run</a>
            </p>
          ) : (
            <button onClick={() => setReconciling(order)}>Mark delivered</button>
          )}
        </div>
      ))}
    </div>
  );
}

// What actually came in vs what was asked for: skipped items for a store
// run, subs/missing for a delivery. Names compare normalized, same as the fold.
function Outcome({ order }: { order: OrderSummary }) {
  if (!order.received) return null;
  const got = new Set(order.received.map((i) => i.name.trim().toLowerCase()));
  const skipped = order.items.filter((i) => !got.has(i.name.trim().toLowerCase()));
  if (skipped.length === 0) return null;
  return (
    <p style={{ color: "#666", margin: 0, fontSize: 13 }}>
      Skipped: {skipped.map((i) => i.name).join(", ")}
    </p>
  );
}

function Reconcile({
  order,
  onDone,
  onCancel,
}: {
  order: OrderSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Prefill with what was ordered; the user corrects subs/missing before confirming.
  const [items, setItems] = useState<LineItem[]>(order.items);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems(items.map((item, j) => (j === i ? { ...item, ...patch } : item)));

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/pantry/inflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.filter((item) => item.name.trim()),
        via: "delivery",
        order_event_id: order.event_id,
      }),
    });
    const data = await res.json();
    if (data.ok) onDone();
    else {
      setError(data.reason);
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Anything subbed or missing?</h1>
      <p style={{ color: "#666" }}>
        This is what you ordered. Fix quantities, remove what didn&apos;t arrive, add
        substitutions — what you confirm goes into the pantry.
      </p>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <input
            style={{ width: 70, padding: 6 }}
            type="number"
            step="any"
            min="0"
            value={item.qty ?? ""}
            placeholder="qty"
            onChange={(e) =>
              setItem(i, { qty: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <input
            style={{ width: 90, padding: 6 }}
            value={item.unit ?? ""}
            placeholder="unit"
            onChange={(e) => setItem(i, { unit: e.target.value || null })}
          />
          <input
            style={{ flex: 1, padding: 6 }}
            value={item.name}
            onChange={(e) => setItem(i, { name: e.target.value })}
          />
          <button onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button onClick={() => setItems([...items, { name: "", qty: null, unit: null }])}>
        + substitution
      </button>
      {error && <p style={{ color: "#b02a37" }}>{error}</p>}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          style={{ padding: "10px 24px", fontSize: 16 }}
          disabled={saving || items.length === 0}
          onClick={confirm}
        >
          {saving ? "Saving…" : "Confirm — add to pantry"}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
