import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CoachDock, TabBar } from "@/app/(product)/shell";

afterEach(cleanup);

describe("nutrition-only product shell", () => {
  it("shows only the current nutrition surfaces", () => {
    render(<TabBar />);

    const labels = screen.getAllByRole("link").map((link) => link.textContent);
    expect(labels).toEqual(["Today", "Nutrition", "Journal"]);
    expect(screen.queryByRole("link", { name: "Feed" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Workouts" })).toBeNull();
  });

  it("keeps the coach one tap away", () => {
    render(<CoachDock />);
    expect(
      screen.getByRole("link", { name: /log a meal, ask anything/i }).getAttribute("href"),
    ).toBe("/coach");
  });
});
