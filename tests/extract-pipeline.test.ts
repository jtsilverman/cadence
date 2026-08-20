import { describe, it, expect, afterEach, vi } from "vitest";
import { hasPageFixtures } from "./fixture-guard";
import { readFileSync } from "node:fs";
import { extractRecipe } from "@/lib/extract";

const URL = "https://example.com/recipe";

const MODEL_JSON = JSON.stringify({
  title: "Chili",
  servings: 6,
  total_minutes: 45,
  ingredients: [{ name: "olive oil", qty: 2, unit: "Tbsp", confidence: "high" }],
  steps: ["Saute onion.", "Simmer."],
  confidence: { title: "high", servings: "high", total_minutes: "high" },
});

function mockPageFetch(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.skipIf(!hasPageFixtures)("extractRecipe", () => {
  it("returns a plan for a good page + valid model output", async () => {
    mockPageFetch(200, readFileSync("tests/fixtures/budgetbytes-chili.html", "utf8"));
    const result = await extractRecipe(URL, async () => MODEL_JSON);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.title).toBe("Chili");
      expect(result.plan.source_url).toBe(URL);
    }
  });

  it("fails gracefully on a non-OK page fetch without calling the model", async () => {
    mockPageFetch(403, "blocked");
    const model = vi.fn(async () => MODEL_JSON);
    const result = await extractRecipe(URL, model);
    expect(result).toEqual({ ok: false, reason: "page fetch failed (HTTP 403)" });
    expect(model).not.toHaveBeenCalled();
  });

  it("fails gracefully when the page has no usable content", async () => {
    mockPageFetch(200, "<html><body>hi</body></html>");
    const model = vi.fn(async () => MODEL_JSON);
    const result = await extractRecipe(URL, model);
    expect(result.ok).toBe(false);
    expect(model).not.toHaveBeenCalled();
  });

  it("refuses to fetch private/internal hosts (SSRF guard)", async () => {
    const pageFetch = vi.fn();
    vi.stubGlobal("fetch", pageFetch);
    const model = vi.fn(async () => MODEL_JSON);
    const blocked = [
      "http://localhost:3000/api/health",
      "http://127.0.0.1/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://172.20.1.1/",
      "http://192.168.1.1/",
      "http://[::1]/",
      "http://foo.internal/x",
    ];
    for (const url of blocked) {
      const result = await extractRecipe(url, model);
      expect(result.ok, url).toBe(false);
    }
    expect(pageFetch).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });

  it("rejects oversized responses instead of processing them", async () => {
    mockPageFetch(200, "<html>" + "x".repeat(3_500_000) + "</html>");
    const model = vi.fn(async () => MODEL_JSON);
    const result = await extractRecipe(URL, model);
    expect(result.ok).toBe(false);
    expect(model).not.toHaveBeenCalled();
  });

  it("fails gracefully when the model call throws", async () => {
    mockPageFetch(200, readFileSync("tests/fixtures/budgetbytes-chili.html", "utf8"));
    const result = await extractRecipe(URL, async () => {
      throw new Error("api down");
    });
    expect(result).toEqual({ ok: false, reason: "extraction model call failed" });
  });
});
