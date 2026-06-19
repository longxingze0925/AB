"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }
  return (
    <button
      onClick={logout}
      style={{
        width: "100%",
        padding: "8px",
        background: "#374151",
        color: "#e5e7eb",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      退出登录
    </button>
  );
}
