import { describe, it, expect } from "vitest";
import { hasPageFixtures } from "./fixture-guard";
import { readFileSync } from "node:fs";
import {
  prepareExtractionInput,
  callExtractionModel,
  parseExtraction,
} from "@/lib/extract";

// Golden-set eval: LIVE Claude calls. Run manually:
//   RUN_INTEGRATION=1 ANTHROPIC_API_KEY=... npx vitest run tests/extract-eval.integration.test.ts
const live = describe.runIf(!!process.env.RUN_INTEGRATION);

const RECIPE_FIXTURES = [
  "budgetbytes-chili.html",
  "loveandlemons-bbq.html",
  "recipetineats-butterchicken.html",
  "sallys-cookies.html",
  "smittenkitchen-noodles.html",
  "nytcooking-saag.html",
];

const fixture = (name: string) =>
  readFileSync(`tests/fixtures/${name}`, "utf8");

live("extraction eval (live model)", () => {
  for (const name of RECIPE_FIXTURES) {
    it(
      `extracts a structurally sound recipe from ${name}`,
      { timeout: 60000 },
      async () => {
        const input = prepareExtractionInput(fixture(name));
        const raw = await callExtractionModel(input);
        const result = parseExtraction(raw, `https://fixture/${name}`);

        expect(result.ok, `extraction failed: ${JSON.stringify(result)}`).toBe(
          true
        );
        if (!result.ok) return;
        expect(result.plan.kind).toBe("recipe");
        if (result.plan.kind !== "recipe") return;
        const plan = result.plan;

        // ingredient structure + count bounds
        expect(plan.ingredients.length).toBeGreaterThanOrEqual(2);
        expect(plan.ingredients.length).toBeLessThanOrEqual(40);

        // no-hallucination: most ingredient names must appear in the source input
        const haystack = input.toLowerCase();
        const grounded = plan.ingredients.filter((i) => {
          const words = i.name.toLowerCase().split(/\s+/);
          return words.some((w) => w.length > 3 && haystack.includes(w));
        });
        expect(
          grounded.length / plan.ingredients.length,
          `ungrounded ingredients: ${plan.ingredients
            .map((i) => i.name)
            .join(", ")}`
        ).toBeGreaterThanOrEqual(0.6);

        // step quality: distilled short imperatives, not verbatim prose dumps
        expect(plan.steps.length).toBeGreaterThanOrEqual(2);
        expect(plan.steps.length).toBeLessThanOrEqual(25);
        for (const step of plan.steps) {
          expect(step.length).toBeLessThanOrEqual(400);
        }
      }
    );
  }

  // P2 video-caption golden set: run through the full adapter path (mocked
  // fetch serving the captured real page; live model call).
  const VIDEO_CASES = [
    {
      name: "tiktok-pbcups.html",
      url: "https://www.tiktok.com/@rachel.hornibrook/video/7329248913704176928",
      provider: "tiktok",
      mustGround: ["oats", "peanut butter"],
    },
    {
      name: "youtube-misopasta.html",
      url: "https://www.youtube.com/watch?v=zueVtyUQE64",
      provider: "youtube",
      mustGround: ["miso", "mascarpone"],
    },
  ];
  it(
    "extracts a grounded workout from a youtube training video (youtube-pushday.html)",
    { timeout: 60000 },
    async () => {
      const { extractRecipe } = await import("@/lib/extract");
      const page = fixture("youtube-pushday.html");
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/oembed")) return new Response("{}", { status: 404 });
        if (u.includes("youtube.com/watch")) {
          return new Response(page, { status: 200 });
        }
        return realFetch(u as string, init); // the live Anthropic call
      }) as typeof fetch;
      try {
        const result = await extractRecipe("https://www.youtube.com/watch?v=pushday777");
        expect(result.ok, JSON.stringify(result)).toBe(true);
        if (!result.ok) return;
        expect(result.plan.kind).toBe("workout");
        if (result.plan.kind !== "workout") return;
        expect(result.plan.source_embed?.provider).toBe("youtube");
        expect(result.plan.source_url).toBe("https://www.youtube.com/watch?v=pushday777");
        const names = result.plan.exercises.map((e) => e.name.toLowerCase()).join(" ");
        for (const needle of ["bench press", "overhead press"]) {
          expect(names).toContain(needle);
        }
        // grounded sets/reps, not invented: bench is 4x8 in the caption
        const bench = result.plan.exercises.find((e) =>
          e.name.toLowerCase().includes("bench")
        )!;
        expect(bench.sets).toBe(4);
        expect(bench.reps).toBe(8);
        // the 8-12 range resolves to the lower bound
        const incline = result.plan.exercises.find((e) =>
          e.name.toLowerCase().includes("incline")
        );
        if (incline) expect(incline.reps).toBe(8);
      } finally {
        globalThis.fetch = realFetch;
      }
    }
  );

  for (const c of VIDEO_CASES) {
    it(
      `extracts a grounded recipe from the ${c.provider} caption (${c.name})`,
      { timeout: 60000 },
      async () => {
        const { extractRecipe } = await import("@/lib/extract");
        const page = fixture(c.name);
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
          const u = String(url);
          if (u.includes("/oembed")) return new Response("{}", { status: 404 });
          if (u === c.url) return new Response(page, { status: 200 });
          return realFetch(u as string, init); // the live Anthropic call
        }) as typeof fetch;
        try {
          const result = await extractRecipe(c.url);
          expect(result.ok, JSON.stringify(result)).toBe(true);
          if (!result.ok) return;
          expect(result.plan.kind).toBe("recipe");
          if (result.plan.kind !== "recipe") return;
          expect(result.plan.source_embed?.provider).toBe(c.provider);
          const names = result.plan.ingredients.map((i) => i.name.toLowerCase());
          for (const needle of c.mustGround) {
            expect(names.join(" ")).toContain(needle);
          }
          // no hallucination: ingredient names must appear in the caption
          const caption = page.toLowerCase();
          const grounded = result.plan.ingredients.filter((i) =>
            i.name
              .toLowerCase()
              .split(/\s+/)
              .some((w) => w.length > 3 && caption.includes(w))
          );
          expect(grounded.length / result.plan.ingredients.length).toBeGreaterThanOrEqual(0.6);
        } finally {
          globalThis.fetch = realFetch;
        }
      }
    );
  }

  it(
    "does not fabricate quantities from a link-in-bio caption (tiktok-linkinbio)",
    { timeout: 60000 },
    async () => {
      const { extractRecipe } = await import("@/lib/extract");
      const page = fixture("tiktok-linkinbio.html");
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/oembed")) return new Response("{}", { status: 404 });
        if (u.includes("tiktok.com/@feelgoodfoodie")) return new Response(page, { status: 200 });
        return realFetch(u as string, init);
      }) as typeof fetch;
      try {
        const result = await extractRecipe(
          "https://www.tiktok.com/@feelgoodfoodie/video/7464427716108913951"
        );
        // Honest either way: refusing is fine; extracting is only fine if every
        // ingredient is grounded in the caption (which names no amounts).
        if (result.ok && result.plan.kind === "recipe") {
          const caption = page.toLowerCase();
          for (const ing of result.plan.ingredients) {
            const grounded = ing.name
              .toLowerCase()
              .split(/\s+/)
              .some((w) => w.length > 3 && caption.includes(w));
            expect(grounded, `ungrounded: ${ing.name}`).toBe(true);
          }
        }
      } finally {
        globalThis.fetch = realFetch;
      }
    }
  );

  it(
    "refuses to fabricate a recipe from the bot-block page",
    { timeout: 60000 },
    async () => {
      const input = prepareExtractionInput(fixture("blocked-page.html"));
      // Either the input is too thin to send, or the model must return the error shape.
      if (input.length < 200) return;
      const raw = await callExtractionModel(input);
      const result = parseExtraction(raw, "https://fixture/blocked");
      expect(result.ok).toBe(false);
    }
  );
});
