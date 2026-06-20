"use client";

import { useEffect, useState } from "react";

interface LandingRoute {
  id: number;
  name: string;
  entry_domain: string;
  exit_domain: string;
  title: string;
  image_path: string;
  apk_url: string;
  auto_download: number;
  cloak_enabled: number;
  cloak_threshold: number;
  cloak_token_hours: number;
  cloak_decoy_title: string;
  cloak_decoy_image_path: string;
  cloak_decoy_apk_url: string;
  enabled: number;
  visits: number;
  downloads: number;
}

type FormState = Omit<LandingRoute, "id" | "visits" | "downloads">;

const blank: FormState = {
  name: "",
  entry_domain: "",
  exit_domain: "",
  title: "下载",
  image_path: "",
  apk_url: "",
  auto_download: 1,
  cloak_enabled: 0,
  cloak_threshold: 8,
  cloak_token_hours: 6,
  cloak_decoy_title: "下载",
  cloak_decoy_image_path: "",
  cloak_decoy_apk_url: "",
  enabled: 1,
};

export default function RoutesPage() {
  const [rows, setRows] = useState<LandingRoute[]>([]);
  const [form, setForm] = useState<FormState>(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/routes");
    const d = await res.json();
    if (d.ok) setRows(d.rows);
  }

  useEffect(() => {
    load();
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function edit(row: LandingRoute) {
    const { id, visits, downloads, ...next } = row;
    setEditingId(id);
    setForm(next);
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null);
    setForm(blank);
    setMessage("");
    setError("");
  }

  async function save() {
    setError("");
    setMessage("");
    const res = await fetch("/api/admin/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: editingId ? "update" : "add", id: editingId, ...form }),
    });
    const d = await res.json();
    if (!d.ok) {
      setError(d.error || "保存失败");
      return;
    }
    setMessage(editingId ? "已更新线路" : "已添加线路");
    reset();
    load();
  }

  async function act(action: string, id: number) {
    await fetch("/api/admin/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    load();
  }

  async function upload(file: File, key: "image_path" | "cloak_decoy_image_path") {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body });
    const d = await res.json();
    if (d.ok) set(key, d.path);
    else setError(d.error || "上传失败");
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>线路管理</h1>
      <p style={{ color: "#6b7280", fontSize: 13 }}>
        每条线路独立绑定入口域名、出口域名、落地页、下载链接和分流设置。
      </p>

      <div style={panel}>
        <h2 style={sectionTitle}>{editingId ? "编辑线路" : "新增线路"}</h2>
        <div style={grid}>
          <Field label="线路名称">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} style={input} placeholder="渠道 A" />
          </Field>
          <Field label="入口域名">
            <input value={form.entry_domain} onChange={(e) => set("entry_domain", e.target.value)} style={input} placeholder="go.example.com" />
          </Field>
          <Field label="出口域名">
            <input value={form.exit_domain} onChange={(e) => set("exit_domain", e.target.value)} style={input} placeholder="dl.example.com" />
          </Field>
          <Field label="落地页标题">
            <input value={form.title} onChange={(e) => set("title", e.target.value)} style={input} />
          </Field>
          <Field label="APK 下载链接">
            <input value={form.apk_url} onChange={(e) => set("apk_url", e.target.value)} style={input} placeholder="https://.../app.apk" />
          </Field>
          <Field label="打开自动下载">
            <select value={form.auto_download} onChange={(e) => set("auto_download", Number(e.target.value))} style={input}>
              <option value={1}>开启</option>
              <option value={0}>关闭</option>
            </select>
          </Field>
        </div>

        <ImageUpload label="落地页图片" value={form.image_path} onPick={(file) => upload(file, "image_path")} onClear={() => set("image_path", "")} />

        <h3 style={smallTitle}>分流设置</h3>
        <div style={grid}>
          <Field label="启用分流">
            <select value={form.cloak_enabled} onChange={(e) => set("cloak_enabled", Number(e.target.value))} style={input}>
              <option value={0}>关闭</option>
              <option value={1}>开启</option>
            </select>
          </Field>
          <Field label="真人判定阈值">
            <input type="number" min={1} max={30} value={form.cloak_threshold} onChange={(e) => set("cloak_threshold", Number(e.target.value))} style={input} />
          </Field>
          <Field label="令牌有效期(小时)">
            <input type="number" min={1} max={720} value={form.cloak_token_hours} onChange={(e) => set("cloak_token_hours", Number(e.target.value))} style={input} />
          </Field>
          <Field label="假页面标题">
            <input value={form.cloak_decoy_title} onChange={(e) => set("cloak_decoy_title", e.target.value)} style={input} />
          </Field>
          <Field label="假 APK 链接">
            <input value={form.cloak_decoy_apk_url} onChange={(e) => set("cloak_decoy_apk_url", e.target.value)} style={input} placeholder="https://example.com/fake.apk" />
          </Field>
          <Field label="线路状态">
            <select value={form.enabled} onChange={(e) => set("enabled", Number(e.target.value))} style={input}>
              <option value={1}>启用</option>
              <option value={0}>停用</option>
            </select>
          </Field>
        </div>

        <ImageUpload label="假页面图片" value={form.cloak_decoy_image_path} onPick={(file) => upload(file, "cloak_decoy_image_path")} onClear={() => set("cloak_decoy_image_path", "")} />

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={save} style={primaryBtn}>{editingId ? "保存修改" : "添加线路"}</button>
          {editingId && <button onClick={reset} style={secondaryBtn}>取消编辑</button>}
          {message && <span style={{ color: "#16a34a", alignSelf: "center", fontSize: 13 }}>{message}</span>}
          {error && <span style={{ color: "#dc2626", alignSelf: "center", fontSize: 13 }}>{error}</span>}
        </div>
      </div>

      <div style={panel}>
        <h2 style={sectionTitle}>已有线路</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ color: "#6b7280", textAlign: "left", background: "#f9fafb" }}>
                {["状态", "名称", "入口域名", "出口域名", "访问", "下载", "落地页图片", "分流", "操作"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}>{r.enabled ? <span style={{ color: "#16a34a" }}>启用</span> : <span style={{ color: "#9ca3af" }}>停用</span>}</td>
                  <td style={td}>{r.name || "-"}</td>
                  <td style={td}>{r.entry_domain}</td>
                  <td style={td}>{r.exit_domain}</td>
                  <td style={td}>{r.visits}</td>
                  <td style={td}>{r.downloads}</td>
                  <td style={td}>{r.image_path ? <img src={r.image_path} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }} /> : "-"}</td>
                  <td style={td}>{r.cloak_enabled ? "开启" : "关闭"}</td>
                  <td style={td}>
                    <button onClick={() => edit(r)} style={smallBtn}>编辑</button>
                    <button onClick={() => act("toggle", r.id)} style={smallBtn}>{r.enabled ? "停用" : "启用"}</button>
                    <button onClick={() => act("delete", r.id)} style={{ ...smallBtn, color: "#dc2626" }}>删除</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>暂无线路</td></tr>
              )}
            </tbody>
          </table>
        </div>
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

function ImageUpload({
  label,
  value,
  onPick,
  onClear,
}: {
  label: string;
  value: string;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {value ? <img src={value} alt={label} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} /> : null}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            e.currentTarget.value = "";
          }}
        />
        {value && <button onClick={onClear} style={secondaryBtn}>清除</button>}
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  marginBottom: 24,
};
const sectionTitle: React.CSSProperties = { fontSize: 16, marginTop: 0, marginBottom: 16 };
const smallTitle: React.CSSProperties = { fontSize: 15, marginTop: 22, marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr))", gap: 14 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box", fontSize: 14 };
const primaryBtn: React.CSSProperties = { padding: "9px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "8px 14px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" };
const smallBtn: React.CSSProperties = { padding: "4px 10px", marginRight: 6, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "9px 8px", verticalAlign: "middle" };
