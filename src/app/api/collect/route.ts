import { NextRequest, NextResponse } from "next/server";
import { updateVisitClient } from "@/lib/visit";
import { sendMetaEventForVisit } from "@/lib/meta";

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
      void sendMetaEventForVisit({
        visitId: id,
        eventName: "ViewContent",
        eventId: String(body.eventId || `vc_${id}`),
        headers: req.headers,
        eventSourceUrl: String(body.url || ""),
        fbp: body.fbp,
        fbc: body.fbc,
        fbclid: body.fbclid,
      });
    }
  } catch {
    // 忽略错误,采集不阻塞
  }
  return NextResponse.json({ ok: true });
}
