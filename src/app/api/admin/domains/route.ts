import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";

export const runtime = "nodejs";

// type = "entry" | "exit" 决定操作哪张表
function table(type: string) {
  return type === "exit" ? "exit_domains" : "entry_domains";
}

// 列出某类域名
export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const type = req.nextUrl.searchParams.get("type") || "entry";
  const rows = getDb().prepare(`SELECT * FROM ${table(type)} ORDER BY id DESC`).all();
  return NextResponse.json({ ok: true, rows });
}

// 新增域名 / 切换当前 / 删除
export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const body = await req.json();
  const { action, type } = body;
  const t = table(type);
  const db = getDb();

  try {
    if (action === "add") {
      const domain = String(body.domain || "").trim().toLowerCase();
      if (!domain) return NextResponse.json({ ok: false, error: "域名不能为空" }, { status: 400 });
      db.prepare(`INSERT INTO ${t} (domain, note) VALUES (?, ?)`).run(domain, body.note || "");
    } else if (action === "setCurrent") {
      const id = Number(body.id);
      const tx = db.transaction(() => {
        db.prepare(`UPDATE ${t} SET is_current = 0`).run();
        db.prepare(`UPDATE ${t} SET is_current = 1 WHERE id = ?`).run(id);
      });
      tx();
    } else if (action === "delete") {
      db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(Number(body.id));
    } else {
      return NextResponse.json({ ok: false, error: "未知操作" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
