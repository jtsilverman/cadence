import { describe, expect, it } from "vitest";

import { resolveDatabaseConfig } from "@/lib/db";

describe("database deployment configuration", () => {
  it("keeps the local file fallback in development", () => {
    expect(resolveDatabaseConfig({ NODE_ENV: "development" })).toEqual({
      url: "file:local.db",
    });
  });

  it("fails closed instead of using ephemeral files in production", () => {
    expect(() => resolveDatabaseConfig({ NODE_ENV: "production" })).toThrow(
      /durable TURSO_DATABASE_URL/,
    );
    expect(() =>
      resolveDatabaseConfig({
        NODE_ENV: "production",
        TURSO_DATABASE_URL: "file:local.db",
        TURSO_AUTH_TOKEN: "token",
      }),
    ).toThrow(/durable TURSO_DATABASE_URL/);
  });

  it("requires both production Turso values", () => {
    expect(() =>
      resolveDatabaseConfig({
        NODE_ENV: "production",
        TURSO_DATABASE_URL: "libsql://cadence.turso.io",
      }),
    ).toThrow(/TURSO_AUTH_TOKEN/);
    expect(
      resolveDatabaseConfig({
        NODE_ENV: "production",
        TURSO_DATABASE_URL: "libsql://cadence.turso.io",
        TURSO_AUTH_TOKEN: "token",
      }),
    ).toEqual({ url: "libsql://cadence.turso.io", authToken: "token" });
  });
});