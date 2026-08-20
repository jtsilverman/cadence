import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, whoopConfigured } from "@/lib/whoop";

// Start the whoop OAuth dance: mint a single-use state (CSRF gate, verified
// at callback via cookie), redirect to whoop's authorize page.
export async function GET(request: Request) {
  if (!whoopConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET not set" },
      { status: 503 }
    );
  }
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const state = randomUUID();
  const response = NextResponse.redirect(
    authorizeUrl(`${origin}/api/whoop/callback`, state),
    302 // next defaults to 307; the criterion (and OAuth convention) says 302
  );
  response.cookies.set("whoop_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax", // still sent on whoop's top-level redirect back to us
    maxAge: 600,
    path: "/api/whoop",
  });
  return response;
}
