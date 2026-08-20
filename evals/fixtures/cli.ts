// CLI seeder: `npm run eval:seed -- <fixture> [db-url]` — seed a fixture into
// the eval DB (default evals/.tmp/eval.db) for manual poking outside a run.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { migrate } from "@/lib/db";
import { FIXTURES, seedFixture, type FixtureName } from "./seed";

async function main(): Promise<void> {
  const fixture = process.argv[2];
  if (!FIXTURES.includes(fixture as FixtureName)) {
    console.error(`usage: npm run eval:seed -- <${FIXTURES.join("|")}> [db-url]`);
    process.exit(1);
  }
  const defaultPath = path.resolve(__dirname, "../.tmp/eval.db");
  fs.mkdirSync(path.dirname(defaultPath), { recursive: true });
  const url = process.argv[3] ?? `file:${defaultPath}`;
  const db = createClient({ url });
  await migrate(db);
  await seedFixture(db, fixture as FixtureName);
  console.log(`seeded ${fixture} into ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
