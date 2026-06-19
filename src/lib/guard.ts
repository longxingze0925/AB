import { NextResponse } from "next/server";
import { getSession } from "./auth";

// 在 admin API 路由开头调用;未登录返回 401 响应,已登录返回 null
export async function requireAuth(): Promise<NextResponse | null> {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  return null;
}
