// J-W — "Prove demand before building": a stranger arrives from somewhere,
// reads one pitch, joins, tells us what they actually want. Every step has to
// survive as a signal we can act on, or the smoke test measures nothing.

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, post } from "./harness";
import { getDb } from "@/lib/db";

let app: App;

async function rowFor(email: string) {
  const res = await getDb().execute({
    sql: "SELECT * FROM waitlist WHERE email = ?",
    args: [email],
  });
  return res.rows[0] as any;
}

beforeAll(async () => {
  app = await loadApp();
});

describe("J-W: the validation funnel", () => {
  it("a signup carries where they came from and which pitch they read", async () => {
    const res = await post(app.waitlist, {
      email: "runner@example.com",
      cta: "hero",
      variant: "magic",
      utm_source: "reddit",
      utm_medium: "social",
      utm_campaign: "mealprep-august",
    });
    expect(res.status).toBe(200);
    const row = await rowFor("runner@example.com");
    expect(row.cta).toBe("hero");
    expect(row.variant).toBe("magic");
    expect(row.utm_source).toBe("reddit");
    expect(row.utm_campaign).toBe("mealprep-august");
  });

  it("joining again from a different page keeps the first attribution — the signal is where they converted", async () => {
    await post(app.waitlist, { email: "runner@example.com", cta: "faq", variant: "outcome" });
    const res = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM waitlist WHERE email = ?",
      args: ["runner@example.com"],
    });
    expect(Number(res.rows[0].n)).toBe(1);
    const row = await rowFor("runner@example.com");
    expect(row.cta).toBe("hero");
    expect(row.variant).toBe("magic");
  });

  it("the same person typing their address with different capitalization is one person", async () => {
    await post(app.waitlist, { email: "Runner@Example.com ", cta: "nav" });
    const res = await getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM waitlist WHERE email = ?",
      args: ["runner@example.com"],
    });
    expect(Number(res.rows[0].n)).toBe(1);
  });

  it("a typo instead of an address is refused, not stored as a lead", async () => {
    const res = await post(app.waitlist, { email: "runner at example", cta: "hero" });
    expect(res.status).toBe(422);
    const all = await getDb().execute("SELECT COUNT(*) AS n FROM waitlist");
    expect(Number(all.rows[0].n)).toBe(1);
  });

  it("an absurdly long address is refused — nothing over the RFC 254-char cap becomes a lead", async () => {
    const res = await post(app.waitlist, { email: `${"a".repeat(490)}@example.com`, cta: "hero" });
    expect(res.status).toBe(422);
    const all = await getDb().execute("SELECT COUNT(*) AS n FROM waitlist");
    expect(Number(all.rows[0].n)).toBe(1);
  });

  it("the survey answers attach to the person who joined, not a second row", async () => {
    const res = await post(app.survey, {
      email: "runner@example.com",
      pick: "Sticking to calories or macros",
      tools: ["MyFitnessPal or similar tracker", "Notes app or spreadsheet"],
      features: ["Wearable sync", "Workout planning that informs diet"],
      price: "~$10",
      wish: "Tracking always dies by Thursday. Fix the food part.",
      call_optin: true,
    });
    expect(res.status).toBe(200);
    const row = await rowFor("runner@example.com");
    expect(row.survey_pick).toBe("Sticking to calories or macros");
    expect(JSON.parse(row.survey_tools)).toEqual([
      "MyFitnessPal or similar tracker",
      "Notes app or spreadsheet",
    ]);
    expect(JSON.parse(row.survey_features)).toEqual([
      "Wearable sync",
      "Workout planning that informs diet",
    ]);
    expect(row.survey_price).toBe("~$10");
    expect(row.survey_wish).toContain("dies by Thursday");
    expect(Number(row.survey_call_optin)).toBe(1);
    const all = await getDb().execute("SELECT COUNT(*) AS n FROM waitlist");
    expect(Number(all.rows[0].n)).toBe(1);
  });

  it("junk in the multi-pick fields is dropped, not stored — the tallies stay countable", async () => {
    const res = await post(app.survey, {
      email: "runner@example.com",
      tools: ["Paper", 7, "", { evil: true }],
      features: "not-an-array",
    });
    expect(res.status).toBe(200);
    const row = await rowFor("runner@example.com");
    expect(JSON.parse(row.survey_tools)).toEqual(["Paper"]);
    expect(row.survey_features).toBeNull();
  });

  it("a survey from someone who never joined creates no phantom lead", async () => {
    const res = await post(app.survey, { email: "ghost@example.com", pick: "Training" });
    expect(res.status).toBe(404);
    const ghost = await rowFor("ghost@example.com");
    expect(ghost).toBeUndefined();
  });

  it("a question from the FAQ is kept even when they leave no address — the objection is the signal", async () => {
    const res = await post(app.question, {
      question: "Does this work if I already pay a coach?",
    });
    expect(res.status).toBe(200);
    const rows = await getDb().execute("SELECT * FROM questions");
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as any).question).toContain("already pay a coach");
  });

  it("an empty question is refused so the objection list stays readable", async () => {
    const res = await post(app.question, { question: "   " });
    expect(res.status).toBe(422);
    const rows = await getDb().execute("SELECT COUNT(*) AS n FROM questions");
    expect(Number(rows.rows[0].n)).toBe(1);
  });
});
