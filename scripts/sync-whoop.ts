// Whoop backfill / incremental sync. Talks to the official v2 API with the
// tokens already stored by Connect Whoop, refreshes them when they expire,
// and writes RecoveryLogged / SleptLogged / SessionLogged / ExertionLogged.
// Re-running a window skips unchanged records.
//
//   npx tsx scripts/sync-whoop.ts              # last 2 days
//   npx tsx scripts/sync-whoop.ts --days 30    # backfill
//
// Reads WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET from the environment or
// .env.local. Tokens live in the app database (wearable_tokens), never in git.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb, migrate } from "../lib/db";
import { readTokens, whoopConfigured } from "../lib/whoop";
import { syncWhoop } from "../lib/whoop-ingest";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function daysArg(): number {
  const i = process.argv.indexOf("--days");
  if (i === -1) return 2;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 1 || n > 366) {
    console.error("--days must be an integer from 1 to 366");
    process.exit(1);
  }
  return n;
}

async function main(): Promise<void> {
  loadEnvFile(resolve(".env.local"));
  loadEnvFile(resolve(".env"));

  const household = process.env.HOUSEHOLD_ID ?? "hh-jake";
  const days = daysArg();

  if (!whoopConfigured()) {
    console.error("WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET are not set");
    process.exit(1);
  }

  const db = getDb();
  await migrate(db);
  if ((await readTokens(db, household)) === null) {
    console.error(`whoop is not connected for ${household} — open /api/whoop/connect first`);
    process.exit(1);
  }

  const result = await syncWhoop(db, household, days);
  console.log(JSON.stringify({ ok: true, source: "whoop", days, household, ...result }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
