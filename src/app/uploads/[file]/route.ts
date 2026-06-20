import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { IMAGE_CONTENT_TYPES, uploadDir } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { file: string } }) {
  const file = params.file;
  if (!/^[a-zA-Z0-9._-]+$/.test(file)) {
    return new NextResponse("not found", { status: 404 });
  }

  const ext = path.extname(file).toLowerCase();
  const contentType = IMAGE_CONTENT_TYPES[ext];
  if (!contentType) return new NextResponse("not found", { status: 404 });

  try {
    const bytes = await fs.readFile(path.join(uploadDir(), file));
    return new NextResponse(bytes, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
