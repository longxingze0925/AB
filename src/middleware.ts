import { NextRequest, NextResponse } from "next/server";

// 把当前路径写入请求头,供 server 组件(如 admin layout)判断是否登录页
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = {
  matcher: ["/admin/:path*"],
};
