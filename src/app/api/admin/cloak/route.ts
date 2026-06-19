import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { requireAuth } from "@/lib/guard";

export const runtime = "nodejs";

const KEYS = [
  "cloak_enabled",
  "cloak_threshold",
  "cloak_token_hours",
  "cloak_decoy_apk_url",
  "cloak_decoy_image_url",
  "cloak_decoy_title",
];

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
    if (typeof body[k] === "string") setSetting(k, body[k]);
  }
  return NextResponse.json({ ok: true });
}
