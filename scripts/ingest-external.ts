// Append a Garmin or MyFitnessPal bundle (JSON on stdin or --file) as diary
// events. Mapping lives in lib/external-map.ts; this script is the writer
// the Python sync shells out to. Idempotent: unchanged external_ids skip.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb, migrate } from "../lib/db";
import { mapGarminBundle, mapMfpBundle, type GarminBundle, type MfpBundle } from "../lib/external-map";
import { ingestMapped } from "../lib/ingest";

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

async function main(): Promise<void> {
  loadEnvFile(resolve(".env.local"));
  loadEnvFile(resolve(".env"));

  const fileFlag = process.argv.indexOf("--file");
  const raw =
    fileFlag !== -1
      ? readFileSync(process.argv[fileFlag + 1], "utf8")
      : readFileSync(0, "utf8");

  const bundle = JSON.parse(raw) as { source?: string };
  const household = process.env.HOUSEHOLD_ID ?? "hh-jake";

  const mapped =
    bundle.source === "garmin"
      ? mapGarminBundle(bundle as GarminBundle)
      : bundle.source === "mfp"
        ? mapMfpBundle(bundle as MfpBundle)
        : null;

  if (!mapped || !bundle.source) {
    console.error('bundle.source must be "garmin" or "mfp"');
    process.exit(1);
  }

  const db = getDb();
  await migrate(db);
  const result = await ingestMapped(db, household, bundle.source, mapped);
  console.log(JSON.stringify({ ok: true, source: bundle.source, household, ...result }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
