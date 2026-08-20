// Live eval suite config (evals/charter.md). One dev server on :3100 against
// a throwaway DB file, EVAL_MODE=1 so the fixture-reset route exists. Workers
// pinned to 1: stories reset the shared DB, so they must never interleave.

import { defineConfig } from "@playwright/test";

export const EVAL_PORT = 3100;
export const EVAL_DB = "evals/.tmp/eval.db";

export default defineConfig({
  testDir: "evals",
  testMatch: /.*\.eval\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "evals/.tmp/last-run.json" }]],
  outputDir: "evals/.tmp/test-results",
  use: {
    baseURL: `http://localhost:${EVAL_PORT}`,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "site", testDir: "evals/site" },
    { name: "app", testDir: "evals/app" },
  ],
  webServer: {
    command: `mkdir -p evals/.tmp && EVAL_MODE=1 TURSO_DATABASE_URL=file:${EVAL_DB} next dev -p ${EVAL_PORT}`,
    port: EVAL_PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
