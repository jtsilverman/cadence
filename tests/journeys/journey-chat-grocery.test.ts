process.env.TURSO_DATABASE_URL = ":memory:";

import { beforeAll, describe, expect, it } from "vitest";
import { runChat, type ChatModelCall } from "@/lib/chat";
import { getDb, migrate } from "@/lib/db";
import { loadApp, post, type App } from "./harness";

let app: App;

beforeAll(async () => {
  app = await loadApp();
  await migrate(getDb());
});

const listModel: ChatModelCall = async () =>
  JSON.stringify({
    intent: "list_add",
    items: [],
    plan_ops: [],
    skip_meal: null,
    list_items: [{ name: "paper towels", qty: 2, unit: "roll" }],
    goal_calories: null,
    reply: "Added.",
  });

describe("chat grocery receipt converges with the real list", () => {
  it("an item claimed as added appears through the cart API", async () => {
    const outcome = await runChat(
      getDb(),
      "hh-jake",
      { text: "add two rolls of paper towels", history: [], nowISO: new Date().toISOString() },
      listModel,
    );
    expect(outcome.reply).toContain("Added to the list: paper towels");

    const cart = await post(app.cart, {});
    expect(cart.status).toBe(200);
    expect(cart.body.toBuy).toContainEqual({
      name: "paper towels",
      qty: 2,
      unit: "roll",
      sources: ["added by chat"],
    });
  });
});
