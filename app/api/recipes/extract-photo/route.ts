import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { extractRecipeFromImage } from "@/lib/extract";

// Photo of a cookbook page -> StructuredPlan for review. Same parse gate and
// graceful-failure contract as URL extraction.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const { image_base64, media_type } = body;
  if (typeof image_base64 !== "string" || typeof media_type !== "string") {
    return NextResponse.json(
      { ok: false, reason: "image_base64 and media_type required" },
      { status: 422 }
    );
  }
  const result = await extractRecipeFromImage(image_base64, media_type);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
