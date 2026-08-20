import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPublicSitePath } from "./lib/site-gate";

// Marketing-only deploys hide everything but the waitlist funnel.
// APP_PUBLIC=1 opens the full app; dev mode is never gated.
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  if (process.env.APP_PUBLIC === "1") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (isPublicSitePath(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, reason: "not public" }, { status: 404 });
  }
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  // Skip Next internals and any file with an extension (static assets).
  matcher: ["/((?!_next/|.*\\.).*)"],
};
