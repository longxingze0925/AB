"use client";

import { useEffect, useState } from "react";

interface Promo {
  id: number;
  code: string;
  name: string;
  apk_url: string;
  enabled: number;
  visits: number;
  downloads: number;
}

export default function PromosPage() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [entry, setEntry] = useState("");

  async function load() {
    const [p, ov] = await Promise.all([
      fetch("/api/admin/promos").then((r) => r.json()),
      fetch("/api/admin/domains?type=entry").then((r) => r.json()),
    ]);
    if (p.ok) setRows(p.rows);
    if (ov.ok) {
      const cur = ov.rows.find((d: any) => d.is_current);
      setEntry(cur ? cur.domain : "");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function act(action: string, extra: any = {}) {
    await fetch("/api/admin/promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    load();
  }

  function genCode() {
    setCode(Math.random().toString(36).slice(2, 8).toUpperCase());
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>推广码</h1>
      <div style={{ background: "#fff", padding: 20, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="推广码" value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: 1, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }} />
          <button onClick={genCode} style={smallBtn}>随机生成</button>
          <input placeholder="渠道/分站名称" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }} />
          <button
            onClick={() => {
              if (code.trim()) {
                act("add", { code, name });
                setCode("");
                setName("");
              }
            }}
            style={addBtn}
          >
            添加
          </button>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, background: "#fff" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280", background: "#f9fafb" }}>
            <th style={th}>推广码</th>
            <th style={th}>名称</th>
            <th style={th}>访问</th>
            <th style={th}>下载</th>
            <th style={th}>状态</th>
            <th style={th}>推广链接</th>
            <th style={th}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const link = entry ? `https://${entry}/?c=${r.code}` : `(先设置入口域名)`;
            return (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}><b>{r.code}</b></td>
                <td style={td}>{r.name}</td>
                <td style={td}>{r.visits}</td>
                <td style={td}>{r.downloads}</td>
                <td style={td}>{r.enabled ? <span style={{ color: "#16a34a" }}>启用</span> : <span style={{ color: "#9ca3af" }}>停用</span>}</td>
                <td style={td}>
                  <button onClick={() => navigator.clipboard.writeText(link)} style={smallBtn} title={link}>复制链接</button>
                </td>
                <td style={td}>
                  <button onClick={() => act("toggle", { id: r.id })} style={smallBtn}>{r.enabled ? "停用" : "启用"}</button>
                  <button onClick={() => act("delete", { id: r.id })} style={{ ...smallBtn, color: "#dc2626" }}>删除</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>暂无推广码</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 8px", wordBreak: "break-all" };
const addBtn: React.CSSProperties = { padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };
const smallBtn: React.CSSProperties = { padding: "4px 10px", marginRight: 6, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 };
