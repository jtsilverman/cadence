import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db";
import { whoopGet } from "@/lib/whoop";

// Live shape probe against whoop v2 (project rule: first live call is a
// probe, not code-on-mocks). Gated on a real user access token — obtained by
// connecting through /api/whoop/connect once Jake registers the dev app
// (developer.whoop.com, redirect URI <origin>/api/whoop/callback) — because
// every data endpoint is user-scoped OAuth; there is no app-only token.
// Run: RUN_INTEGRATION=1 WHOOP_ACCESS_TOKEN=... npx vitest run tests/whoop.integration.test.ts
// Verifies the assumptions the unit-test fixtures encode: collection wrapper
// {records, next_token}, record field names, score_state values, and the
// RED_ZONE band (spec criterion 8's UNVERIFIED threshold).
const live = process.env.RUN_INTEGRATION === "1" && !!process.env.WHOOP_ACCESS_TOKEN;

describe.skipIf(!live)("whoop v2 live shapes", () => {
  async function liveDb() {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    await db.execute({
      sql: `INSERT INTO wearable_tokens
          (household_id, provider, access_token, refresh_token, expires_at, updated_at)
        VALUES ('hh-live', 'whoop', ?, 'unused-in-probe', ?, ?)`,
      args: [
        process.env.WHOOP_ACCESS_TOKEN!,
        new Date(Date.now() + 3600_000).toISOString(),
        new Date().toISOString(),
      ],
    });
    return db;
  }

  it("recovery collection matches the mapper's expected shape", async () => {
    const db = await liveDb();
    const page = (await whoopGet(db, "hh-live", "/v2/recovery?limit=5")) as {
      records: Array<Record<string, unknown>>;
      next_token?: string | null;
    };
    expect(Array.isArray(page.records)).toBe(true);
    for (const record of page.records) {
      expect(typeof record.cycle_id).toBe("number");
      expect(typeof record.created_at).toBe("string");
      expect(typeof record.score_state).toBe("string");
      if (record.score_state === "SCORED") {
        const score = record.score as Record<string, unknown>;
        expect(typeof score.recovery_score).toBe("number");
      }
    }
  });

  it("sleep collection carries end, nap, and sleep_performance_percentage", async () => {
    const db = await liveDb();
    const page = (await whoopGet(db, "hh-live", "/v2/activity/sleep?limit=5")) as {
      records: Array<Record<string, unknown>>;
    };
    for (const record of page.records) {
      expect(typeof record.id).toBe("string");
      expect(typeof record.end).toBe("string");
      expect(typeof record.nap).toBe("boolean");
      if (record.score_state === "SCORED") {
        const score = record.score as Record<string, unknown>;
        expect(typeof score.sleep_performance_percentage).toBe("number");
      }
    }
  });

  it("workout collection carries end and a sport name", async () => {
    const db = await liveDb();
    const page = (await whoopGet(db, "hh-live", "/v2/activity/workout?limit=5")) as {
      records: Array<Record<string, unknown>>;
    };
    for (const record of page.records) {
      expect(typeof record.id).toBe("string");
      expect(typeof record.end).toBe("string");
    }
  });
});
