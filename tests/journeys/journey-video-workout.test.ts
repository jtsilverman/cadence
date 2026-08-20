// J16 — "I share a workout video the same way I share a recipe; it lands in
// my library as a structured template with the video attached, re-sharing it
// updates instead of duplicating, and it can never masquerade as a recipe."
// (PRODUCT.md:22, UX.md:83.)

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post } from "./harness";

let app: App;

const VIDEO_URL = "https://www.youtube.com/watch?v=pushday123";
const WORKOUT = {
  title: "Garage Push Day",
  exercises: [
    { name: "Bench Press", sets: 4, reps: 8 },
    { name: "Overhead Press", sets: 3, reps: 10, weight: 95, unit: "lb" },
  ],
  source_url: VIDEO_URL,
  source_embed: { provider: "youtube", video_id: "pushday123" },
};

beforeAll(async () => {
  app = await loadApp();
});

describe("J16: a workout video becomes a template", () => {
  let libraryId: string;

  it("an extracted workout saves with its video attached", async () => {
    const res = await post(app.workouts, WORKOUT);
    expect(res.status).toBe(200);
    libraryId = res.body.library_id;

    const view = await get(app.workoutById, { params: { id: libraryId } });
    expect(view.status).toBe(200);
    expect(view.body.plan.source_url).toBe(VIDEO_URL);
    expect(view.body.plan.source_embed).toEqual({ provider: "youtube", video_id: "pushday123" });
    expect(view.body.plan.plan_version).toBe(2);
  });

  it("re-sharing the same video updates the template instead of stacking a duplicate", async () => {
    const revised = {
      ...WORKOUT,
      title: "Garage Push Day v2",
      exercises: [{ name: "Bench Press", sets: 5, reps: 5 }],
    };
    const res = await post(app.workouts, revised);
    expect(res.status).toBe(200);
    expect(res.body.library_id).toBe(libraryId); // same row, updated

    const list = await get(app.workouts);
    const mine = list.body.workouts.filter((w: any) =>
      w.title.startsWith("Garage Push Day")
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe("Garage Push Day v2");
  });

  it("a different video is a different template", async () => {
    const other = {
      ...WORKOUT,
      title: "Leg Day",
      source_url: "https://www.youtube.com/watch?v=legday456",
      source_embed: { provider: "youtube", video_id: "legday456" },
    };
    const res = await post(app.workouts, other);
    expect(res.status).toBe(200);
    expect(res.body.library_id).not.toBe(libraryId);
  });

  it("a manual workout with no source still saves like always", async () => {
    const res = await post(app.workouts, {
      title: "Freestyle Pull",
      exercises: [{ name: "Row", sets: 3, reps: 12 }],
    });
    expect(res.status).toBe(200);
  });

  it("a workout can never masquerade as a recipe", async () => {
    const res = await post(app.recipes, {
      source_url: VIDEO_URL,
      kind: "workout",
      title: "Sneaky Workout",
      exercises: [{ name: "Curl", sets: 3, reps: 12 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.reason.toLowerCase()).toContain("workout");
  });

  it("hostile: junk source fields are refused with reasons", async () => {
    const bads = [
      { ...WORKOUT, title: "X1", source_url: "ftp://nope" },
      { ...WORKOUT, title: "X2", source_embed: { provider: "vimeo", video_id: "v" } },
      { ...WORKOUT, title: "X3", source_embed: { provider: "youtube" } },
    ];
    for (const body of bads) {
      const res = await post(app.workouts, body);
      expect(res.status).toBe(422);
      expect(res.body.reason).toBeTruthy();
    }
  });

  it("the extract intake refuses garbage bodies like every other POST", async () => {
    const extract = (await import("@/app/api/recipes/extract/route")) as any;
    expect((await post(extract, "not json")).status).toBe(400);
    expect((await post(extract, { url: "gopher://old" })).status).toBe(422);
  });
});
