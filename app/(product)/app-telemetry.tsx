"use client";

// Product-surface telemetry mount (charter Layer 4): screen views on every
// route change + client error capture with breadcrumbs. Action events are
// tracked server-side in the routes that commit them.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installTelemetry, track } from "../telemetry";

export function AppTelemetry() {
  const pathname = usePathname();
  useEffect(() => {
    installTelemetry("app");
  }, []);
  useEffect(() => {
    if (pathname) track("screen_view", { screen: pathname });
  }, [pathname]);
  return null;
}
