import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import {
  parseProfileValues,
  readProfile,
  setProfileValues,
} from "@/lib/profile";

let db: Client;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
});

describe("nutrition onboarding profile", () => {
  it("validates the bounded profile contract", () => {
    expect(parseProfileValues({ direction: "Get leaner", units: "imperial" })).toEqual({
      ok: true,
      values: { direction: "Get leaner", units: "imperial" },
    });
    expect(parseProfileValues({ unknown: "x" }).ok).toBe(false);
    expect(parseProfileValues({ age: 35 }).ok).toBe(false);
  });

  it("persists progress and overwrites each key without losing the rest", async () => {
    await setProfileValues(db, "hh-jake", {
      onboarding_step: "2",
      direction: "Get leaner",
      hard_restrictions: "peanuts",
    });
    await setProfileValues(db, "hh-jake", { onboarding_step: "3", units: "metric" });
    expect(await readProfile(db, "hh-jake")).toEqual({
      onboarding_step: "3",
      direction: "Get leaner",
      hard_restrictions: "peanuts",
      units: "metric",
    });
  });
});
