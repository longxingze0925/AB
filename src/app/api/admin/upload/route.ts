import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth } from "@/lib/guard";
import { IMAGE_MIME_EXT, uploadDir } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "请选择图片文件" }, { status: 400 });
  }

  const ext = IMAGE_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ ok: false, error: "仅支持 jpg/png/webp/gif 图片" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "图片不能超过 5MB" }, { status: 400 });
  }

  await fs.mkdir(uploadDir(), { recursive: true });
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadDir(), name), bytes);

  return NextResponse.json({ ok: true, path: `/uploads/${name}` });
}
