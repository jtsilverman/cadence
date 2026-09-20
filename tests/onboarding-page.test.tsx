import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OnboardingPage from "@/app/(product)/onboarding/page";
import { draftTwoWeeks, proposeCalories } from "@/lib/onboarding-plan";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("nutrition-only onboarding", () => {
  it("starts with nutrition goals and no workout promise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: true, profile: {} }) })));
    const { container } = render(<OnboardingPage />);
    expect(await screen.findByRole("button", { name: "Get leaner" })).toBeTruthy();
    expect(screen.queryByText(/train|strength|workout/i)).toBeNull();
    expect(container.textContent).not.toMatch(/training days/i);
  });

  it("restores durable progress with units and hard restrictions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        ok: true,
        profile: {
          onboarding_step: "3",
          direction: "Get leaner",
          activity: "moderate",
          sex: "m",
          weight: "82",
          height: "178",
          age: "35",
          units: "metric",
          hard_restrictions: "peanuts",
        },
      }),
    })));
    render(<OnboardingPage />);
    expect(await screen.findByLabelText("Weight (kg)")).toHaveProperty("value", "82");
    expect(screen.getByLabelText("Hard food restrictions")).toHaveProperty("value", "peanuts");
  });

  it("uses stated activity in the adjustable calorie proposal", () => {
    const basics = { sex: "m" as const, weightLb: 180, heightIn: 70, age: 35 };
    const sedentary = proposeCalories(basics, "Maintain my weight", "sedentary");
    const active = proposeCalories(basics, "Maintain my weight", "high");
    expect(active).toBeGreaterThan(sedentary);
    expect(proposeCalories(basics, "Get leaner", "moderate")).toBeLessThan(
      proposeCalories(basics, "Maintain my weight", "moderate"),
    );
  });

  it("drafts two complete Monday-start weeks with meals and snacks", () => {
    const draft = draftTwoWeeks(
      [
        { library_id: "eggs", title: "Eggs and toast" },
        { library_id: "bowl", title: "Chicken bowl" },
      ],
      "2026-09-19",
    );

    expect(draft).toHaveLength(14);
    expect(draft[0].date).toBe("2026-09-14");
    expect(draft[13].date).toBe("2026-09-27");
    for (const day of draft) {
      expect(day.slots).toHaveLength(4);
      expect(day.slots.map((slot) => slot.title.split(" · ")[0])).toEqual([
        "Breakfast",
        "Lunch",
        "Snack",
        "Dinner",
      ]);
      expect(day.slots.map((slot) => slot.time)).toEqual(["08:00", "12:30", "16:00", "19:00"]);
    }
  });

  it("never drafts a seeded meal that violates a hard restriction", () => {
    const draft = draftTwoWeeks(
      [
        { library_id: "peanut", title: "Peanut noodles" },
        { library_id: "rice", title: "Rice and beans" },
      ],
      "2026-09-19",
      "peanuts",
    );
    expect(draft).toHaveLength(14);
    expect(draft.flatMap((day) => day.slots).every((slot) => slot.library_id === "rice")).toBe(true);
  });
});
