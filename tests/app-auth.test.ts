import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { APP_SESSION_COOKIE, createAppSession, verifyAppSession } from "@/lib/app-auth";
import { middleware } from "@/middleware";

const SECRET = "test-only-secret-with-enough-entropy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("private single-user app access", () => {
  it("signs expiring sessions and rejects tampering", async () => {
    const token = await createAppSession(SECRET, 60_000, 1_700_000_000_000);
    expect(await verifyAppSession(token, SECRET, 1_700_000_030_000)).toBe(true);
    expect(await verifyAppSession(`${token}x`, SECRET, 1_700_000_030_000)).toBe(false);
    expect(await verifyAppSession(token, SECRET, 1_700_000_061_000)).toBe(false);
  });

  it("keeps marketing public but redirects private pages to login", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ACCESS_SECRET", SECRET);

    const site = await middleware(new NextRequest("https://cadence.test/faq"));
    expect(site.headers.get("x-middleware-next")).toBe("1");

    const app = await middleware(new NextRequest("https://cadence.test/today"));
    expect(app.status).toBe(307);
    expect(app.headers.get("location")).toBe("https://cadence.test/app-login?next=%2Ftoday");
  });

  it("returns 401 for private APIs and accepts a valid session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ACCESS_SECRET", SECRET);

    const denied = await middleware(new NextRequest("https://cadence.test/api/schedule"));
    expect(denied.status).toBe(401);

    const token = await createAppSession(SECRET);
    const allowed = await middleware(
      new NextRequest("https://cadence.test/api/schedule", {
        headers: { cookie: `${APP_SESSION_COOKIE}=${token}` },
      }),
    );
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
  });

  it("never exposes dev dashboards in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ACCESS_SECRET", SECRET);
    const token = await createAppSession(SECRET);
    const response = await middleware(
      new NextRequest("https://cadence.test/dev/ops", {
        headers: { cookie: `${APP_SESSION_COOKIE}=${token}` },
      }),
    );
    expect(response.status).toBe(404);
  });
});
