import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getLandingTemplateById,
  resolveTemplateFile,
  TEMPLATE_CONTENT_TYPES,
} from "@/lib/landing-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; file: string[] } }
) {
  const id = Number(params.id || 0);
  const tpl = getLandingTemplateById(id);
  if (!tpl) return new NextResponse("not found", { status: 404 });

  const filePath = resolveTemplateFile(tpl, params.file || []);
  if (!filePath) return new NextResponse("not found", { status: 404 });

  const ext = path.extname(filePath).toLowerCase();
  const contentType = TEMPLATE_CONTENT_TYPES[ext];
  if (!contentType) return new NextResponse("not found", { status: 404 });

  try {
    const bytes = await fs.readFile(filePath);
    const body = ext === ".html" ? injectBridge(bytes.toString("utf8")) : bytes;
    return new NextResponse(body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}

function injectBridge(html: string): string {
  const script = `
<script>
(function(){
  function sendDownload(){
    try { parent.postMessage({ type: 'landing:download' }, '*'); } catch (_) {}
  }
  window.LandingBridge = { download: sendDownload };
  document.addEventListener('click', function(e){
    var target = e.target;
    var el = target && target.closest ? target.closest('[data-action="download"],[data-download]') : null;
    if (!el) return;
    e.preventDefault();
    sendDownload();
  }, true);
})();
</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  return `${html}${script}`;
}
