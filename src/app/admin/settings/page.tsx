"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [s, setS] = useState<Record<string, string>>({
    apk_url: "",
    image_url: "",
    title: "",
    auto_download: "1",
    fallback_redirect: "1",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => d.ok && setS(d.settings));
  }, []);

  async function save() {
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function set(k: string, v: string) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>APK / 页面设置</h1>
      <div style={{ background: "#fff", padding: 24, borderRadius: 10, border: "1px solid #e5e7eb", maxWidth: 640 }}>
        <Field label="APK 下载直链">
          <input value={s.apk_url} onChange={(e) => set("apk_url", e.target.value)} style={inp} placeholder="https://.../app.apk" />
        </Field>
        <Field label="出口页展示图片(可选)">
          <input value={s.image_url} onChange={(e) => set("image_url", e.target.value)} style={inp} placeholder="https://.../img.jpg" />
        </Field>
        <Field label="出口页标题">
          <input value={s.title} onChange={(e) => set("title", e.target.value)} style={inp} placeholder="下载" />
        </Field>
        <Field label="打开即自动下载">
          <select value={s.auto_download} onChange={(e) => set("auto_download", e.target.value)} style={inp}>
            <option value="1">开启</option>
            <option value="0">关闭(仅显示按钮)</option>
          </select>
        </Field>
        <Field label="未知/旧域名也跳转到当前出口">
          <select value={s.fallback_redirect} onChange={(e) => set("fallback_redirect", e.target.value)} style={inp}>
            <option value="1">开启(旧链接不失效)</option>
            <option value="0">关闭(仅入口池域名生效)</option>
          </select>
        </Field>
        <button onClick={save} style={{ padding: "10px 24px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 8 }}>
          保存
        </button>
        {saved && <span style={{ color: "#16a34a", marginLeft: 12 }}>已保存</span>}
      </div>
      {s.image_url && (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>图片预览:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.image_url} alt="预览" style={{ maxWidth: 300, borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, color: "#374151", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box", fontSize: 14 };
