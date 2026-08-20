import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { exchangeCode, whoopConfigured } from "@/lib/whoop";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// OAuth callback: state must match the connect-minted cookie (CSRF gate) and
// a whoop-side error or failed exchange writes NO tokens — the redirect
// carries an honest ?whoop= flag either way.
export async function GET(request: NextRequest) {
  const origin = process.env.APP_ORIGIN ?? request.nextUrl.origin;
  const home = (flag: string) => {
    const response = NextResponse.redirect(`${origin}/?whoop=${flag}`);
    // path must match connect's set() — a bare delete normalizes to Path=/
    // and the browser treats that as a different cookie (reviewer finding 2)
    response.cookies.delete({ name: "whoop_oauth_state", path: "/api/whoop" });
    return response;
  };

  if (!whoopConfigured()) return home("unconfigured");
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return home("denied");

  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get("whoop_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return home("state-mismatch");
  }

  try {
    const db = getDb();
    await migrate(db);
    await exchangeCode(db, HOUSEHOLD_ID, code, `${origin}/api/whoop/callback`);
  } catch (error) {
    console.error("whoop callback exchange failed:", error);
    return home("error");
  }
  return home("connected");
}
