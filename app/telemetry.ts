"use client";

// Client telemetry (charter Layer 4): first-party view/step tracking, a
// breadcrumb ring, and error capture. One module, mounted once per surface
// (SiteNav for marketing, the product layout for the app). Failures are
// always swallowed — telemetry must never break the page.

type Crumb = { ts: string; what: string };

const crumbs: Crumb[] = [];
let errorHandlersInstalled = false;
let surface: "site" | "app" = "site";

export function breadcrumb(what: string): void {
  crumbs.push({ ts: new Date().toISOString(), what });
  if (crumbs.length > 20) crumbs.shift();
}

function post(url: string, body: unknown): void {
  try {
    const payload = JSON.stringify(body);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    } else {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never let telemetry throw
  }
}

export function track(kind: string, props: Record<string, unknown> = {}): void {
  breadcrumb(`${kind}${props.step ? `:${props.step}` : ""}${props.cta ? `:${props.cta}` : ""}`);
  post("/api/analytics", { kind, path: window.location.pathname, surface, props });
}

export function reportError(message: string, stack?: string): void {
  post("/api/errors", {
    message,
    stack,
    route: window.location.pathname,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    breadcrumbs: crumbs.slice(),
  });
}

export function installTelemetry(which: "site" | "app"): void {
  surface = which;
  if (errorHandlersInstalled) return;
  errorHandlersInstalled = true;
  window.addEventListener("error", (event) => {
    reportError(String(event.message ?? "window.onerror"), event.error?.stack);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportError(
      `unhandledrejection: ${reason instanceof Error ? reason.message : String(reason)}`,
      reason instanceof Error ? reason.stack : undefined
    );
  });
}
