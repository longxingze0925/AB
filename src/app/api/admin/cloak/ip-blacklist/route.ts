import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";

export const runtime = "nodejs";

export async function GET() {
  const deny = await requireAuth();
  if (deny) return deny;
  const rows = getDb()
    .prepare("SELECT * FROM ip_blacklist ORDER BY id DESC")
    .all();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const body = await req.json();
  const db = getDb();

  try {
    if (body.action === "add") {
      const cidr = String(body.cidr || "").trim();
      if (!cidr) return NextResponse.json({ ok: false, error: "IP 不能为空" }, { status: 400 });
      if (!isValidCidr(cidr))
        return NextResponse.json({ ok: false, error: "格式无效，请填单 IP 或 CIDR（如 1.2.3.4 或 1.2.3.0/24）" }, { status: 400 });
      db.prepare("INSERT INTO ip_blacklist (cidr, note) VALUES (?, ?)").run(
        cidr,
        body.note || ""
      );
    } else if (body.action === "delete") {
      db.prepare("DELETE FROM ip_blacklist WHERE id = ?").run(Number(body.id));
    } else {
      return NextResponse.json({ ok: false, error: "未知操作" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// 简单格式校验：单 IPv4 或 IPv4 CIDR
function isValidCidr(s: string): boolean {
  const cidrRe = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!cidrRe.test(s)) return false;
  const [ip, prefix] = s.split("/");
  const parts = ip.split(".").map(Number);
  if (parts.some((p) => p > 255)) return false;
  if (prefix !== undefined && (Number(prefix) < 0 || Number(prefix) > 32)) return false;
  return true;
}
