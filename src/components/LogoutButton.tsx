"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }
  return (
    <button onClick={logout} className="admin-nav-link" style={{ width: "100%", border: 0, cursor: "pointer" }}>
      退出登录
    </button>
  );
}
