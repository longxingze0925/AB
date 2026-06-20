import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";
import { normalizeUploadImagePath } from "@/lib/uploads";

export const runtime = "nodejs";

const FIELDS = [
  "name",
  "entry_domain",
  "exit_domain",
  "title",
  "image_path",
  "apk_url",
  "auto_download",
  "cloak_enabled",
  "cloak_threshold",
  "cloak_token_hours",
  "cloak_decoy_title",
  "cloak_decoy_image_path",
  "cloak_decoy_apk_url",
  "enabled",
] as const;

type Field = (typeof FIELDS)[number];

const NUMERIC = new Set<Field>([
  "auto_download",
  "cloak_enabled",
  "cloak_threshold",
  "cloak_token_hours",
  "enabled",
]);

function cleanDomain(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
}

function cleanBody(body: any) {
  const out: Record<string, string | number> = {};
  for (const field of FIELDS) {
    if (field === "entry_domain" || field === "exit_domain") out[field] = cleanDomain(body[field]);
    else if (NUMERIC.has(field)) out[field] = Number(body[field] || 0);
    else if (field === "image_path" || field === "cloak_decoy_image_path") {
      out[field] = normalizeUploadImagePath(body[field]);
    } else out[field] = String(body[field] || "").trim();
  }
  out.title = out.title || "下载";
  out.cloak_threshold = Math.max(1, Number(out.cloak_threshold || 8));
  out.cloak_token_hours = Math.max(1, Number(out.cloak_token_hours || 6));
  return out;
}

export async function GET() {
  const deny = await requireAuth();
  if (deny) return deny;

  const rows = getDb()
    .prepare(
      `
      SELECT r.*,
        (SELECT COUNT(*) FROM visits v WHERE v.route_id = r.id) AS visits,
        (SELECT COUNT(*) FROM visits v WHERE v.route_id = r.id AND v.downloaded = 1) AS downloads
      FROM landing_routes r
      ORDER BY r.id DESC
    `
    )
    .all();

  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const body = await req.json();
  const action = String(body.action || "");
  const db = getDb();

  try {
    if (action === "add") {
      const row = cleanBody({ ...body, enabled: body.enabled ?? 1 });
      if (!row.entry_domain || !row.exit_domain) {
        return NextResponse.json({ ok: false, error: "入口域名和出口域名不能为空" }, { status: 400 });
      }
      db.prepare(
        `
        INSERT INTO landing_routes (
          name, entry_domain, exit_domain, title, image_path, apk_url, auto_download,
          cloak_enabled, cloak_threshold, cloak_token_hours,
          cloak_decoy_title, cloak_decoy_image_path, cloak_decoy_apk_url, enabled
        ) VALUES (
          @name, @entry_domain, @exit_domain, @title, @image_path, @apk_url, @auto_download,
          @cloak_enabled, @cloak_threshold, @cloak_token_hours,
          @cloak_decoy_title, @cloak_decoy_image_path, @cloak_decoy_apk_url, @enabled
        )
      `
      ).run(row);
    } else if (action === "update") {
      const id = Number(body.id || 0);
      if (!id) return NextResponse.json({ ok: false, error: "缺少线路 ID" }, { status: 400 });
      const row = cleanBody(body);
      if (!row.entry_domain || !row.exit_domain) {
        return NextResponse.json({ ok: false, error: "入口域名和出口域名不能为空" }, { status: 400 });
      }
      db.prepare(
        `
        UPDATE landing_routes SET
          name=@name,
          entry_domain=@entry_domain,
          exit_domain=@exit_domain,
          title=@title,
          image_path=@image_path,
          apk_url=@apk_url,
          auto_download=@auto_download,
          cloak_enabled=@cloak_enabled,
          cloak_threshold=@cloak_threshold,
          cloak_token_hours=@cloak_token_hours,
          cloak_decoy_title=@cloak_decoy_title,
          cloak_decoy_image_path=@cloak_decoy_image_path,
          cloak_decoy_apk_url=@cloak_decoy_apk_url,
          enabled=@enabled,
          updated_at=datetime('now','localtime')
        WHERE id=@id
      `
      ).run({ ...row, id });
    } else if (action === "toggle") {
      db.prepare("UPDATE landing_routes SET enabled = 1 - enabled, updated_at=datetime('now','localtime') WHERE id = ?").run(
        Number(body.id)
      );
    } else if (action === "delete") {
      db.prepare("DELETE FROM landing_routes WHERE id = ?").run(Number(body.id));
    } else {
      return NextResponse.json({ ok: false, error: "未知操作" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
