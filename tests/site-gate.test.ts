import { describe, expect, it } from "vitest";
import { isPublicSitePath } from "../lib/site-gate";

describe("isPublicSitePath", () => {
  it("allows the four site pages", () => {
    for (const p of ["/", "/faq", "/waitlist", "/waitlist/thanks"]) {
      expect(isPublicSitePath(p)).toBe(true);
    }
  });

  it("allows the five site APIs", () => {
    for (const p of [
      "/api/waitlist",
      "/api/waitlist/survey",
      "/api/question",
      "/api/analytics",
      "/api/errors",
    ]) {
      expect(isPublicSitePath(p)).toBe(true);
    }
  });

  it("blocks the app and dev surfaces", () => {
    for (const p of [
      "/today",
      "/pantry",
      "/recipes/new",
      "/dev",
      "/dev/ops",
      "/orders",
      "/coach",
      "/onboarding",
      "/week",
      "/workouts/abc",
    ]) {
      expect(isPublicSitePath(p)).toBe(false);
    }
  });

  it("blocks every non-site API", () => {
    for (const p of ["/api/pantry", "/api/chat", "/api/whoop/webhook", "/api/plan"]) {
      expect(isPublicSitePath(p)).toBe(false);
    }
  });

  it("blocks prefix look-alikes", () => {
    for (const p of ["/faqx", "/waitlist2", "/api/waitlistx", "/api/questionnaire"]) {
      expect(isPublicSitePath(p)).toBe(false);
    }
  });

  it("allows sub-paths only under /waitlist and /api/waitlist", () => {
    expect(isPublicSitePath("/waitlist/anything")).toBe(true);
    expect(isPublicSitePath("/api/waitlist/survey/extra")).toBe(true);
    expect(isPublicSitePath("/api/question/extra")).toBe(false);
  });
});
