import Link from "next/link";
import { getDb, migrate } from "@/lib/db";
import { readTokens, whoopConfigured } from "@/lib/whoop";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export const dynamic = "force-dynamic";

// Landing = the loop, in order. The nav covers wayfinding; this page teaches.
export default async function Home() {
  const configured = whoopConfigured();
  let connected = false;
  if (configured) {
    const db = getDb();
    await migrate(db);
    connected = (await readTokens(db, HOUSEHOLD_ID)) !== null;
  }

  const steps: Array<[string, string, string]> = [
    ["/recipes/new", "Save a recipe", "paste any recipe URL, review, keep it"],
    ["/week", "Plan the week", "pick meals, get the shopping list minus your pantry"],
    ["/week", "Order or shop", "Instacart cart, or check items off in the aisle"],
    ["/orders", "Receive", "mark delivered, confirm what actually arrived"],
    ["/recipes", "Cook", "step-at-a-time; “I made this” updates the pantry"],
  ];
  return (
    <div>
      <h1>cadence</h1>
      <p style={{ color: "#666" }}>Any recipe → groceries at your door → a pantry that keeps up.</p>
      <ol style={{ lineHeight: 2, paddingLeft: 20 }}>
        {steps.map(([href, title, blurb], i) => (
          <li key={i}>
            <Link href={href}>{title}</Link> — {blurb}
          </li>
        ))}
      </ol>
      <p>
        <Link href="/pantry">Pantry</Link> is always yours to correct — the app never asserts
        what&apos;s in your kitchen, you do.
      </p>
      {/* capability hidden entirely when WHOOP_* keys are unset (key-gate idiom) */}
      {configured && (
        <p>
          {connected ? (
            <span style={{ color: "#2a7" }}>✓ Whoop connected</span>
          ) : (
            <a href="/api/whoop/connect">Connect Whoop</a>
          )}{" "}
          — sleep, recovery, and workouts flow into your diary on their own.
        </p>
      )}
    </div>
  );
}
