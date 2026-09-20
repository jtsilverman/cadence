import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/app-login/route";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/app-auth";

const SECRET = "test-only-secret-with-enough-entropy";

function request(password: string, next = "/today") {
  const body = new FormData();
  body.set("password", password);
  body.set("next", next);
  return new Request("https://cadence.test/api/app-login", { method: "POST", body });
}

afterEach(() => vi.unstubAllEnvs());

describe("private app login", () => {
  it("rejects a wrong password without a session", async () => {
    vi.stubEnv("APP_ACCESS_SECRET", SECRET);
    const response = await POST(request("wrong"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/app-login?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets a signed httpOnly session and returns to a local path", async () => {
    vi.stubEnv("APP_ACCESS_SECRET", SECRET);
    const response = await POST(request(SECRET, "/nutrition"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://cadence.test/nutrition");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${APP_SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    const token = cookie.match(new RegExp(`${APP_SESSION_COOKIE}=([^;]+)`))?.[1];
    expect(await verifyAppSession(token, SECRET)).toBe(true);
  });

  it("does not redirect to an external host", async () => {
    vi.stubEnv("APP_ACCESS_SECRET", SECRET);
    const response = await POST(request(SECRET, "//evil.test"));
    expect(response.headers.get("location")).toBe("https://cadence.test/today");
  });
});
