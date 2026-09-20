import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import JournalPage from "@/app/(product)/journal/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("nutrition journal", () => {
  it("writes a reflection, shows sleep context, and preserves corrected meals", async () => {
    let journalReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("kind=meals")) return { json: async () => ({ ok: true, entries: [
        { event_id: "meal-1", date: "2026-09-19", title: "Old lunch", retracted: true, precision: "estimated" },
      ] }) };
      if (url.includes("kind=sleep")) return { json: async () => ({ ok: true, entries: [
        { date: "2026-09-19", hours: 7.5, quality: "good", score: 82, source: "whoop" },
      ] }) };
      if (url.includes("kind=journal")) {
        journalReads += 1;
        return { json: async () => ({ ok: true, entries: journalReads > 1 ? [
          { date: "2026-09-19", text: "Lunch timing worked.", mood: 4 },
        ] : [] }) };
      }
      if (url === "/api/reflect") return { json: async () => ({
        ok: true,
        review: { week_start: "2026-09-14", meals: { planned: 4, done: 3 }, journal_count: journalReads > 1 ? 1 : 0 },
        streaks: {},
        prompt: { text: "What made meals easier?" },
      }) };
      if (url === "/api/log" && init?.method === "POST") return { json: async () => ({ ok: true, event_id: "journal-1" }) };
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<JournalPage />);

    expect(await screen.findByText("7.5 hours")).toBeTruthy();
    expect(screen.getByText("score 82")).toBeTruthy();
    expect(screen.getByText("corrected or removed")).toBeTruthy();

    await user.type(screen.getByLabelText("Journal note"), "Lunch timing worked.");
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Journal entry saved to your diary.")).toBeTruthy();
    expect(screen.getByText("Lunch timing worked.")).toBeTruthy();
    const logCall = fetchMock.mock.calls.find(([url]) => url === "/api/log");
    expect(JSON.parse(String((logCall?.[1] as RequestInit).body))).toEqual({
      kind: "journal",
      text: "Lunch timing worked.",
      mood: 4,
    });
    await waitFor(() => expect(journalReads).toBe(2));
  });

  it("corrects a manual food log and refreshes the visible diary trail", async () => {
    let mealReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("kind=meals")) {
        mealReads += 1;
        return { json: async () => ({ ok: true, entries: mealReads > 1 ? [
          { event_id: "meal-2", date: "2026-09-18", title: "two eggs and toast", library_id: "meal-2", manual_log: true, source: "web", precision: "estimated" },
          { event_id: "meal-1", date: "2026-09-19", title: "eggs", library_id: "meal-1", manual_log: true, source: "web", precision: "estimated", retracted: true },
        ] : [
          { event_id: "meal-1", date: "2026-09-19", title: "eggs", library_id: "meal-1", manual_log: true, source: "web", precision: "estimated" },
        ] }) };
      }
      if (url.includes("kind=journal") || url.includes("kind=sleep")) {
        return { json: async () => ({ ok: true, entries: [] }) };
      }
      if (url === "/api/reflect") return { json: async () => ({ ok: true, review: null, streaks: {} }) };
      if (url === "/api/log/correct" && init?.method === "POST") {
        return { json: async () => ({ ok: true, event_id: "meal-2" }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<JournalPage />);

    await user.click(await screen.findByRole("button", { name: "Correct" }));
    await user.clear(screen.getByLabelText("Corrected food"));
    await user.type(screen.getByLabelText("Corrected food"), "two eggs and toast");
    await user.clear(screen.getByLabelText("Corrected date"));
    await user.type(screen.getByLabelText("Corrected date"), "2026-09-18");
    await user.type(screen.getByLabelText("Corrected quantity"), "2");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByText("Food log corrected in your diary.")).toBeTruthy();
    expect(screen.getByText("two eggs and toast")).toBeTruthy();
    expect(screen.getByText("corrected or removed")).toBeTruthy();
    const correction = fetchMock.mock.calls.find(([url]) => url === "/api/log/correct");
    expect(JSON.parse(String((correction?.[1] as RequestInit).body))).toEqual({
      event_id: "meal-1",
      title: "two eggs and toast",
      date: "2026-09-18",
      quantity: 2,
      unit: "serving",
    });
    await waitFor(() => expect(mealReads).toBe(2));
  });
});
