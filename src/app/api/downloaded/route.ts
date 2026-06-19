import { NextRequest, NextResponse } from "next/server";
import { markDownloaded } from "@/lib/visit";

export const runtime = "nodejs";

// 标记某访客已触发下载
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body.id || 0);
    if (id > 0) markDownloaded(id);
  } catch {}
  return NextResponse.json({ ok: true });
}
