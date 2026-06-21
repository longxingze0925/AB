import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import AdminNav from "@/components/AdminNav";
import LogoutButton from "@/components/LogoutButton";
import "./admin.css";

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
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-title">APK 分发后台</div>
          <div className="admin-brand-subtitle">线路 / 推广 / 分流</div>
        </div>
        <AdminNav />
        <div className="admin-sidebar-footer">
          <LogoutButton />
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
