import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "@/lib/db";
import {
  authorizeUrl,
  exchangeCode,
  readTokens,
  refreshTokens,
  whoopConfigured,
  whoopGet,
} from "@/lib/whoop";

const HH = "hh-test";

const realFetch = globalThis.fetch;

function tokenResponse(access: string, refresh: string) {
  return new Response(
    JSON.stringify({
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      token_type: "bearer",
    }),
    { status: 200 }
  );
}

describe("whoop client", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    process.env.WHOOP_CLIENT_ID = "cid-test";
    process.env.WHOOP_CLIENT_SECRET = "csecret-test";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.WHOOP_CLIENT_ID;
    delete process.env.WHOOP_CLIENT_SECRET;
  });

  it("is unconfigured without keys, configured with them", () => {
    expect(whoopConfigured()).toBe(true);
    delete process.env.WHOOP_CLIENT_ID;
    expect(whoopConfigured()).toBe(false);
  });

  it("authorizeUrl carries client_id, redirect_uri, state, and scopes", () => {
    const url = new URL(authorizeUrl("https://app.test/api/whoop/callback", "state-123"));
    expect(url.searchParams.get("client_id")).toBe("cid-test");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/api/whoop/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    const scope = url.searchParams.get("scope") ?? "";
    for (const s of [
      "offline",
      "read:recovery",
      "read:cycles",
      "read:workout",
      "read:sleep",
      "read:profile",
      "read:body_measurement",
    ]) {
      expect(scope).toContain(s);
    }
  });

  it("authorizeUrl throws without keys (key-gate)", () => {
    delete process.env.WHOOP_CLIENT_ID;
    expect(() => authorizeUrl("https://app.test/cb", "s")).toThrow(/WHOOP_CLIENT_ID/);
  });

  it("exchangeCode posts form-encoded grant and stores tokens", async () => {
    let captured: { url: string; body: string } | undefined;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), body: String(init?.body) };
      return tokenResponse("acc-1", "ref-1");
    }) as typeof fetch;

    await exchangeCode(db, HH, "code-abc", "https://app.test/api/whoop/callback");

    expect(captured).toBeDefined();
    const params = new URLSearchParams(captured!.body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("code-abc");
    expect(params.get("client_id")).toBe("cid-test");
    expect(params.get("client_secret")).toBe("csecret-test");
    expect(params.get("redirect_uri")).toBe("https://app.test/api/whoop/callback");

    const tokens = await readTokens(db, HH);
    expect(tokens?.access_token).toBe("acc-1");
    expect(tokens?.refresh_token).toBe("ref-1");
  });

  it("readTokens is null before any connect", async () => {
    expect(await readTokens(db, HH)).toBeNull();
  });

  it("two concurrent refreshes make ONE token call and converge on the same tokens", async () => {
    await seedTokens(db, "acc-stale", "ref-1");
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return tokenResponse("acc-2", "ref-2");
    }) as typeof fetch;

    const [a, b] = await Promise.all([
      refreshTokens(db, HH, "acc-stale"),
      refreshTokens(db, HH, "acc-stale"),
    ]);

    expect(calls).toBe(1);
    expect(a.access_token).toBe("acc-2");
    expect(b.access_token).toBe("acc-2");
    const stored = await readTokens(db, HH);
    expect(stored?.refresh_token).toBe("ref-2");
  });

  it("a refresh losing a cross-process race adopts the stored tokens instead of failing", async () => {
    // Another instance already rotated: store holds ref-2, we still hold acc-stale/ref-1.
    await seedTokens(db, "acc-2", "ref-2");
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }) as typeof fetch;

    const tokens = await refreshTokens(db, HH, "acc-stale");
    expect(tokens.access_token).toBe("acc-2");
    expect(calls).toBe(0); // store's access differs from the stale one — no network call at all
  });

  it("whoopGet retries exactly once through a refresh on 401", async () => {
    await seedTokens(db, "acc-old", "ref-1");
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/oauth/oauth2/token")) {
        seen.push("refresh");
        return tokenResponse("acc-new", "ref-2");
      }
      const auth = String((init?.headers as Record<string, string>)?.Authorization);
      seen.push(`get:${auth}`);
      if (auth === "Bearer acc-old") {
        return new Response("expired", { status: 401 });
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    }) as typeof fetch;

    const body = await whoopGet(db, HH, "/v2/recovery");
    expect(body).toEqual({ records: [] });
    expect(seen).toEqual(["get:Bearer acc-old", "refresh", "get:Bearer acc-new"]);
  });

  it("whoopGet refreshes an expired access token before the request", async () => {
    await seedTokens(db, "acc-old", "ref-1");
    await db.execute({
      sql: `UPDATE wearable_tokens SET expires_at = ? WHERE household_id = ?`,
      args: ["2020-01-01T00:00:00.000Z", HH],
    });
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/oauth/oauth2/token")) {
        seen.push("refresh");
        const body = String(init?.body);
        expect(body).toContain("grant_type=refresh_token");
        expect(body).toContain("refresh_token=ref-1");
        return tokenResponse("acc-new", "ref-2");
      }
      const auth = String((init?.headers as Record<string, string>)?.Authorization);
      seen.push(`get:${auth}`);
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    }) as typeof fetch;

    const body = await whoopGet(db, HH, "/v2/cycle");
    expect(body).toEqual({ records: [] });
    expect(seen).toEqual(["refresh", "get:Bearer acc-new"]);
    expect((await readTokens(db, HH))?.refresh_token).toBe("ref-2");
  });

  it("whoopGet propagates non-401 API errors with status and body", async () => {
    await seedTokens(db, "acc-1", "ref-1");
    globalThis.fetch = vi.fn(async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    await expect(whoopGet(db, HH, "/v2/recovery")).rejects.toThrow(/429.*rate limited/s);
  });

  it("whoopGet without a connection throws an honest not-connected error", async () => {
    await expect(whoopGet(db, HH, "/v2/recovery")).rejects.toThrow(/not connected/i);
  });
});

async function seedTokens(db: Client, access: string, refresh: string) {
  let captured = false;
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => {
    captured = true;
    return tokenResponse(access, refresh);
  }) as typeof fetch;
  await exchangeCode(db, HH, "seed-code", "https://app.test/cb");
  globalThis.fetch = saved;
  if (!captured) throw new Error("seedTokens: exchange did not run");
}
