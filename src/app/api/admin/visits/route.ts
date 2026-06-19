import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";

export const runtime = "nodejs";

// 访问记录列表,支持按推广码筛选 + 分页
export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const sp = req.nextUrl.searchParams;
  const promo = sp.get("promo") || "";
  const page = Math.max(1, Number(sp.get("page") || 1));
  const size = Math.min(200, Math.max(10, Number(sp.get("size") || 50)));
  const offset = (page - 1) * size;

  const db = getDb();
  const where = promo ? "WHERE promo_code = ?" : "";
  const args = promo ? [promo] : [];

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM visits ${where}`).get(...args) as { n: number }).n;
  const rows = db
    .prepare(`SELECT * FROM visits ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, size, offset);

  return NextResponse.json({ ok: true, rows, total, page, size });
}
