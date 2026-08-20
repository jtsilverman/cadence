import { createClient, type Client } from "@libsql/client";

// Turso in deploy; local file fallback for dev; tests pass :memory: clients explicitly.
// Memoized: per-request createClient leaks file handles in a warm process (next dev).
let client: Client | undefined;
export function getDb(): Client {
  client ??= createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return client;
}

// Phase 1 schema: events (the diary), library, pantry_view (derived cache), profile.
// household_id on every user-data table from day 1.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    user_id TEXT,
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    source TEXT NOT NULL,
    payload TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    precision TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_household_ts ON events (household_id, ts)`,
  `CREATE TABLE IF NOT EXISTS library (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    plan TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pantry_view (
    household_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty REAL,
    unit TEXT,
    precision TEXT NOT NULL,
    asserted_at TEXT NOT NULL,
    PRIMARY KEY (household_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS prefs_view (
    household_id TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    size TEXT,
    note TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (household_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS profile (
    household_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (household_id, key)
  )`,
  // Pre-signup marketing capture: no household exists yet, so no household_id.
  // The attribution chain (utm_* -> variant -> cta) is the whole validation
  // signal: where they came from, which pitch they read, which button converted.
  // Survey answers land on the same row so a lead is one record, not two.
  `CREATE TABLE IF NOT EXISTS waitlist (
    email TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cta TEXT,
    variant TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    survey_pick TEXT,
    survey_tools TEXT,
    survey_features TEXT,
    survey_price TEXT,
    survey_wish TEXT,
    survey_call_optin INTEGER,
    surveyed_at TEXT
  )`,
  // Unanswered objections: what people ask is why non-converters bounce.
  // Email is optional — a question with no reply address is still signal.
  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL
  )`,
  // Observability (evals/charter.md Layer 4). First-party only: no third-party
  // trackers; props carry no PII beyond household_id.
  `CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    path TEXT,
    household_id TEXT,
    props TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events (ts)`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_kind_ts ON analytics_events (kind, ts)`,
  // Error capture, both sides: enough context to answer "where did it go
  // wrong" without replaying the user (route, viewport, breadcrumbs / stack).
  `CREATE TABLE IF NOT EXISTS error_events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    side TEXT NOT NULL,
    route TEXT,
    message TEXT NOT NULL,
    stack TEXT,
    context TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_errors_ts ON error_events (ts)`,
  `CREATE TABLE IF NOT EXISTS wearable_tokens (
    household_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (household_id, provider)
  )`,
];

// Additive columns on existing tables (SCHEMA's CREATE IF NOT EXISTS won't
// touch a table that already exists). Check-then-ALTER; a parallel cold-start
// request can ALTER between our check and execute, so a failed ALTER is
// re-checked against the live column list before it's allowed to throw.
const COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: "pantry_view",
    column: "expires",
    ddl: "ALTER TABLE pantry_view ADD COLUMN expires TEXT",
  },
  // waitlist shipped with email/source/created_at only; attribution + survey
  // columns land on rows already captured under the earlier shape.
  ...["cta", "variant", "utm_source", "utm_medium", "utm_campaign", "survey_pick", "survey_tools", "survey_features", "survey_price", "survey_wish", "surveyed_at"].map(
    (column) => ({
      table: "waitlist",
      column,
      ddl: `ALTER TABLE waitlist ADD COLUMN ${column} TEXT`,
    })
  ),
  {
    table: "waitlist",
    column: "survey_call_optin",
    ddl: "ALTER TABLE waitlist ADD COLUMN survey_call_optin INTEGER",
  },
];

async function hasColumn(db: Client, table: string, column: string): Promise<boolean> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  return info.rows.some((row) => row.name === column);
}

// Once per client per process: routes call migrate() on every request, and
// re-running 7 DDLs + a PRAGMA each time is pure waste (the client itself is
// already memoized above). Fresh test clients each migrate once.
const migrated = new WeakSet<Client>();

export async function migrate(db: Client): Promise<void> {
  if (migrated.has(db)) return;
  for (const ddl of SCHEMA) {
    await db.execute(ddl);
  }
  for (const { table, column, ddl } of COLUMNS) {
    if (await hasColumn(db, table, column)) continue;
    try {
      await db.execute(ddl);
    } catch (error) {
      // lost the race to a parallel migrate — fine iff the column now exists
      if (!(await hasColumn(db, table, column))) throw error;
    }
  }
  migrated.add(db);
}
