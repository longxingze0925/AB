import { NextRequest, NextResponse } from "next/server";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { requireAuth } from "@/lib/guard";
import { normalizeUploadImagePath } from "@/lib/uploads";

export const runtime = "nodejs";

const KEYS = ["apk_url", "image_url", "title", "auto_download", "fallback_redirect"];

export async function GET() {
  const deny = await requireAuth();
  if (deny) return deny;
  const out: Record<string, string> = {};
  for (const k of KEYS) out[k] = getSetting(k) || "";
  return NextResponse.json({ ok: true, settings: out });
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const body = await req.json();
  for (const k of KEYS) {
    if (typeof body[k] === "string") {
      setSetting(k, k === "image_url" ? normalizeUploadImagePath(body[k]) : body[k]);
    }
  }
  return NextResponse.json({ ok: true });
}
