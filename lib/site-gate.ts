// The production site gate. While the deploy is marketing-only (no APP_PUBLIC=1),
// only the waitlist-funnel surface is reachable; the unfinished app and the dev
// tools stay private because their pages write to the production database.

const EXACT = new Set([
  "/",
  "/faq",
  "/api/question",
  "/api/analytics",
  "/api/errors",
]);

const PREFIXES = ["/waitlist", "/api/waitlist"];

export function isPublicSitePath(pathname: string): boolean {
  if (EXACT.has(pathname)) return true;
  return PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
