import { NextRequest, NextResponse } from "next/server";
import { getVisitById, markDownloaded } from "@/lib/visit";
import { sendMetaEventForVisit } from "@/lib/meta";

export const runtime = "nodejs";

// 标记某访客已触发下载
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body.id || 0);
    if (id > 0) {
      const visit = getVisitById(id);
      if (visit?.page_variant === "real") {
        markDownloaded(id);
        void sendMetaEventForVisit({
          visitId: id,
          eventName: "Lead",
          eventId: String(body.eventId || `lead_${id}`),
          headers: req.headers,
          eventSourceUrl: String(body.url || ""),
          fbp: body.fbp,
          fbc: body.fbc,
          fbclid: body.fbclid,
        });
      }
    }
  } catch {}
  return NextResponse.json({ ok: true });
}
