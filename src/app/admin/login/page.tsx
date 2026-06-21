"use client";

import { useState } from "react";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    setLoading(false);
    if (res.ok) {
      window.location.href = "/admin";
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "登录失败");
    }
  }

  return (
    <main className="admin-shell" style={{ alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} className="admin-card" style={{ width: 360, padding: 28 }}>
        <h1 className="admin-page-title" style={{ fontSize: 22 }}>后台登录</h1>
        <p className="admin-page-desc" style={{ marginBottom: 20 }}>登录 APK 分发后台</p>
        <input
          placeholder="账号"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="admin-input"
          style={{ marginBottom: 12 }}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="admin-input"
          style={{ marginBottom: 12 }}
        />
        {err && <p className="admin-alert admin-alert-danger">{err}</p>}
        <button type="submit" disabled={loading} className="admin-btn admin-btn-primary" style={{ width: "100%" }}>
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}
