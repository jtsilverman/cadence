// Server-side error capture (charter Layer 4): every uncaught error in a
// route or render lands in error_events with request context — route, method,
// digest — so a live 500 is findable without replaying the user.

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  // only the node runtime has the DB; the edge bundle must not resolve it
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { getDb, migrate } = await import("./lib/db");
    const { recordError } = await import("./lib/observe");
    const db = getDb();
    await migrate(db);
    const error = err instanceof Error ? err : new Error(String(err));
    await recordError(db, {
      side: "server",
      route: `${request.method} ${request.path}`,
      message: error.message,
      stack: error.stack,
      context: {
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
        digest: (error as Error & { digest?: string }).digest,
      },
    });
  } catch (captureError) {
    console.error("[observe] onRequestError capture failed", captureError);
  }
};
