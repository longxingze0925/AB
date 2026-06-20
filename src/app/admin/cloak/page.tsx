"use client";

import { useEffect, useState } from "react";

interface BlacklistRow {
  id: number;
  cidr: string;
  note: string;
  created_at: string;
}

interface CloakSettings {
  cloak_enabled: string;
  cloak_threshold: string;
  cloak_token_hours: string;
  cloak_decoy_apk_url: string;
  cloak_decoy_image_url: string;
  cloak_decoy_title: string;
}

export default function CloakPage() {
  const [s, setS] = useState<CloakSettings>({
    cloak_enabled: "0",
    cloak_threshold: "8",
    cloak_token_hours: "6",
    cloak_decoy_apk_url: "",
    cloak_decoy_image_url: "",
    cloak_decoy_title: "下载",
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blacklist, setBlacklist] = useState<BlacklistRow[]>([]);
  const [newCidr, setNewCidr] = useState("");
  const [newNote, setNewNote] = useState("");
  const [blError, setBlError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/cloak").then((r) => r.json()),
      fetch("/api/admin/cloak/ip-blacklist").then((r) => r.json()),
    ]).then(([cfg, bl]) => {
      if (cfg.ok) setS((prev) => ({ ...prev, ...cfg.settings }));
      if (bl.ok) setBlacklist(bl.rows);
      setLoading(false);
    });
  }, []);

  async function addBlacklist() {
    setBlError("");
    const res = await fetch("/api/admin/cloak/ip-blacklist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", cidr: newCidr, note: newNote }),
    });
    const d = await res.json();
    if (d.ok) {
      setNewCidr("");
      setNewNote("");
      const bl = await fetch("/api/admin/cloak/ip-blacklist").then((r) => r.json());
      if (bl.ok) setBlacklist(bl.rows);
    } else {
      setBlError(d.error || "添加失败");
    }
  }

  async function deleteBlacklist(id: number) {
    await fetch("/api/admin/cloak/ip-blacklist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setBlacklist((prev) => prev.filter((r) => r.id !== id));
  }

  async function save() {
    const res = await fetch("/api/admin/cloak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s),
    });
    if ((await res.json()).ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function set(k: keyof CloakSettings, v: string) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function uploadDecoyImage(file: File) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body });
    const d = await res.json();
    if (d.ok) set("cloak_decoy_image_url", d.path);
    else setBlError(d.error || "上传失败");
  }

  if (loading) return <p>加载中…</p>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>分流管理</h1>

      <Section title="总开关">
        <label style={rowStyle}>
          <span style={labelStyle}>启用分流</span>
          <select
            value={s.cloak_enabled}
            onChange={(e) => set("cloak_enabled", e.target.value)}
            style={inputStyle}
          >
            <option value="0">关闭（所有流量走真实页面）</option>
            <option value="1">开启</option>
          </select>
        </label>
      </Section>

      <Section title="判定参数">
        <label style={rowStyle}>
          <span style={labelStyle}>
            真人判定阈值
            <small style={hint}>请求头分 + JS探针分 ≥ 此值判真人，建议 8，调高更严</small>
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={s.cloak_threshold}
            onChange={(e) => set("cloak_threshold", e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
        <label style={rowStyle}>
          <span style={labelStyle}>
            真人令牌有效期（小时）
            <small style={hint}>通过探针后，此时间内无需重新验证</small>
          </span>
          <input
            type="number"
            min={1}
            max={720}
            value={s.cloak_token_hours}
            onChange={(e) => set("cloak_token_hours", e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
      </Section>

      <Section title="假页面内容（给爬虫/同行看的）">
        <label style={rowStyle}>
          <span style={labelStyle}>
            假标题
            <small style={hint}>显示在假落地页顶部</small>
          </span>
          <input
            value={s.cloak_decoy_title}
            onChange={(e) => set("cloak_decoy_title", e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={rowStyle}>
          <span style={labelStyle}>
            假 APK 链接
            <small style={hint}>留空则按钮无效果；可填 404 链接或无关文件</small>
          </span>
          <input
            value={s.cloak_decoy_apk_url}
            onChange={(e) => set("cloak_decoy_apk_url", e.target.value)}
            style={inputStyle}
            placeholder="https://example.com/fake.apk"
          />
        </label>
        <div style={rowStyle}>
          <span style={labelStyle}>
            假页面图片
            <small style={hint}>留空则不显示图片</small>
          </span>
          <ImageUpload
            value={s.cloak_decoy_image_url}
            onPick={uploadDecoyImage}
            onClear={() => set("cloak_decoy_image_url", "")}
          />
        </div>
      </Section>

      <div style={{ marginTop: 24 }}>
        <button onClick={save} style={btnStyle}>
          {saved ? "已保存" : "保存"}
        </button>
      </div>

      <Section title="IP 黑名单">
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            placeholder="IP 或 CIDR，如 1.2.3.4 或 1.2.3.0/24"
            value={newCidr}
            onChange={(e) => setNewCidr(e.target.value)}
            style={{ ...inputStyle, flex: 2, minWidth: 200 }}
          />
          <input
            placeholder="备注（可选）"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 120 }}
          />
          <button onClick={addBlacklist} style={btnStyle}>添加</button>
        </div>
        {blError && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 8px" }}>{blError}</p>}
        {blacklist.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>暂无黑名单</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#6b7280", textAlign: "left", background: "#f9fafb" }}>
                <th style={th}>IP / CIDR</th>
                <th style={th}>备注</th>
                <th style={th}>添加时间</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {blacklist.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}><code>{r.cidr}</code></td>
                  <td style={td}>{r.note || "-"}</td>
                  <td style={td}>{r.created_at}</td>
                  <td style={td}>
                    <button
                      onClick={() => deleteBlacklist(r.id)}
                      style={{ color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div
        style={{
          marginTop: 32,
          padding: 16,
          background: "#f9fafb",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          fontSize: 13,
          color: "#6b7280",
          lineHeight: 1.8,
        }}
      >
        <strong style={{ color: "#374151" }}>判定流程说明</strong>
        <br />
        1. 已持有效令牌 → 直接看真实页面
        <br />
        2. 已知爬虫 UA / 空 UA → 直接给假页面
        <br />
        3. 机房 ASN（AWS/阿里云/腾讯云等）→ 直接给假页面
        <br />
        4. 机房 PTR 反查 → 直接给假页面
        <br />
        5. 其余访客 → 显示「加载中」+ 执行 JS 探针
        <br />
        &nbsp;&nbsp;&nbsp;• 探针得分 ≥ 阈值 → 发令牌，显示真实页面
        <br />
        &nbsp;&nbsp;&nbsp;• 不执行 JS / 得分不足 → 给假页面
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 15, marginTop: 0, marginBottom: 16, color: "#374151" }}>
        {title}
      </h2>
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
    <div style={{ flex: 1, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="预览" style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
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
      {value && <button onClick={onClear} style={{ padding: "6px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>清除</button>}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 14,
  cursor: "default",
};
const labelStyle: React.CSSProperties = {
  width: 220,
  fontSize: 14,
  color: "#374151",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const hint: React.CSSProperties = { fontWeight: 400, color: "#9ca3af", fontSize: 12 };
const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
};
const btnStyle: React.CSSProperties = {
  padding: "8px 28px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px 10px" };
