"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    return {
      total: rows.length,
      enabled: rows.filter((r) => r.enabled).length,
      visits: rows.reduce((sum, r) => sum + Number(r.visits || 0), 0),
      downloads: rows.reduce((sum, r) => sum + Number(r.downloads || 0), 0),
    };
  }, [rows]);

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

  function openCreate() {
    setEditingId(null);
    setForm(blank);
    setError("");
    setMessage("");
    setModalOpen(true);
  }

  function openEdit(row: LandingRoute) {
    const { id, visits, downloads, ...next } = row;
    setEditingId(id);
    setForm(next);
    setError("");
    setMessage("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(blank);
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
    closeModal();
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
      <div style={header}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>线路管理</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "8px 0 0" }}>
            每条线路独立绑定入口域名、出口域名、落地页、下载链接和分流设置。
          </p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>新增线路</button>
      </div>

      <div style={statsGrid}>
        <StatCard label="线路总数" value={stats.total} />
        <StatCard label="启用线路" value={stats.enabled} />
        <StatCard label="累计访问" value={stats.visits} />
        <StatCard label="触发下载" value={stats.downloads} />
      </div>

      {message && <p style={{ color: "#16a34a", fontSize: 13 }}>{message}</p>}

      <div style={panel}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#6b7280", textAlign: "left", background: "#f9fafb" }}>
              {["状态", "线路", "入口域名", "出口域名", "访问", "下载", "落地页", "分流", "推广链接", "操作"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const link = r.entry_domain ? `https://${r.entry_domain}/` : "";
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}>{r.enabled ? <Badge color="#16a34a" label="启用" /> : <Badge color="#9ca3af" label="停用" />}</td>
                  <td style={td}>
                    <strong>{r.name || "-"}</strong>
                    <div style={{ color: "#6b7280", marginTop: 3 }}>{r.title || "下载"}</div>
                  </td>
                  <td style={td}>{r.entry_domain}</td>
                  <td style={td}>{r.exit_domain}</td>
                  <td style={td}>{r.visits}</td>
                  <td style={td}>{r.downloads}</td>
                  <td style={td}>{r.image_path ? <img src={r.image_path} alt="" style={thumb} /> : "-"}</td>
                  <td style={td}>{r.cloak_enabled ? <Badge color="#2563eb" label="开启" /> : <span style={{ color: "#9ca3af" }}>关闭</span>}</td>
                  <td style={td}>
                    {link ? <button onClick={() => navigator.clipboard.writeText(link)} style={smallBtn}>复制</button> : "-"}
                  </td>
                  <td style={td}>
                    <button onClick={() => openEdit(r)} style={smallBtn}>编辑</button>
                    <button onClick={() => act("toggle", r.id)} style={smallBtn}>{r.enabled ? "停用" : "启用"}</button>
                    <button onClick={() => act("delete", r.id)} style={{ ...smallBtn, color: "#dc2626" }}>删除</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>暂无线路</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div style={modalMask}>
          <div style={modal}>
            <div style={modalHeader}>
              <h2 style={{ fontSize: 18, margin: 0 }}>{editingId ? "编辑线路" : "新增线路"}</h2>
              <button onClick={closeModal} style={iconBtn}>x</button>
            </div>

            <Section title="基础信息">
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
                <Field label="线路状态">
                  <select value={form.enabled} onChange={(e) => set("enabled", Number(e.target.value))} style={input}>
                    <option value={1}>启用</option>
                    <option value={0}>停用</option>
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="落地页">
              <div style={grid}>
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
            </Section>

            <Section title="分流设置">
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
              </div>
              <ImageUpload label="假页面图片" value={form.cloak_decoy_image_path} onPick={(file) => upload(file, "cloak_decoy_image_path")} onClear={() => set("cloak_decoy_image_path", "")} />
            </Section>

            {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
            <div style={modalFooter}>
              <button onClick={closeModal} style={secondaryBtn}>取消</button>
              <button onClick={save} style={primaryBtn}>{editingId ? "保存修改" : "添加线路"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={statCard}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>{title}</h3>
      {children}
    </section>
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
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {value ? <img src={value} alt={label} style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} /> : null}
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

const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 };
const statsGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 18 };
const statCard: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 };
const panel: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" };
const primaryBtn: React.CSSProperties = { padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" };
const secondaryBtn: React.CSSProperties = { padding: "8px 14px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" };
const smallBtn: React.CSSProperties = { padding: "4px 10px", marginRight: 6, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const iconBtn: React.CSSProperties = { width: 30, height: 30, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, cursor: "pointer" };
const th: React.CSSProperties = { padding: "11px 10px", fontWeight: 500, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px", verticalAlign: "middle", borderTop: "1px solid #f3f4f6" };
const thumb: React.CSSProperties = { width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" };
const modalMask: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,24,39,.42)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "48px 24px", zIndex: 50, overflowY: "auto" };
const modal: React.CSSProperties = { width: "min(980px,100%)", background: "#fff", borderRadius: 8, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.22)" };
const modalHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 };
const modalFooter: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 };
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box", fontSize: 14 };
