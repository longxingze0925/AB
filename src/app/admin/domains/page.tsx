"use client";

import { useEffect, useState } from "react";

interface Domain {
  id: number;
  domain: string;
  is_current: number;
  note: string;
  created_at: string;
}

function DomainPool({ type, title }: { type: "entry" | "exit"; title: string }) {
  const [rows, setRows] = useState<Domain[]>([]);
  const [domain, setDomain] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    const res = await fetch(`/api/admin/domains?type=${type}`);
    const d = await res.json();
    if (d.ok) setRows(d.rows);
  }
  useEffect(() => {
    load();
  }, []);

  async function act(action: string, extra: any = {}) {
    await fetch("/api/admin/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, type, ...extra }),
    });
    load();
  }

  return (
    <div style={{ background: "#fff", padding: 20, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>{title}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          placeholder="域名,如 go.example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          style={{ flex: 2, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
        />
        <input
          placeholder="备注(可选)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: 1, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
        />
        <button
          onClick={() => {
            if (domain.trim()) {
              act("add", { domain, note });
              setDomain("");
              setNote("");
            }
          }}
          style={addBtn}
        >
          添加
        </button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280" }}>
            <th style={th}>状态</th>
            <th style={th}>域名</th>
            <th style={th}>备注</th>
            <th style={th}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={td}>
                {r.is_current ? (
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>● 当前</span>
                ) : (
                  <span style={{ color: "#9ca3af" }}>○</span>
                )}
              </td>
              <td style={td}>{r.domain}</td>
              <td style={td}>{r.note}</td>
              <td style={td}>
                {!r.is_current && (
                  <button onClick={() => act("setCurrent", { id: r.id })} style={smallBtn}>
                    设为当前
                  </button>
                )}
                <button onClick={() => act("delete", { id: r.id })} style={{ ...smallBtn, color: "#dc2626" }}>
                  删除
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ ...td, color: "#9ca3af", textAlign: "center" }}>
                暂无域名
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function DomainsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>域名管理</h1>
      <p style={{ color: "#6b7280", fontSize: 13 }}>
        所有域名需先把 DNS 解析到本服务器 IP。设为当前后立即生效,推广链接不变、下载内容不变。
      </p>
      <DomainPool type="entry" title="入口域名池(用户点击的域名)" />
      <DomainPool type="exit" title="出口域名池(触发下载的域名)" />
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 6px", wordBreak: "break-all" };
const addBtn: React.CSSProperties = { padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };
const smallBtn: React.CSSProperties = { padding: "4px 10px", marginRight: 6, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 };
