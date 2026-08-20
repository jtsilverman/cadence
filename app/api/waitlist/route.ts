import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { joinWaitlist, normalizeEmail, parseAttribution } from "@/lib/waitlist";
import { track } from "@/lib/observe";

// No GET: this table holds strangers' email addresses on a public site, so
// there is no route that lists them. Read the leads from the DB directly.
export async function POST(request: Request) {
  // Pre-hydration / no-JS submits arrive form-encoded (the form's native
  // action): bank the conversion and redirect to thanks, so a slow connection
  // never silently loses a signup. Attribution lives client-side and can't
  // ride this path; the email is the conversion.
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("form")) {
    const form = await request.formData();
    const email = normalizeEmail(form.get("email"));
    if (!email) {
      // the browser's own required+type=email blocks almost all of these;
      // server-side rejects return to the form
      return NextResponse.redirect(new URL("/waitlist", request.url), 303);
    }
    const db = getDb();
    await migrate(db);
    await joinWaitlist(db, email, parseAttribution({ cta: "waitlist-page-nojs" }));
    await track(db, { kind: "waitlist_submit", path: "/api/waitlist", props: { cta: "waitlist-page-nojs" } });
    return NextResponse.redirect(new URL("/waitlist/thanks", request.url), 303);
  }
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const email = normalizeEmail(read.body.email);
  if (!email) {
    return NextResponse.json({ ok: false, reason: "valid email required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const attr = parseAttribution(read.body);
  await joinWaitlist(db, email, attr);
  await track(db, {
    kind: "waitlist_submit",
    path: "/api/waitlist",
    props: { cta: attr.cta ?? "", variant: attr.variant ?? "", utm_source: attr.utm_source ?? "" },
  });
  return NextResponse.json({ ok: true });
}
