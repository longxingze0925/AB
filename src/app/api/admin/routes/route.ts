import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/guard";
import { normalizeUploadImagePath } from "@/lib/uploads";

export const runtime = "nodejs";

const FIELDS = [
  "name",
  "entry_domain",
  "exit_domain",
  "real_target_type",
  "external_url",
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

function cleanTargetType(value: unknown): "internal" | "external" {
  return value === "external" ? "external" : "internal";
}

function cleanExternalUrl(value: unknown): string {
  return String(value || "").trim();
}

function cleanBody(body: any) {
  const out: Record<string, string | number> = {};
  for (const field of FIELDS) {
    if (field === "entry_domain" || field === "exit_domain") out[field] = cleanDomain(body[field]);
    else if (field === "real_target_type") out[field] = cleanTargetType(body[field]);
    else if (field === "external_url") out[field] = cleanExternalUrl(body[field]);
    else if (NUMERIC.has(field)) out[field] = Number(body[field] || 0);
    else if (field === "image_path" || field === "cloak_decoy_image_path") {
      out[field] = normalizeUploadImagePath(body[field]);
    } else out[field] = String(body[field] || "").trim();
  }
  if (out.real_target_type === "external") {
    out.exit_domain = "";
  } else {
    out.external_url = "";
  }
  out.title = out.title || "下载";
  out.cloak_threshold = Math.max(1, Number(out.cloak_threshold || 8));
  out.cloak_token_hours = Math.max(1, Number(out.cloak_token_hours || 6));
  return out;
}

function validateRoute(row: Record<string, string | number>): string | null {
  if (!row.entry_domain) return "入口域名不能为空";
  if (row.real_target_type === "external") {
    if (!row.external_url) return "外部网站 URL 不能为空";
    try {
      const url = new URL(String(row.external_url));
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "外部网站 URL 必须以 http:// 或 https:// 开头";
      }
    } catch {
      return "外部网站 URL 格式不正确";
    }
    return null;
  }
  if (!row.exit_domain) return "内部出口模式下出口域名不能为空";
  return null;
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
      const error = validateRoute(row);
      if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
      db.prepare(
        `
        INSERT INTO landing_routes (
          name, entry_domain, exit_domain, real_target_type, external_url, title, image_path, apk_url, auto_download,
          cloak_enabled, cloak_threshold, cloak_token_hours,
          cloak_decoy_title, cloak_decoy_image_path, cloak_decoy_apk_url, enabled
        ) VALUES (
          @name, @entry_domain, NULLIF(@exit_domain, ''), @real_target_type, @external_url, @title, @image_path, @apk_url, @auto_download,
          @cloak_enabled, @cloak_threshold, @cloak_token_hours,
          @cloak_decoy_title, @cloak_decoy_image_path, @cloak_decoy_apk_url, @enabled
        )
      `
      ).run(row);
    } else if (action === "update") {
      const id = Number(body.id || 0);
      if (!id) return NextResponse.json({ ok: false, error: "缺少线路 ID" }, { status: 400 });
      const row = cleanBody(body);
      const error = validateRoute(row);
      if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
      db.prepare(
        `
        UPDATE landing_routes SET
          name=@name,
          entry_domain=@entry_domain,
          exit_domain=NULLIF(@exit_domain, ''),
          real_target_type=@real_target_type,
          external_url=@external_url,
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
