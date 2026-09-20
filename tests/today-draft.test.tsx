import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import TodayPage from "@/app/(product)/today/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("living nutrition draft on the real week screen", () => {
  it("shows, approves, and receipts the next-week proposal", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/goals") return { json: async () => ({ ok: true, goals: [{ kind: "nutrition" }] }) };
      if (url === "/api/recipes") return { json: async () => ({ ok: true, recipes: [] }) };
      if (url === "/api/plan/draft") return {
        json: async () => ({
          ok: true,
          suggestion_id: "draft-1",
          draft: {
            reason: "four meals from your library",
            days: [{
              date: "2026-09-21",
              slots: [
                { title: "Oats", meal_type: "breakfast", time: "08:00" },
                { title: "Bowl", meal_type: "lunch", time: "12:30" },
                { title: "Apple", meal_type: "snack", time: "16:00" },
                { title: "Pasta", meal_type: "dinner", time: "19:00" },
              ],
            }],
          },
        }),
      };
      if (url === "/api/plan/resolve") return { json: async () => ({ ok: true }) };
      if (url === "/api/schedule") return { json: async () => ({ ok: true, days: [] }) };
      throw new Error(`unexpected fetch ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TodayPage />);
    await user.click(await screen.findByRole("tab", { name: "Week" }));
    await user.click(await screen.findByRole("button", { name: "Review next week draft" }));
    expect(await screen.findByText(/breakfast: Oats.*dinner: Pasta/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Approve next week" }));
    expect(await screen.findByText("Next week approved and on the calendar.")).toBeTruthy();

    const resolveCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/plan/resolve");
    expect(resolveCall).toBeTruthy();
    expect(JSON.parse(String((resolveCall?.[1] as RequestInit).body))).toEqual({
      suggestion_id: "draft-1",
      outcome: "accepted",
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("records a direct meal skip and exposes its repair receipt", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    let scheduleReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/goals") return { json: async () => ({ ok: true, goals: [{ kind: "nutrition" }] }) };
      if (url === "/api/recipes") return { json: async () => ({ ok: true, recipes: [] }) };
      if (url === "/api/schedule") {
        scheduleReads += 1;
        return { json: async () => ({
          ok: true,
          days: [{ date: today, slots: [{ slot_id: "lunch-1", lane: "meal", title: "Chicken bowl", status: scheduleReads > 1 ? "skipped" : "planned", library_id: "bowl" }] }],
        }) };
      }
      if (url === "/api/log") return { json: async () => ({
        ok: true,
        event_id: "skip-1",
        days: [{
          date: today,
          slots: [{ slot_id: "lunch-1", lane: "meal", title: "Chicken bowl", status: "skipped", library_id: "bowl" }],
          repair_proposals: [{ suggestion_id: "repair-1", option: "drop", reason: "let the missed meal go", recommended: true }],
        }],
      }) };
      if (url === "/api/plan/resolve") return { json: async () => ({ ok: true }) };
      throw new Error(`unexpected fetch ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TodayPage />);

    await user.click(await screen.findByRole("button", { name: "Skipped" }));
    expect(await screen.findByText("let the missed meal go")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Apply drop" }));
    expect(await screen.findByText("Repair approved and on the calendar.")).toBeTruthy();
    const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/plan/resolve");
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      suggestion_id: "repair-1",
      outcome: "accepted",
    });
  });

  it("connects Whoop to Today and surfaces recovery after sync", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/goals") return { json: async () => ({ ok: true, goals: [{ kind: "nutrition" }] }) };
      if (url === "/api/recipes") return { json: async () => ({ ok: true, recipes: [] }) };
      if (url === "/api/whoop/status") return { json: async () => ({ ok: true, configured: true, connected: true }) };
      if (url === "/api/whoop/sync") return { json: async () => ({ ok: true, inserted: 2 }) };
      if (url === "/api/schedule") return { json: async () => ({
        ok: true,
        days: [{ date: today, slots: [], recovery: { score: 82, hrv: 61, resting_hr: 49 } }],
      }) };
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TodayPage />);

    expect(await screen.findByText("Whoop recovery")).toBeTruthy();
    expect(screen.getByText(/HRV 61.*resting 49/)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "Sync recent data" }));
    expect(await screen.findByText("Whoop synced. Recovery and sleep context are up to date.")).toBeTruthy();
  });
});
