import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import NutritionPage from "@/app/(product)/nutrition/page";
import AddFoodPage from "@/app/(product)/nutrition/library/new/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("nutrition food intake and cooking entry points", () => {
  it("connects the main Nutrition screen to intake and cook mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        json: async () => url.includes("/api/schedule")
          ? { ok: true, days: [] }
          : {
              ok: true,
              foods: [{ id: "recipe-1", kind: "recipe", title: "Chicken bowl", source_url: "manual", created_at: "now", has_nutrition: false }],
            },
      };
    }));

    render(<NutritionPage />);
    expect(screen.getByRole("link", { name: /add food/i }).getAttribute("href")).toBe(
      "/nutrition/library/new",
    );
    const recipe = await screen.findByRole("link", { name: /chicken bowl/i });
    expect(recipe.getAttribute("href")).toBe("/nutrition/cook/recipe-1");
  });

  it("logs an unplanned meal on a chosen day and can undo it", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/schedule") return { json: async () => ({ ok: true, days: [] }) };
      if (url === "/api/foods") return { json: async () => ({ ok: true, foods: [] }) };
      if (url === "/api/log" && init?.method === "POST") {
        return { json: async () => ({ ok: true, event_id: "food-1", days: [] }) };
      }
      if (url === "/api/retract" && init?.method === "POST") {
        return { json: async () => ({ ok: true, days: [] }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NutritionPage />);

    await user.type(screen.getByLabelText("Food eaten"), "two eggs and toast");
    await user.type(screen.getByLabelText("Food quantity"), "2");
    await user.click(screen.getByRole("button", { name: "Log food" }));
    expect(await screen.findByText("Logged: two eggs and toast.")).toBeTruthy();
    const logCall = fetchMock.mock.calls.find(([url]) => url === "/api/log");
    expect(JSON.parse(String((logCall?.[1] as RequestInit).body))).toEqual({
      kind: "food",
      title: "two eggs and toast",
      date: today,
      quantity: 2,
      unit: "serving",
    });

    await user.click(screen.getByRole("button", { name: "Undo last log" }));
    expect(await screen.findByText("Removed: two eggs and toast.")).toBeTruthy();
    const undoCall = fetchMock.mock.calls.find(([url]) => url === "/api/retract");
    expect(JSON.parse(String((undoCall?.[1] as RequestInit).body))).toEqual({ event_id: "food-1" });
  });

  it("saves a manually entered recipe and exposes its cook receipt path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => ({
      json: async () => String(input).includes("/api/recipes")
        ? { ok: true, library_id: "manual-1" }
        : { ok: false },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AddFoodPage />);
    await user.click(screen.getByRole("button", { name: "Enter a recipe manually" }));
    await user.type(screen.getByLabelText("Title"), "Jake's pasta");
    await user.type(screen.getByLabelText("Ingredient 1 name"), "pasta");
    await user.type(screen.getByLabelText("Step 1"), "Boil the pasta.");
    await user.click(screen.getByRole("button", { name: "Save to library" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const cook = await screen.findByRole("link", { name: "Open cook mode" });
    expect(cook.getAttribute("href")).toBe("/nutrition/cook/manual-1");
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      title: "Jake's pasta",
      source_url: "manual",
      ingredients: [{ name: "pasta" }],
      steps: ["Boil the pasta."],
    });
  });

  it("saves a packaged product by hand and reports it without a cook link", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => ({
      json: async () => String(input).includes("/api/foods")
        ? { ok: true, library_id: "prod-1", kind: "product" }
        : { ok: false },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AddFoodPage />);
    await user.click(screen.getByRole("button", { name: "Packaged product" }));
    await user.type(screen.getByLabelText("Name"), "Skyr vanilla");
    await user.type(screen.getByLabelText("Brand"), "Siggi's");
    await user.type(screen.getByLabelText("Barcode"), "00000000");
    await user.click(screen.getByRole("button", { name: "Save to library" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByText("Skyr vanilla")).toBeTruthy();
    // A product has no steps, so offering cook mode would be a dead end.
    expect(screen.queryByRole("link", { name: "Open cook mode" })).toBeNull();
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      kind: "product",
      title: "Skyr vanilla",
      brand: "Siggi's",
      upc: "00000000",
    });
    expect(body.nutrition).toBeUndefined();
  });

  it("refuses to send a half-filled macro block rather than saving invented zeros", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      json: async () => ({ ok: true, library_id: "s-1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AddFoodPage />);
    await user.click(screen.getByRole("button", { name: "Snack" }));
    await user.type(screen.getByLabelText("Name"), "Almonds");
    await user.type(screen.getByLabelText("Calories"), "170");

    expect(screen.getByRole("button", { name: "Save to library" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/all four macros/i);

    await user.type(screen.getByLabelText("Protein grams"), "6");
    await user.type(screen.getByLabelText("Carb grams"), "6");
    await user.type(screen.getByLabelText("Fat grams"), "15");
    await user.click(screen.getByRole("button", { name: "Save to library" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.nutrition).toMatchObject({
      calories: 170,
      protein_g: 6,
      basis: "per_serving",
      confidence: "low",
    });
  });

  it("lists every food kind in the library and marks unknown macros honestly", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
      json: async () => String(input).includes("/api/schedule")
        ? { ok: true, days: [] }
        : {
            ok: true,
            foods: [
              { id: "p-1", kind: "product", title: "Skyr", source_url: null, created_at: "now", has_nutrition: true },
              { id: "i-1", kind: "ingredient", title: "Rolled oats", source_url: null, created_at: "now", has_nutrition: false },
            ],
          },
    })));

    render(<NutritionPage />);
    expect(await screen.findByText("Skyr")).toBeTruthy();
    expect(screen.getByText("product")).toBeTruthy();
    expect(screen.getByText(/ingredient · macros unknown/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /rolled oats/i })).toBeNull();
  });

  it("puts an invented recipe into editable review without saving it", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => ({
      json: async () => String(input) === "/api/foods/invent"
        ? {
            ok: true,
            plan: {
              plan_version: 1,
              kind: "recipe",
              title: "Chicken rice bowl",
              servings: 2,
              total_minutes: 25,
              ingredients: [{ name: "chicken", qty: 1, unit: "lb", confidence: "high" }],
              steps: ["Cook the chicken."],
              source_url: "invented",
              confidence: { title: "high", servings: "high", total_minutes: "low" },
            },
          }
        : { ok: false },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AddFoodPage />);

    await user.type(screen.getByLabelText("What should Cadence invent?"), "something with chicken and rice");
    await user.click(screen.getByRole("button", { name: "Invent a recipe" }));

    expect(await screen.findByDisplayValue("Chicken rice bowl")).toBeTruthy();
    expect(screen.getByText("Review before saving")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({ wish: "something with chicken and rice" });
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/recipes")).toBe(false);
  });
});

describe("favorites on the real screen", () => {
  it("toggles the star from the server's re-read library, never optimistically", async () => {
    let favorite = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/schedule") return { json: async () => ({ ok: true, days: [] }) };
      if (url === "/api/foods/favorite") {
        favorite = true;
        return { json: async () => ({ ok: true, foods: [row()] }) };
      }
      return { json: async () => ({ ok: true, foods: [row()] }) };
    });
    const row = () => ({
      id: "m-1",
      kind: "meal",
      title: "Two eggs and toast",
      source_url: null,
      created_at: "now",
      has_nutrition: false,
      favorite,
      times_eaten: 2,
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NutritionPage />);
    const star = await screen.findByRole("button", { name: "Favorite Two eggs and toast" });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/eaten 2 times/)).toBeTruthy();

    await user.click(star);

    const on = await screen.findByRole("button", { name: "Unfavorite Two eggs and toast" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/foods/favorite");
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      library_id: "m-1",
      favorite: true,
    });
  });

  it("offers the favorite prompt on a repeat eat, not on the first one", async () => {
    let firstTime = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/schedule") return { json: async () => ({ ok: true, days: [] }) };
      if (url === "/api/log") {
        const body = { ok: true, event_id: "e-1", days: [], library_id: "m-1", first_time: firstTime };
        firstTime = false;
        return { json: async () => body };
      }
      return { json: async () => ({ ok: true, foods: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NutritionPage />);
    await user.type(screen.getByLabelText("Food eaten"), "two eggs and toast");
    await user.click(screen.getByRole("button", { name: "Log food" }));
    await screen.findByText("Logged: two eggs and toast.");
    expect(screen.queryByText("Second time eating this")).toBeNull();

    await user.type(screen.getByLabelText("Food eaten"), "two eggs and toast");
    await user.click(screen.getByRole("button", { name: "Log food" }));
    expect(await screen.findByText("Second time eating this")).toBeTruthy();
  });
});
