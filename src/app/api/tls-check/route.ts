import { NextRequest, NextResponse } from "next/server";
import { isEntryDomain, isExitDomain } from "@/lib/db";

export const runtime = "nodejs";

// Caddy on-demand TLS 校验:只给"主域名 + 入口池 + 出口池"内的域名签证书
// Caddy 会以 ?domain=xxx 请求本接口,返回 200 才签发
export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get("domain") || "").toLowerCase();
  const main = (process.env.MAIN_DOMAIN || "").toLowerCase();

  if (!domain) return new NextResponse("no domain", { status: 400 });

  const allowed = domain === main || isEntryDomain(domain) || isExitDomain(domain);

  return allowed ? new NextResponse("ok", { status: 200 }) : new NextResponse("not allowed", { status: 403 });
}
