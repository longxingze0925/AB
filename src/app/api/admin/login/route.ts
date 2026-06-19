import { NextRequest, NextResponse } from "next/server";
import { verifyLogin, createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { user, password } = await req.json();
    if (await verifyLogin(String(user || ""), String(password || ""))) {
      await createSession(String(user));
      return NextResponse.json({ ok: true });
    }
  } catch {}
  return NextResponse.json({ ok: false, error: "账号或密码错误" }, { status: 401 });
}
