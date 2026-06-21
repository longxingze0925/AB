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
    <div className="admin-panel admin-panel-padded">
      <h2 className="admin-section-title">{title}</h2>
      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <input
          placeholder="域名,如 go.example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="admin-input"
          style={{ flex: 2, minWidth: 240 }}
        />
        <input
          placeholder="备注(可选)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="admin-input"
          style={{ flex: 1, minWidth: 160 }}
        />
        <button
          onClick={() => {
            if (domain.trim()) {
              act("add", { domain, note });
              setDomain("");
              setNote("");
            }
          }}
          className="admin-btn admin-btn-primary"
        >
          添加
        </button>
      </div>
      <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>域名</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.is_current ? (
                  <span className="admin-badge admin-badge-success">当前</span>
                ) : (
                  <span className="admin-badge admin-badge-muted">备用</span>
                )}
              </td>
              <td className="admin-break">{r.domain}</td>
              <td>{r.note || "-"}</td>
              <td>
                <div className="admin-btn-row">
                {!r.is_current && (
                  <button onClick={() => act("setCurrent", { id: r.id })} className="admin-btn">
                    设为当前
                  </button>
                )}
                <button onClick={() => act("delete", { id: r.id })} className="admin-btn admin-btn-danger">
                  删除
                </button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="admin-empty">
                暂无域名
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function DomainsPage() {
  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">域名管理</h1>
          <p className="admin-page-desc">
            所有域名需先把 DNS 解析到本服务器 IP。设为当前后立即生效，推广链接不变、下载内容不变。
          </p>
        </div>
      </div>
      <DomainPool type="entry" title="入口域名池(用户点击的域名)" />
      <DomainPool type="exit" title="出口域名池(触发下载的域名)" />
    </div>
  );
}
