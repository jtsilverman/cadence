// Whoop v2 client (spec wearable-ingest criteria 1-3). OAuth2 auth-code with
// ROTATING refresh tokens: the old refresh token dies the moment it is used,
// and a lost race bricks the connection until the user re-does OAuth
// (research-wearable-apis.md:17). Refresh is therefore single-writer twice
// over: an in-process chain serializes callers, and a compare-and-swap UPDATE
// (WHERE refresh_token = the-one-we-used) makes a cross-process loser adopt
// the winner's tokens instead of burning a second refresh call.
// Endpoint URLs/shapes from developer.whoop.com v2 docs; live-probed shapes
// land in tests/whoop.integration.test.ts once WHOOP_* keys exist.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Client } from "@libsql/client";

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API_BASE = "https://api.prod.whoop.com/developer";
const SCOPES = "read:recovery read:sleep read:workout offline";
const PROVIDER = "whoop";

const DEBUG = process.env.WHOOP_DEBUG === "1";
const trace = (msg: string) => {
  if (DEBUG) console.error(`[whoop] ${msg}`);
};

export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO
}

export function whoopConfigured(): boolean {
  return !!process.env.WHOOP_CLIENT_ID && !!process.env.WHOOP_CLIENT_SECRET;
}

function keys(): { clientId: string; clientSecret: string } {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET not set — Whoop unavailable");
  }
  return { clientId, clientSecret };
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = keys();
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenGrant {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function postToken(params: Record<string, string>): Promise<TokenGrant> {
  const { clientId, clientSecret } = keys();
  const body = new URLSearchParams({
    ...params,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`whoop token endpoint failed: ${response.status} ${text}`);
  }
  const grant = JSON.parse(text) as TokenGrant;
  if (!grant.access_token || !grant.refresh_token) {
    throw new Error(`whoop token endpoint returned no tokens: ${text}`);
  }
  return grant;
}

function expiryISO(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

async function saveTokens(db: Client, householdId: string, grant: TokenGrant): Promise<void> {
  await db.execute({
    sql: `INSERT INTO wearable_tokens
        (household_id, provider, access_token, refresh_token, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (household_id, provider) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`,
    args: [
      householdId,
      PROVIDER,
      grant.access_token,
      grant.refresh_token,
      expiryISO(grant.expires_in),
      new Date().toISOString(),
    ],
  });
}

export async function exchangeCode(
  db: Client,
  householdId: string,
  code: string,
  redirectUri: string
): Promise<void> {
  const grant = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  await saveTokens(db, householdId, grant);
  trace("code exchanged, tokens stored");
}

export async function readTokens(db: Client, householdId: string): Promise<WhoopTokens | null> {
  const result = await db.execute({
    sql: `SELECT access_token, refresh_token, expires_at FROM wearable_tokens
      WHERE household_id = ? AND provider = ?`,
    args: [householdId, PROVIDER],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    access_token: row.access_token as string,
    refresh_token: row.refresh_token as string,
    expires_at: row.expires_at as string,
  };
}

// In-process chain: concurrent refreshes serialize, and each run re-reads the
// store first — if the access token already changed, someone rotated while we
// waited and the network call is skipped entirely.
let refreshChain: Promise<unknown> = Promise.resolve();

export function refreshTokens(
  db: Client,
  householdId: string,
  staleAccessToken: string
): Promise<WhoopTokens> {
  const run = async (): Promise<WhoopTokens> => {
    const current = await readTokens(db, householdId);
    if (!current) throw new Error("whoop is not connected — no tokens stored");
    if (current.access_token !== staleAccessToken) {
      trace("refresh skipped: store already rotated");
      return current;
    }
    let grant: TokenGrant;
    try {
      grant = await postToken({
        grant_type: "refresh_token",
        refresh_token: current.refresh_token,
        // whoop requires re-asserting offline scope on refresh (v2 docs)
        scope: "offline",
      });
    } catch (error) {
      // Cross-process loser: if another instance rotated after our read, the
      // store holds fresh tokens — adopt them instead of surfacing the 400.
      const latest = await readTokens(db, householdId);
      if (latest && latest.refresh_token !== current.refresh_token) {
        trace("refresh lost cross-process race, adopting stored tokens");
        return latest;
      }
      throw error;
    }
    const cas = await db.execute({
      sql: `UPDATE wearable_tokens
        SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ?
        WHERE household_id = ? AND provider = ? AND refresh_token = ?`,
      args: [
        grant.access_token,
        grant.refresh_token,
        expiryISO(grant.expires_in),
        new Date().toISOString(),
        householdId,
        PROVIDER,
        current.refresh_token,
      ],
    });
    if (cas.rowsAffected === 0) {
      // Someone rotated between our read and write; their tokens are truth.
      const latest = await readTokens(db, householdId);
      if (!latest) throw new Error("whoop tokens vanished during refresh");
      trace("refresh CAS lost, adopting stored tokens");
      return latest;
    }
    trace("tokens refreshed");
    return {
      access_token: grant.access_token,
      refresh_token: grant.refresh_token,
      expires_at: expiryISO(grant.expires_in),
    };
  };
  const next = refreshChain.then(run, run);
  refreshChain = next.catch(() => {});
  return next;
}

// Webhook authenticity: X-WHOOP-Signature is base64(HMAC-SHA256(secret,
// timestamp + rawBody)) with X-WHOOP-Signature-Timestamp (v2 docs; live
// webhook delivery verified at prod deploy — no public URL locally).
export function verifyWhoopSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Authenticated GET against the v2 API. One 401 triggers one refresh-and-retry;
// everything else propagates with status + body (no invented retry loops —
// whoop's 100/min limit is unreachable for one household).
export async function whoopGet(db: Client, householdId: string, path: string): Promise<unknown> {
  const tokens = await readTokens(db, householdId);
  if (!tokens) throw new Error("whoop is not connected — no tokens stored");

  const get = async (accessToken: string): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });

  let response = await get(tokens.access_token);
  if (response.status === 401) {
    trace(`401 on ${path}, refreshing`);
    const fresh = await refreshTokens(db, householdId, tokens.access_token);
    response = await get(fresh.access_token);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`whoop GET ${path} failed: ${response.status} ${text}`);
  }
  return JSON.parse(text);
}
