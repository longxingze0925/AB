import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";

export const runtime = "nodejs";

// 推广码列表(附带每个码的访问数、下载数)
export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const db = getDb();
  const routeId = Number(req.nextUrl.searchParams.get("route_id") || 0);
  const where = routeId > 0 ? "WHERE p.route_id = ?" : "";
  const args = routeId > 0 ? [routeId] : [];
  const rows = db.prepare(`
    SELECT p.*, r.name AS route_name, r.entry_domain,
      (SELECT COUNT(*) FROM visits v WHERE (v.route_id = p.route_id OR (v.route_id IS NULL AND p.route_id IS NULL)) AND v.promo_code = p.code) AS visits,
      (SELECT COUNT(*) FROM visits v WHERE (v.route_id = p.route_id OR (v.route_id IS NULL AND p.route_id IS NULL)) AND v.promo_code = p.code AND v.downloaded = 1) AS downloads
    FROM promo_codes p
    LEFT JOIN landing_routes r ON r.id = p.route_id
    ${where}
    ORDER BY p.id DESC
  `).all(...args);
  const routes = db
    .prepare("SELECT id, name, entry_domain, exit_domain, enabled FROM landing_routes ORDER BY id DESC")
    .all();
  return NextResponse.json({ ok: true, rows, routes });
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const body = await req.json();
  const db = getDb();
  try {
    if (body.action === "add") {
      const routeId = Number(body.route_id || 0);
      const code = String(body.code || "").trim().toUpperCase();
      if (!routeId) return NextResponse.json({ ok: false, error: "请选择线路" }, { status: 400 });
      if (!code) return NextResponse.json({ ok: false, error: "推广码不能为空" }, { status: 400 });
      const exists = db
        .prepare("SELECT 1 FROM promo_codes WHERE route_id = ? AND code = ? LIMIT 1")
        .get(routeId, code);
      if (exists) return NextResponse.json({ ok: false, error: "该线路下推广码已存在" }, { status: 400 });
      db.prepare("INSERT INTO promo_codes (route_id, code, name, apk_url) VALUES (?, ?, ?, ?)").run(
        routeId,
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
