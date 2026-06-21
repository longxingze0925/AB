"use client";

import { useEffect, useMemo, useState } from "react";

interface RouteOption {
  id: number;
  name: string;
  entry_domain: string;
  exit_domain: string | null;
  real_target_type: "internal" | "external";
  external_url: string;
  enabled: number;
}

interface Promo {
  id: number;
  route_id: number | null;
  route_name: string;
  entry_domain: string;
  real_target_type: "internal" | "external";
  external_url: string;
  code: string;
  name: string;
  apk_url: string;
  enabled: number;
  visits: number;
  downloads: number;
}

export default function PromosPage() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routeId, setRouteId] = useState(0);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [apkUrl, setApkUrl] = useState("");
  const [error, setError] = useState("");

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === routeId) || null,
    [routes, routeId]
  );

  async function load(nextRouteId = routeId) {
    const query = nextRouteId ? `?route_id=${nextRouteId}` : "";
    const d = await fetch(`/api/admin/promos${query}`).then((r) => r.json());
    if (d.ok) {
      setRows(d.rows);
      setRoutes(d.routes);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(action: string, extra: any = {}) {
    setError("");
    const res = await fetch("/api/admin/promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) setError(d.error || "操作失败");
    load();
  }

  function genCode() {
    setCode(Math.random().toString(36).slice(2, 8).toUpperCase());
  }

  function promoLink(p: Promo) {
    return p.entry_domain ? `https://${p.entry_domain}/?c=${p.code}` : "";
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">推广码</h1>
          <p className="admin-page-desc">
            推广码归属到具体线路，访问时只在该线路入口域名下生效。
          </p>
        </div>
      </div>

      <div className="admin-panel admin-panel-padded">
        <div className="admin-form-grid">
          <Field label="所属线路">
            <select
              value={routeId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setRouteId(id);
                load(id);
              }}
              className="admin-input"
            >
              <option value={0}>全部线路</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {(r.name || r.entry_domain) + " / " + r.entry_domain}
                </option>
              ))}
            </select>
          </Field>
          <Field label="推广码">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="admin-input" placeholder="A1B2C3" />
              <button onClick={genCode} className="admin-btn">随机</button>
            </div>
          </Field>
          <Field label="渠道名称">
            <input value={name} onChange={(e) => setName(e.target.value)} className="admin-input" placeholder="渠道/分站名称" />
          </Field>
          <Field label="专属 APK 链接(可选)">
            <input
              value={apkUrl}
              onChange={(e) => setApkUrl(e.target.value)}
              className="admin-input"
              placeholder={selectedRoute?.real_target_type === "external" ? "外部网站模式下不生效" : "留空则使用线路 APK"}
              disabled={selectedRoute?.real_target_type === "external"}
            />
          </Field>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 16 }}>
          <button
            onClick={() => {
              if (!routeId) {
                setError("请先创建线路");
                return;
              }
              act("add", { route_id: routeId, code, name, apk_url: selectedRoute?.real_target_type === "external" ? "" : apkUrl });
              setCode("");
              setName("");
              setApkUrl("");
            }}
            className="admin-btn admin-btn-primary"
          >
            添加推广码
          </button>
          {selectedRoute && (
            <span className="admin-muted" style={{ fontSize: 13 }}>
              当前入口：{selectedRoute.entry_domain || "未设置"}
              {selectedRoute.real_target_type === "external" ? "，真用户透传到外部网站" : ""}
            </span>
          )}
          {error && <span style={{ color: "var(--admin-danger)", fontSize: 13 }}>{error}</span>}
        </div>
      </div>

      <div className="admin-panel admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {["推广码", "线路", "名称", "访问", "下载", "状态", "推广链接", "APK 覆盖", "操作"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const link = promoLink(r);
              return (
                <tr key={r.id}>
                  <td><span className="admin-code">{r.code}</span></td>
                  <td>{r.route_name || r.entry_domain || "-"}</td>
                  <td>{r.name || "-"}</td>
                  <td>{r.visits}</td>
                  <td>{r.downloads}</td>
                  <td>{r.enabled ? <Badge variant="success" label="启用" /> : <Badge variant="muted" label="停用" />}</td>
                  <td>
                    {link ? <button onClick={() => navigator.clipboard.writeText(link)} className="admin-btn" title={link}>复制链接</button> : "-"}
                  </td>
                  <td className="admin-truncate admin-break" title={r.apk_url || ""}>
                    {r.apk_url || "-"}
                  </td>
                  <td>
                    <div className="admin-btn-row">
                      <button onClick={() => act("toggle", { id: r.id })} className="admin-btn">{r.enabled ? "停用" : "启用"}</button>
                      <button onClick={() => act("delete", { id: r.id })} className="admin-btn admin-btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="admin-empty">暂无推广码</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="admin-field">
      <span className="admin-label">{label}</span>
      {children}
    </label>
  );
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
