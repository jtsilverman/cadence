// The validation instrument: one lead row carrying the whole attribution chain
// (where from -> which pitch -> which button) plus the post-signup survey.
// Kept out of the routes so the shape is asserted in one place.

import type { Client } from "@libsql/client";

// One @ with something either side, no spaces — a capture gate, not RFC 5322.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254; // RFC 5321 path limit; anything longer is garbage or abuse

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > EMAIL_MAX) return null;
  return EMAIL.test(email) ? email : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export interface Attribution {
  cta: string | null;
  variant: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export function parseAttribution(body: Record<string, unknown>): Attribution {
  return {
    cta: text(body.cta) ?? text(body.source),
    variant: text(body.variant),
    utm_source: text(body.utm_source),
    utm_medium: text(body.utm_medium),
    utm_campaign: text(body.utm_campaign),
  };
}

// Re-joining is a no-op, not an error, and never overwrites the first
// attribution: the signal is where they FIRST converted, not where they
// wandered back to.
export async function joinWaitlist(
  db: Client,
  email: string,
  attribution: Attribution
): Promise<void> {
  await db.execute({
    sql: `INSERT OR IGNORE INTO waitlist
            (email, source, created_at, cta, variant, utm_source, utm_medium, utm_campaign)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      email,
      attribution.cta ?? "unknown",
      new Date().toISOString(),
      attribution.cta,
      attribution.variant,
      attribution.utm_source,
      attribution.utm_medium,
      attribution.utm_campaign,
    ],
  });
}

export interface Survey {
  pick: string | null;
  tools: string[] | null;
  features: string[] | null;
  price: string | null;
  wish: string | null;
  call_optin: boolean;
}

// Multi-pick answers arrive as arrays; anything that isn't a non-empty string
// is dropped so the stored JSON tallies clean. A non-array is null, not [].
function picks(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const kept = value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return kept.length > 0 ? kept.map((v) => v.trim()) : null;
}

export function parseSurvey(body: Record<string, unknown>): Survey {
  return {
    pick: text(body.pick),
    tools: picks(body.tools),
    features: picks(body.features),
    price: text(body.price),
    wish: text(body.wish),
    call_optin: body.call_optin === true,
  };
}

// Answers attach to an existing lead only. A survey for an address that never
// joined is a 404, never a phantom row — otherwise the denominator lies.
export async function recordSurvey(
  db: Client,
  email: string,
  survey: Survey
): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE waitlist
             SET survey_pick = ?, survey_tools = ?, survey_features = ?, survey_price = ?,
                 survey_wish = ?, survey_call_optin = ?, surveyed_at = ?
           WHERE email = ?`,
    args: [
      survey.pick,
      survey.tools ? JSON.stringify(survey.tools) : null,
      survey.features ? JSON.stringify(survey.features) : null,
      survey.price,
      survey.wish,
      survey.call_optin ? 1 : 0,
      new Date().toISOString(),
      email,
    ],
  });
  return result.rowsAffected > 0;
}

export async function recordQuestion(
  db: Client,
  question: string,
  email: string | null
): Promise<void> {
  await db.execute({
    sql: "INSERT INTO questions (id, question, email, created_at) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), question, email, new Date().toISOString()],
  });
}

export { text as optionalText };
