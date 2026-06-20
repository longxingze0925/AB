"use client";

import { useEffect, useMemo, useState } from "react";

interface RouteOption {
  id: number;
  name: string;
  entry_domain: string;
  exit_domain: string;
  enabled: number;
}

interface Promo {
  id: number;
  route_id: number | null;
  route_name: string;
  entry_domain: string;
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
      <div style={header}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>推广码</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "8px 0 0" }}>
            推广码归属到具体线路，访问时只在该线路入口域名下生效。
          </p>
        </div>
      </div>

      <div style={panel}>
        <div style={formGrid}>
          <Field label="所属线路">
            <select
              value={routeId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setRouteId(id);
                load(id);
              }}
              style={input}
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
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={input} placeholder="A1B2C3" />
              <button onClick={genCode} style={secondaryBtn}>随机</button>
            </div>
          </Field>
          <Field label="渠道名称">
            <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="渠道/分站名称" />
          </Field>
          <Field label="专属 APK 链接(可选)">
            <input value={apkUrl} onChange={(e) => setApkUrl(e.target.value)} style={input} placeholder="留空则使用线路 APK" />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <button
            onClick={() => {
              if (!routeId) {
                setError("请先创建线路");
                return;
              }
              act("add", { route_id: routeId, code, name, apk_url: apkUrl });
              setCode("");
              setName("");
              setApkUrl("");
            }}
            style={primaryBtn}
          >
            添加推广码
          </button>
          {selectedRoute && (
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              当前入口：{selectedRoute.entry_domain || "未设置"}
            </span>
          )}
          {error && <span style={{ color: "#dc2626", fontSize: 13 }}>{error}</span>}
        </div>
      </div>

      <div style={panel}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, background: "#fff" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7280", background: "#f9fafb" }}>
              {["推广码", "线路", "名称", "访问", "下载", "状态", "推广链接", "APK 覆盖", "操作"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const link = promoLink(r);
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}><b>{r.code}</b></td>
                  <td style={td}>{r.route_name || r.entry_domain || "-"}</td>
                  <td style={td}>{r.name || "-"}</td>
                  <td style={td}>{r.visits}</td>
                  <td style={td}>{r.downloads}</td>
                  <td style={td}>{r.enabled ? <span style={{ color: "#16a34a" }}>启用</span> : <span style={{ color: "#9ca3af" }}>停用</span>}</td>
                  <td style={td}>
                    {link ? <button onClick={() => navigator.clipboard.writeText(link)} style={smallBtn} title={link}>复制链接</button> : "-"}
                  </td>
                  <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{r.apk_url || "-"}</td>
                  <td style={td}>
                    <button onClick={() => act("toggle", { id: r.id })} style={smallBtn}>{r.enabled ? "停用" : "启用"}</button>
                    <button onClick={() => act("delete", { id: r.id })} style={{ ...smallBtn, color: "#dc2626" }}>删除</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>暂无推广码</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 13, color: "#374151", marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 };
const panel: React.CSSProperties = { background: "#fff", padding: 18, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 18 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 };
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box", fontSize: 14 };
const primaryBtn: React.CSSProperties = { padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "8px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" };
const smallBtn: React.CSSProperties = { padding: "4px 10px", marginRight: 6, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 8px", wordBreak: "break-all" };
