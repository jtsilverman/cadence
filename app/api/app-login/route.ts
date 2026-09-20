import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  APP_SESSION_COOKIE,
  APP_SESSION_TTL_MS,
  createAppSession,
} from "@/lib/app-auth";

function safeNext(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/today";
}

function sameSecret(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.APP_ACCESS_SECRET;
  if (!expected || expected.length < 20) {
    return NextResponse.json(
      { ok: false, reason: "private app access is not configured" },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const password = form.get("password");
  const next = safeNext(form.get("next"));
  if (typeof password !== "string" || !sameSecret(password, expected)) {
    const denied = new URL("/app-login", request.url);
    denied.searchParams.set("error", "1");
    denied.searchParams.set("next", next);
    return NextResponse.redirect(denied, 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(APP_SESSION_COOKIE, await createAppSession(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(APP_SESSION_TTL_MS / 1_000),
  });
  return response;
}
