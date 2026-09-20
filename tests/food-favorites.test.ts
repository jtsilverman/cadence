import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { recordLog } from "@/lib/logs";
import { ensureLoggedFood, listFoods, readFavorites, setFavorite } from "@/lib/library";
import { readEvents } from "@/lib/events";
import { appendEvent, newEventId } from "@/lib/events";
import { LOG_RETRACTED, RECIPE_COOKED } from "@/lib/contracts";

const HH = "hh-jake";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

describe("auto-save: eating a food puts it in the library", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("creates one library row the first time and reuses it after that", async () => {
    const first = await ensureLoggedFood(db, HH, "two eggs and toast");
    const second = await ensureLoggedFood(db, HH, "  Two Eggs And Toast ");

    expect(first.first_time).toBe(true);
    expect(second.first_time).toBe(false);
    expect(second.library_id).toBe(first.library_id);
    expect(await listFoods(db, HH, ["meal"])).toHaveLength(1);
  });

  it("points the food log's receipt at that durable row, not a throwaway id", async () => {
    await recordLog(db, HH, { kind: "food", title: "two eggs and toast", date: today });
    await recordLog(db, HH, { kind: "food", title: "two eggs and toast", date: today });

    const events = await readEvents(db, HH, { type: RECIPE_COOKED });
    const ids = events.map((event) => (event.payload as { library_id: string }).library_id);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).not.toMatch(/^manual-/);

    const [food] = await listFoods(db, HH, ["meal"]);
    expect(food.id).toBe(ids[0]);
    expect(food.times_eaten).toBe(2);
  });

  it("saves the plate with no invented parts or macros", async () => {
    await recordLog(db, HH, { kind: "food", title: "two eggs and toast", date: today });
    const [food] = await listFoods(db, HH, ["meal"]);
    expect(food.has_nutrition).toBe(false);
    expect(food.source_url).toBeNull();
  });

  it("is household-scoped: another household's plate is a different row", async () => {
    const mine = await ensureLoggedFood(db, HH, "oatmeal");
    const theirs = await ensureLoggedFood(db, "hh-other", "oatmeal");
    expect(theirs.library_id).not.toBe(mine.library_id);
    expect(theirs.first_time).toBe(true);
  });
});

describe("favorites", () => {
  let db: Client;
  let libraryId: string;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    libraryId = (await ensureLoggedFood(db, HH, "two eggs and toast")).library_id;
  });

  it("defaults to not favorited and shows on the library read", async () => {
    expect(await readFavorites(db, HH)).toEqual(new Set());
    expect((await listFoods(db, HH, ["meal"]))[0].favorite).toBe(false);
  });

  it("toggles last-write-wins, so a double tap settles on the final state", async () => {
    await setFavorite(db, HH, libraryId, true);
    await setFavorite(db, HH, libraryId, true);
    expect((await listFoods(db, HH, ["meal"]))[0].favorite).toBe(true);

    await setFavorite(db, HH, libraryId, false);
    expect((await listFoods(db, HH, ["meal"]))[0].favorite).toBe(false);
    expect(await readFavorites(db, HH)).toEqual(new Set());
  });

  it("keeps the whole trail in the diary — nothing is deleted", async () => {
    await setFavorite(db, HH, libraryId, true);
    await setFavorite(db, HH, libraryId, false);
    expect(await readEvents(db, HH, { type: "FoodFavorited" })).toHaveLength(2);
  });

  it("is household-scoped", async () => {
    await setFavorite(db, HH, libraryId, true);
    expect(await readFavorites(db, "hh-other")).toEqual(new Set());
  });
});

describe("times_eaten honesty", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("drops a retracted log from the count instead of leaving it inflated", async () => {
    const { event_id } = await recordLog(db, HH, {
      kind: "food",
      title: "two eggs and toast",
      date: today,
    });
    await recordLog(db, HH, { kind: "food", title: "two eggs and toast", date: today });
    expect((await listFoods(db, HH, ["meal"]))[0].times_eaten).toBe(2);

    await appendEvent(db, {
      event_id: newEventId(),
      household_id: HH,
      type: LOG_RETRACTED,
      ts: new Date().toISOString(),
      source: "web",
      payload: { retracted_event_id: event_id },
      schema_version: 1,
      precision: "exact",
    });
    expect((await listFoods(db, HH, ["meal"]))[0].times_eaten).toBe(1);
  });
});
