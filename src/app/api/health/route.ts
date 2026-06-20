import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getDb().prepare("SELECT 1").get();
  return NextResponse.json({ ok: true });
}
