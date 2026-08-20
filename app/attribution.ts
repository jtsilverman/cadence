"use client";

// Client half of the validation instrument. Two jobs, both done once per visit:
// remember where the visitor came from (UTM params, which vanish the moment
// they navigate), and pin the hero variant they were shown so a conversion can
// be attributed to one pitch.
//
// sessionStorage, not a cookie: it survives the scroll and the thanks-page
// redirect, dies with the tab, and needs no consent banner.

const KEY = "cadence.attribution";

export const HERO_VARIANTS = ["outcome", "magic", "drudgery"] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];

export interface Attribution {
  variant: HeroVariant;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

function isVariant(value: string | null): value is HeroVariant {
  return value !== null && (HERO_VARIANTS as readonly string[]).includes(value);
}

// A visitor who reloads or scrolls must see the same pitch — a variant that
// re-rolls mid-visit attributes the signup to the wrong hero. But an explicit
// arrival (a fresh campaign link, or ?v= while testing) always wins: stored
// values are the fallback, never an override.
export function attribution(): Attribution {
  if (typeof window === "undefined") return { variant: "magic" };

  let stored: Partial<Attribution> = {};
  const raw = window.sessionStorage.getItem(KEY);
  if (raw) {
    try {
      stored = JSON.parse(raw) as Partial<Attribution>;
    } catch {
      // unreadable value: treat as absent
    }
  }

  const params = new URLSearchParams(window.location.search);
  const forced = params.get("v");
  // A new campaign link means a new visit's worth of attribution: don't let the
  // previous campaign's utm values leak onto it.
  const arriving = ["utm_source", "utm_medium", "utm_campaign"].some((k) => params.get(k));

  const current: Attribution = {
    variant: isVariant(forced)
      ? forced
      : isVariant(stored.variant ?? null)
        ? (stored.variant as HeroVariant)
        : HERO_VARIANTS[Math.floor(Math.random() * HERO_VARIANTS.length)],
  };
  for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const value = params.get(key) ?? (arriving ? null : stored[key]);
    if (value) current[key] = value;
  }

  window.sessionStorage.setItem(KEY, JSON.stringify(current));
  return current;
}

// Which button started the conversion. Every CTA on the page anchors to the one
// capture form, so without this every signup would read as "the form".
const CTA_KEY = "cadence.cta";

export function rememberCta(cta: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(CTA_KEY, cta);
}

export function lastCta(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.sessionStorage.getItem(CTA_KEY) ?? fallback;
}

// The address that just joined, handed to the thanks page so the survey can
// attach to that lead. Kept out of the URL: an email in a query string ends up
// in history, referrers, and analytics.
const JOINED_KEY = "cadence.joined";

export function rememberJoined(email: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(JOINED_KEY, email);
}

export function joinedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(JOINED_KEY);
}
