import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";
import { parseCidr } from "@/lib/ip";
import { refreshIpBlacklistCache } from "@/lib/cloak";

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
        return NextResponse.json(
          { ok: false, error: "格式无效，请填 IPv4 / IPv6 / CIDR（如 1.2.3.4、1.2.3.0/24、2605:52c0::/32）" },
          { status: 400 }
        );
      db.prepare("INSERT INTO ip_blacklist (cidr, note) VALUES (?, ?)").run(
        cidr,
        body.note || ""
      );
      refreshIpBlacklistCache();
    } else if (body.action === "delete") {
      db.prepare("DELETE FROM ip_blacklist WHERE id = ?").run(Number(body.id));
      refreshIpBlacklistCache();
    } else {
      return NextResponse.json({ ok: false, error: "未知操作" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

function isValidCidr(s: string): boolean {
  return !!parseCidr(s);
}
