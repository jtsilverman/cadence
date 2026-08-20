// Observability writers (evals/charter.md Layer 4): the one place that knows
// the analytics_events / error_events shapes. Server-side tracking lives in
// the routes that own the action (an event written where the action commits
// can't drift from the truth); client telemetry posts through /api/analytics
// and /api/errors into the same tables.

import type { Client } from "@libsql/client";

// No node:crypto here: this module rides into instrumentation.ts, which Next
// also bundles for the edge runtime where node: schemes don't resolve.
// Telemetry ids only need uniqueness, not cryptographic randomness.
let seq = 0;
const newId = (): string =>
  `${Date.now().toString(36)}-${(seq++ % 1e6).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Length caps: observability must never be the thing that breaks a request,
// and hostile input must not balloon the table.
const KIND_MAX = 64;
const PATH_MAX = 300;
const PROPS_MAX = 8_000;
const MESSAGE_MAX = 2_000;
const STACK_MAX = 16_000;
const CONTEXT_MAX = 24_000;

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s);

export interface TrackInput {
  kind: string;
  path?: string;
  household_id?: string;
  props?: Record<string, unknown>;
}

// Fire-and-forget by contract: tracking failures are swallowed (a lost pixel
// beats a failed user action) but still surface in the server log.
export async function track(db: Client, input: TrackInput): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO analytics_events (id, ts, kind, path, household_id, props)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        newId(),
        new Date().toISOString(),
        clip(input.kind, KIND_MAX),
        input.path ? clip(input.path, PATH_MAX) : null,
        input.household_id ?? null,
        clip(JSON.stringify(input.props ?? {}), PROPS_MAX),
      ],
    });
  } catch (error) {
    console.error("[observe] track failed", input.kind, error);
  }
}

export interface ErrorInput {
  side: "client" | "server";
  route?: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export async function recordError(db: Client, input: ErrorInput): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO error_events (id, ts, side, route, message, stack, context)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId(),
        new Date().toISOString(),
        input.side,
        input.route ? clip(input.route, PATH_MAX) : null,
        clip(input.message, MESSAGE_MAX),
        input.stack ? clip(input.stack, STACK_MAX) : null,
        clip(JSON.stringify(input.context ?? {}), CONTEXT_MAX),
      ],
    });
  } catch (error) {
    console.error("[observe] recordError failed", error);
  }
}
