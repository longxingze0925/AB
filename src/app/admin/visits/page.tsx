"use client";

import { useEffect, useState } from "react";

interface Visit {
  id: number;
  promo_code: string;
  entry_domain: string;
  exit_domain: string;
  ip: string;
  country: string;
  province: string;
  city: string;
  isp: string;
  os: string;
  os_version: string;
  device: string;
  browser: string;
  language: string;
  referer: string;
  screen: string;
  timezone: string;
  network: string;
  fingerprint: string;
  is_mobile: number;
  downloaded: number;
  created_at: string;
}

export default function VisitsPage() {
  const [rows, setRows] = useState<Visit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [promo, setPromo] = useState("");
  const size = 50;

  async function load() {
    const res = await fetch(`/api/admin/visits?page=${page}&size=${size}&promo=${encodeURIComponent(promo)}`);
    const d = await res.json();
    if (d.ok) {
      setRows(d.rows);
      setTotal(d.total);
    }
  }
  useEffect(() => {
    load();
  }, [page, promo]);

  const pages = Math.ceil(total / size) || 1;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>访问记录</h1>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          placeholder="按推广码筛选"
          value={promo}
          onChange={(e) => {
            setPage(1);
            setPromo(e.target.value);
          }}
          style={{ padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
        />
        <span style={{ color: "#6b7280", fontSize: 13 }}>共 {total} 条</span>
      </div>

      <div style={{ overflowX: "auto", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7280", background: "#f9fafb" }}>
              {["时间", "推广码", "IP", "地区", "运营商", "系统", "设备", "浏览器", "屏幕", "时区", "网络", "指纹", "下载", "入口", "出口"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{r.created_at}</td>
                <td style={td}>{r.promo_code || "-"}</td>
                <td style={td}>{r.ip || "-"}</td>
                <td style={td}>{[r.country, r.province, r.city].filter(Boolean).join("/") || "-"}</td>
                <td style={td}>{r.isp || "-"}</td>
                <td style={td}>{[r.os, r.os_version].filter(Boolean).join(" ") || "-"}</td>
                <td style={td}>{r.device || "-"}</td>
                <td style={td}>{r.browser || "-"}</td>
                <td style={td}>{r.screen || "-"}</td>
                <td style={td}>{r.timezone || "-"}</td>
                <td style={td}>{r.network || "-"}</td>
                <td style={td} title={r.fingerprint}>{r.fingerprint ? r.fingerprint.slice(0, 8) : "-"}</td>
                <td style={td}>{r.downloaded ? <span style={{ color: "#16a34a" }}>✓</span> : "-"}</td>
                <td style={td}>{r.entry_domain || "-"}</td>
                <td style={td}>{r.exit_domain || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={15} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={pageBtn}>上一页</button>
        <span style={{ fontSize: 13 }}>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} style={pageBtn}>下一页</button>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px" };
const pageBtn: React.CSSProperties = { padding: "6px 14px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" };
