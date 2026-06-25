import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/guard";
import {
  deleteLandingTemplate,
  listLandingTemplates,
  saveTemplateZip,
} from "@/lib/landing-templates";

export const runtime = "nodejs";

export async function GET() {
  const deny = await requireAuth();
  if (deny) return deny;
  return NextResponse.json({ ok: true, rows: listLandingTemplates() });
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const form = await req.formData();
  const action = String(form.get("action") || "upload");

  try {
    if (action === "upload") {
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ ok: false, error: "请选择模板 ZIP 文件" }, { status: 400 });
      }
      const name = String(form.get("name") || "").trim();
      const tpl = await saveTemplateZip(file, name);
      return NextResponse.json({ ok: true, row: tpl });
    }

    if (action === "delete") {
      const id = Number(form.get("id") || 0);
      if (!id) return NextResponse.json({ ok: false, error: "缺少模板 ID" }, { status: 400 });
      await deleteLandingTemplate(id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "未知操作" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "操作失败" }, { status: 400 });
  }
}
