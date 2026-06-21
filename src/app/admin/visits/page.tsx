"use client";

import { useEffect, useState } from "react";

interface Visit {
  id: number;
  route_name: string;
  page_variant: string;
  cloak_reason: string;
  promo_code: string;
  entry_domain: string;
  exit_domain: string;
  ip: string;
  ip_source: string;
  cf_ray: string;
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
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">访问记录</h1>
          <p className="admin-page-desc">查看访客命中的线路、真假页面、IP 来源和设备信息。</p>
        </div>
      </div>

      <div className="admin-panel admin-panel-padded">
        <div className="admin-toolbar">
        <input
          placeholder="按推广码筛选"
          value={promo}
          onChange={(e) => {
            setPage(1);
            setPromo(e.target.value);
          }}
          className="admin-input"
          style={{ maxWidth: 240 }}
        />
          <span className="admin-muted" style={{ fontSize: 13 }}>共 {total} 条</span>
        </div>
      </div>

      <div className="admin-panel admin-table-wrap">
        <table className="admin-table" style={{ whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              {["时间", "页面", "原因", "线路", "推广码", "IP", "IP来源", "地区", "运营商", "系统", "设备", "浏览器", "屏幕", "时区", "网络", "CF Ray", "指纹", "下载", "入口", "出口"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.created_at}</td>
                <td>{variantLabel(r.page_variant)}</td>
                <td className="admin-truncate" title={r.cloak_reason}>{r.cloak_reason || "-"}</td>
                <td>{r.route_name || "-"}</td>
                <td>{r.promo_code ? <span className="admin-code">{r.promo_code}</span> : "-"}</td>
                <td>{r.ip || "-"}</td>
                <td>{r.ip_source || "-"}</td>
                <td>{[r.country, r.province, r.city].filter(Boolean).join("/") || "-"}</td>
                <td>{r.isp || "-"}</td>
                <td>{[r.os, r.os_version].filter(Boolean).join(" ") || "-"}</td>
                <td>{r.device || "-"}</td>
                <td>{r.browser || "-"}</td>
                <td>{r.screen || "-"}</td>
                <td>{r.timezone || "-"}</td>
                <td>{r.network || "-"}</td>
                <td title={r.cf_ray}>{r.cf_ray || "-"}</td>
                <td title={r.fingerprint}>{r.fingerprint ? r.fingerprint.slice(0, 8) : "-"}</td>
                <td>{r.downloaded ? <Badge variant="success" label="已下载" /> : "-"}</td>
                <td>{r.entry_domain || "-"}</td>
                <td>{r.exit_domain || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={20} className="admin-empty">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-toolbar" style={{ marginTop: 16 }}>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="admin-btn">上一页</button>
        <span style={{ fontSize: 13 }}>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="admin-btn">下一页</button>
      </div>
    </div>
  );
}

function variantLabel(value: string) {
  if (value === "real") return <Badge variant="success" label="真" />;
  if (value === "fake") return <Badge variant="danger" label="假" />;
  if (value === "probe") return <Badge variant="primary" label="探针" />;
  return "-";
}

function Badge({
  variant,
  label,
}: {
  variant: "success" | "muted" | "primary" | "danger" | "warning";
  label: string;
}) {
  return <span className={`admin-badge admin-badge-${variant}`}>{label}</span>;
}
