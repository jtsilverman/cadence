import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { APP_SESSION_COOKIE, verifyAppSession } from "./lib/app-auth";
import { isPublicSitePath } from "./lib/site-gate";

const PUBLIC_PRIVATE_ACCESS = new Set(["/app-login", "/api/app-login", "/api/whoop/webhook"]);

// Production keeps the marketing funnel public and the single-household app
// behind a signed, httpOnly session. Missing configuration fails closed.
export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (isPublicSitePath(pathname)) return NextResponse.next();
  if (PUBLIC_PRIVATE_ACCESS.has(pathname)) return NextResponse.next();

  // Internal diagnostics never become part of the private phone product.
  if (pathname === "/dev" || pathname.startsWith("/dev/")) {
    return new NextResponse(null, { status: 404 });
  }

  const authenticated = await verifyAppSession(
    request.cookies.get(APP_SESSION_COOKIE)?.value,
    process.env.APP_ACCESS_SECRET,
  );
  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, reason: "private app authentication required" }, { status: 401 });
  }
  const login = new URL("/app-login", request.url);
  login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip Next internals and any file with an extension (static assets).
  matcher: ["/((?!_next/|.*\\.).*)"],
};
