import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { prewarmCloak } from "@/lib/cloak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getDb().prepare("SELECT 1").get();
  prewarmCloak();
  return NextResponse.json({ ok: true });
}
