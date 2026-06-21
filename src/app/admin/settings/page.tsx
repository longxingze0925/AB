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

  async function uploadImage(file: File) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body });
    const d = await res.json();
    if (d.ok) set("image_url", d.path);
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">APK / 页面设置</h1>
          <p className="admin-page-desc">旧全局设置仅用于兼容，建议后续在线路管理中维护。</p>
        </div>
      </div>

      <div className="admin-panel admin-panel-padded" style={{ maxWidth: 720 }}>
        <Field label="APK 下载直链">
          <input value={s.apk_url} onChange={(e) => set("apk_url", e.target.value)} className="admin-input" placeholder="https://.../app.apk" />
        </Field>
        <Field label="出口页展示图片(可选)">
          <ImageUpload value={s.image_url} onPick={uploadImage} onClear={() => set("image_url", "")} />
        </Field>
        <Field label="出口页标题">
          <input value={s.title} onChange={(e) => set("title", e.target.value)} className="admin-input" placeholder="下载" />
        </Field>
        <Field label="打开即自动下载">
          <select value={s.auto_download} onChange={(e) => set("auto_download", e.target.value)} className="admin-input">
            <option value="1">开启</option>
            <option value="0">关闭(仅显示按钮)</option>
          </select>
        </Field>
        <Field label="未知/旧域名也跳转到当前出口">
          <select value={s.fallback_redirect} onChange={(e) => set("fallback_redirect", e.target.value)} className="admin-input">
            <option value="1">开启(旧链接不失效)</option>
            <option value="0">关闭(仅入口池域名生效)</option>
          </select>
        </Field>
        <button onClick={save} className="admin-btn admin-btn-primary" style={{ marginTop: 8 }}>
          保存
        </button>
        {saved && <span style={{ color: "var(--admin-success)", marginLeft: 12 }}>已保存</span>}
      </div>
      {s.image_url && (
        <div className="admin-panel admin-panel-padded" style={{ marginTop: 16, maxWidth: 720 }}>
          <p className="admin-page-desc" style={{ marginTop: 0 }}>图片预览</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.image_url} alt="预览" style={{ maxWidth: 300, width: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="admin-field" style={{ marginBottom: 16 }}>
      <label className="admin-label">{label}</label>
      {children}
    </div>
  );
}

function ImageUpload({
  value,
  onPick,
  onClear,
}: {
  value: string;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="admin-upload-row">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="预览" className="admin-preview" />
      ) : null}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.currentTarget.value = "";
        }}
      />
      {value && <button onClick={onClear} className="admin-btn">清除</button>}
    </div>
  );
}
