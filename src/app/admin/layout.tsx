import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 登录页本身不需要鉴权:用请求路径判断
  const h = headers();
  const pathname = h.get("x-pathname") || h.get("x-invoke-path") || "";
  const isLoginPage = pathname.endsWith("/admin/login");

  const session = await getSession();
  if (!session && !isLoginPage) {
    redirect("/admin/login");
  }

  // 登录页:直接渲染,不套后台框架
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <aside style={{ width: 200, background: "#111827", color: "#e5e7eb", padding: "20px 0" }}>
        <div style={{ padding: "0 20px 20px", fontWeight: 700, fontSize: 16 }}>管理后台</div>
        <nav style={{ display: "flex", flexDirection: "column" }}>
          <NavLink href="/admin" label="数据总览" />
          <NavLink href="/admin/routes" label="线路管理" />
          <NavLink href="/admin/promos" label="推广码" />
          <NavLink href="/admin/visits" label="访问记录" />
        </nav>
        <div style={{ padding: "20px" }}>
          <LogoutButton />
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, overflow: "auto" }}>{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{ padding: "10px 20px", color: "#e5e7eb", textDecoration: "none", fontSize: 14 }}
    >
      {label}
    </Link>
  );
}
