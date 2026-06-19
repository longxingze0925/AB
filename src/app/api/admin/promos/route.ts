import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";

export const runtime = "nodejs";

// 推广码列表(附带每个码的访问数、下载数)
export async function GET() {
  const deny = await requireAuth();
  if (deny) return deny;
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM visits v WHERE v.promo_code = p.code) AS visits,
      (SELECT COUNT(*) FROM visits v WHERE v.promo_code = p.code AND v.downloaded = 1) AS downloads
    FROM promo_codes p ORDER BY p.id DESC
  `).all();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const body = await req.json();
  const db = getDb();
  try {
    if (body.action === "add") {
      const code = String(body.code || "").trim();
      if (!code) return NextResponse.json({ ok: false, error: "推广码不能为空" }, { status: 400 });
      db.prepare("INSERT INTO promo_codes (code, name, apk_url) VALUES (?, ?, ?)").run(
        code,
        body.name || "",
        body.apk_url || ""
      );
    } else if (body.action === "toggle") {
      db.prepare("UPDATE promo_codes SET enabled = 1 - enabled WHERE id = ?").run(Number(body.id));
    } else if (body.action === "delete") {
      db.prepare("DELETE FROM promo_codes WHERE id = ?").run(Number(body.id));
    } else {
      return NextResponse.json({ ok: false, error: "未知操作" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
