import { NextRequest, NextResponse } from "next/server";
import { updateVisitClient } from "@/lib/visit";

export const runtime = "nodejs";

// 客户端回填:屏幕/时区/网络/指纹
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body.id || 0);
    if (id > 0) {
      updateVisitClient(id, {
        screen: body.screen,
        timezone: body.timezone,
        network: body.network,
        fingerprint: body.fingerprint,
      });
    }
  } catch {
    // 忽略错误,采集不阻塞
  }
  return NextResponse.json({ ok: true });
}
