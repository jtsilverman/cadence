import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { extractRecipe } from "@/lib/extract";

// The intake gesture (spec workout-video-extraction): one URL in, whichever
// kind the content is out — plan.kind discriminates. Review-only: nothing is
// saved until the user POSTs to /api/recipes or /api/workouts.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const url = read.body.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return NextResponse.json(
      { ok: false, reason: "a valid http(s) URL is required" },
      { status: 422 }
    );
  }
  const result = await extractRecipe(url);
  // failures are failures at the HTTP layer too — a guarded host or a dead
  // page must never read as 200 to a client checking status
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
