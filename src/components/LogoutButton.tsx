"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }
  return (
    <button onClick={logout} className="admin-logout-btn">
      退出登录
    </button>
  );
}
