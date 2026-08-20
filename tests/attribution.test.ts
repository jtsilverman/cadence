// The client half of the validation instrument. These assert the rules that
// decide which pitch a conversion is credited to — get them wrong and the A/B
// test reads the wrong winner.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { attribution, HERO_VARIANTS } from "@/app/attribution";

// Minimal stand-in for the browser: the module only ever touches
// window.location.search and window.sessionStorage, both at call time.
function browserAt(search: string) {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    location: { search },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  return {
    goTo(next: string) {
      (globalThis as any).window.location.search = next;
    },
  };
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe("visit attribution", () => {
  it("assigns one of the hero variants when the visitor arrives cold", () => {
    browserAt("");
    expect(HERO_VARIANTS).toContain(attribution().variant);
  });

  it("shows the same pitch on a reload — a re-rolled variant credits the wrong hero", () => {
    const nav = browserAt("?v=magic");
    expect(attribution().variant).toBe("magic");
    nav.goTo(""); // reload / scroll / anchor navigation, no params
    expect(attribution().variant).toBe("magic");
  });

  it("a fresh campaign link wins over what the tab already remembered", () => {
    const nav = browserAt("?utm_source=reddit&utm_campaign=mealprep&v=outcome");
    expect(attribution().utm_source).toBe("reddit");
    nav.goTo("?utm_source=twitter&utm_campaign=launch&v=drudgery");
    const second = attribution();
    expect(second.variant).toBe("drudgery");
    expect(second.utm_source).toBe("twitter");
    expect(second.utm_campaign).toBe("launch");
  });

  it("a new campaign never inherits the previous campaign's other utm fields", () => {
    const nav = browserAt("?utm_source=reddit&utm_medium=social&utm_campaign=weightroom");
    attribution();
    nav.goTo("?utm_source=newsletter");
    const second = attribution();
    expect(second.utm_source).toBe("newsletter");
    expect(second.utm_medium).toBeUndefined();
    expect(second.utm_campaign).toBeUndefined();
  });

  it("an unknown ?v= value falls back to a real variant instead of recording junk", () => {
    browserAt("?v=not-a-variant");
    expect(HERO_VARIANTS).toContain(attribution().variant);
  });
});
