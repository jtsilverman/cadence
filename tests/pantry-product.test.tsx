import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PantryPage from "@/app/(product)/nutrition/pantry/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("product pantry", () => {
  it("shows expiry ideas and supports explicit edit and removal", async () => {
    const payload = {
      ok: true,
      items: [{ name: "milk", qty: 1, unit: "l", expires: "2026-09-21", cooks_left: 2 }],
      expiring: [{ name: "milk", expires: "2026-09-21" }],
      use_soon: [{
        name: "milk",
        expires: "2026-09-21",
        recipes: [{ library_id: "recipe-1", title: "Overnight oats" }],
      }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) !== "/api/pantry") throw new Error(`unexpected fetch ${input}`);
      return { json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PantryPage />);

    expect(await screen.findByText(/1 l.*2 cooks left.*expires 2026-09-21/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Overnight oats" }).getAttribute("href")).toBe("/nutrition/cook/recipe-1");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const quantity = screen.getByLabelText("Quantity");
    await user.clear(quantity);
    await user.type(quantity, "0.5");
    await user.click(screen.getByRole("button", { name: "Add" }));

    const editCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String((editCall?.[1] as RequestInit).body))).toEqual({
      name: "milk",
      qty: 0.5,
      unit: "l",
      expires: "2026-09-21",
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));
    const postBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(postBodies).toContainEqual({ name: "milk", removed: true });
    expect(await screen.findByText("milk removed from the pantry.")).toBeTruthy();
  });

  it("submits unknown quantities honestly as null", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      json: async () => ({ ok: true, items: [], expiring: [], use_soon: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PantryPage />);

    await user.type(screen.getByLabelText("Item name"), "cinnamon");
    await user.click(screen.getByRole("button", { name: "Add" }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      name: "cinnamon",
      qty: null,
      unit: null,
    });
  });
});
