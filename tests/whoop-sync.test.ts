import { createHmac } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_LOGGED, SESSION_LOGGED, SLEPT_LOGGED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { exchangeCode, verifyWhoopSignature } from "@/lib/whoop";
import { handleWhoopWebhook, syncWhoop } from "@/lib/whoop-ingest";

const HH = "hh-test";
const realFetch = globalThis.fetch;

const recoveryRecord = {
  cycle_id: 93845,
  created_at: "2026-07-26T11:05:00Z",
  updated_at: "2026-07-26T11:05:00Z",
  score_state: "SCORED",
  score: { recovery_score: 61, resting_heart_rate: 52, hrv_rmssd_milli: 48.3 },
};

const sleepRecord = {
  id: "sleep-uuid-1",
  created_at: "2026-07-26T11:00:00Z",
  updated_at: "2026-07-26T11:00:00Z",
  start: "2026-07-26T03:12:00Z",
  end: "2026-07-26T11:00:00Z",
  nap: false,
  score_state: "SCORED",
  score: { sleep_performance_percentage: 72 },
};

const workoutRecord = {
  id: "workout-uuid-1",
  created_at: "2026-07-26T22:40:00Z",
  updated_at: "2026-07-26T22:40:00Z",
  start: "2026-07-26T21:30:00Z",
  end: "2026-07-26T22:35:00Z",
  sport_name: "Running",
  score_state: "SCORED",
  score: { strain: 12.4 },
};

async function seedTokens(db: Client) {
  const saved = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 }),
      { status: 200 }
    )) as typeof fetch;
  await exchangeCode(db, HH, "seed", "https://app.test/cb");
  globalThis.fetch = saved;
}

describe("verifyWhoopSignature", () => {
  it("accepts the HMAC-SHA256(timestamp + body) signature and rejects tampering", () => {
    const secret = "csecret-test";
    const timestamp = "1753546800000";
    const body = JSON.stringify({ user_id: 1, id: 93845, type: "recovery.updated" });
    const good = createHmac("sha256", secret).update(timestamp + body).digest("base64");

    expect(verifyWhoopSignature(secret, timestamp, body, good)).toBe(true);
    expect(verifyWhoopSignature(secret, timestamp, body + " ", good)).toBe(false);
    expect(verifyWhoopSignature("wrong", timestamp, body, good)).toBe(false);
    expect(verifyWhoopSignature(secret, timestamp, body, "not-base64!!")).toBe(false);
  });
});

describe("whoop webhook dispatch", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    process.env.WHOOP_CLIENT_ID = "cid-test";
    process.env.WHOOP_CLIENT_SECRET = "csecret-test";
    await seedTokens(db);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.WHOOP_CLIENT_ID;
    delete process.env.WHOOP_CLIENT_SECRET;
  });

  it("recovery.updated fetches the cycle's recovery and ingests it", async () => {
    const paths: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      paths.push(new URL(String(url)).pathname);
      return new Response(JSON.stringify(recoveryRecord), { status: 200 });
    }) as typeof fetch;

    const result = await handleWhoopWebhook(db, HH, { id: 93845, type: "recovery.updated" });
    expect(result).toEqual({ appended: 1, skipped: 0 });
    expect(paths).toEqual(["/developer/v2/cycle/93845/recovery"]);
    expect(await readEvents(db, HH, { type: RECOVERY_LOGGED })).toHaveLength(1);
  });

  it("sleep.updated and workout.updated route to their record endpoints", async () => {
    const paths: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      const body = path.includes("/sleep/") ? sleepRecord : workoutRecord;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

    await handleWhoopWebhook(db, HH, { id: "sleep-uuid-1", type: "sleep.updated" });
    await handleWhoopWebhook(db, HH, { id: "workout-uuid-1", type: "workout.updated" });
    expect(paths).toEqual([
      "/developer/v2/activity/sleep/sleep-uuid-1",
      "/developer/v2/activity/workout/workout-uuid-1",
    ]);
    expect(await readEvents(db, HH, { type: SLEPT_LOGGED })).toHaveLength(1);
    expect(await readEvents(db, HH, { type: SESSION_LOGGED })).toHaveLength(1);
  });

  it("deleted and unknown webhook types are no-ops with no API call", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    expect(await handleWhoopWebhook(db, HH, { id: 1, type: "recovery.deleted" })).toEqual({
      appended: 0,
      skipped: 0,
    });
    expect(await handleWhoopWebhook(db, HH, { id: 1, type: "something.else" })).toEqual({
      appended: 0,
      skipped: 0,
    });
    expect(calls).toBe(0);
  });
});

describe("syncWhoop", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    process.env.WHOOP_CLIENT_ID = "cid-test";
    process.env.WHOOP_CLIENT_SECRET = "csecret-test";
    await seedTokens(db);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.WHOOP_CLIENT_ID;
    delete process.env.WHOOP_CLIENT_SECRET;
  });

  it("pulls all three collections with a start/end window, follows pagination, ingests everything", async () => {
    const requested: Array<{ path: string; params: URLSearchParams }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = new URL(String(url));
      requested.push({ path: u.pathname, params: u.searchParams });
      if (u.pathname.endsWith("/v2/recovery")) {
        // two pages: nextToken on the first, none on the second
        if (!u.searchParams.get("nextToken")) {
          return new Response(
            JSON.stringify({ records: [recoveryRecord], next_token: "page-2" }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            records: [{ ...recoveryRecord, cycle_id: 93846 }],
            next_token: null,
          }),
          { status: 200 }
        );
      }
      if (u.pathname.endsWith("/v2/activity/sleep")) {
        return new Response(JSON.stringify({ records: [sleepRecord], next_token: null }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ records: [workoutRecord], next_token: null }), {
        status: 200,
      });
    }) as typeof fetch;

    const result = await syncWhoop(db, HH, 14);
    expect(result).toEqual({ appended: 4, skipped: 0 });

    const recoveryCalls = requested.filter((r) => r.path.endsWith("/v2/recovery"));
    expect(recoveryCalls).toHaveLength(2);
    expect(recoveryCalls[1].params.get("nextToken")).toBe("page-2");
    for (const call of requested) {
      expect(call.params.get("start")).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect(call.params.get("end")).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    }

    expect(await readEvents(db, HH, { type: RECOVERY_LOGGED })).toHaveLength(2);
    expect(await readEvents(db, HH, { type: SLEPT_LOGGED })).toHaveLength(1);
    expect(await readEvents(db, HH, { type: SESSION_LOGGED })).toHaveLength(1);

    // idempotent: a second sync over the same window skips everything
    const again = await syncWhoop(db, HH, 14);
    expect(again).toEqual({ appended: 0, skipped: 4 });
  });
});
