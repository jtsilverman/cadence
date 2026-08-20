"use client";

// Stores arriving attribution (UTM params + variant) the moment any marketing
// page loads. attribution() reads the URL and persists to sessionStorage; UTM
// params vanish on the first navigation, so if no page captures them at
// arrival the signup row records nothing — which is exactly what happened when
// the v4 rebuild deleted the hero A/B component, the only caller on the
// landing. Rendered by SiteNav so every page is an arrival page.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { attribution } from "./attribution";
import { installTelemetry, track } from "./telemetry";

export function CaptureAttribution() {
  const pathname = usePathname();
  useEffect(() => {
    installTelemetry("site");
  }, []);
  useEffect(() => {
    const stored = attribution();
    track("page_view", {
      utm_source: stored.utm_source ?? "",
      variant: stored.variant,
    });
  }, [pathname]);
  return null;
}
