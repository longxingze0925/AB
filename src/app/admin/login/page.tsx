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
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
      <form onSubmit={submit} style={{ background: "#fff", padding: 32, borderRadius: 12, width: 320, boxShadow: "0 2px 16px rgba(0,0,0,.08)" }}>
        <h1 style={{ fontSize: 20, marginTop: 0, marginBottom: 20 }}>后台登录</h1>
        <input
          placeholder="账号"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {err && <p style={{ color: "#dc2626", fontSize: 13 }}>{err}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 12,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  boxSizing: "border-box",
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 15,
  cursor: "pointer",
};
