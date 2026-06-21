"use client";

import { useEffect, useMemo, useState } from "react";

interface LandingRoute {
  id: number;
  name: string;
  entry_domain: string;
  exit_domain: string | null;
  real_target_type: "internal" | "external";
  external_url: string;
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

type FormState = Omit<LandingRoute, "id" | "visits" | "downloads">;

const blank: FormState = {
  name: "",
  entry_domain: "",
  exit_domain: "",
  real_target_type: "internal",
  external_url: "",
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
  const [promoRoute, setPromoRoute] = useState<LandingRoute | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [promoName, setPromoName] = useState("");
  const [promoApkUrl, setPromoApkUrl] = useState("");
  const [promoError, setPromoError] = useState("");
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

  async function loadPromos(routeId: number) {
    const res = await fetch(`/api/admin/promos?route_id=${routeId}`);
    const d = await res.json();
    if (d.ok) setPromos(d.rows);
  }

  function openPromos(route: LandingRoute) {
    setPromoRoute(route);
    setPromoCode("");
    setPromoName("");
    setPromoApkUrl("");
    setPromoError("");
    loadPromos(route.id);
  }

  function closePromos() {
    setPromoRoute(null);
    setPromos([]);
    setPromoError("");
  }

  function genPromoCode() {
    setPromoCode(Math.random().toString(36).slice(2, 8).toUpperCase());
  }

  async function promoAct(action: string, extra: Record<string, unknown> = {}) {
    if (!promoRoute) return;
    setPromoError("");
    const res = await fetch("/api/admin/promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) {
      setPromoError(d.error || "操作失败");
      return;
    }
    if (action === "add") {
      setPromoCode("");
      setPromoName("");
      setPromoApkUrl("");
    }
    loadPromos(promoRoute.id);
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
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">线路管理</h1>
          <p className="admin-page-desc">
            每条线路独立绑定入口域名、真用户去向、假页面和分流设置。
          </p>
        </div>
        <button onClick={openCreate} className="admin-btn admin-btn-primary">新增线路</button>
      </div>

      <div className="admin-stats-grid">
        <StatCard label="线路总数" value={stats.total} />
        <StatCard label="启用线路" value={stats.enabled} />
        <StatCard label="累计访问" value={stats.visits} />
        <StatCard label="触发下载" value={stats.downloads} />
      </div>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}

      <div className="admin-panel admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {["状态", "线路", "入口域名", "真用户去向", "访问", "下载", "落地页", "分流", "推广码", "操作"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const link = r.entry_domain ? `https://${r.entry_domain}/` : "";
              return (
                <tr key={r.id}>
                  <td>{r.enabled ? <Badge variant="success" label="启用" /> : <Badge variant="muted" label="停用" />}</td>
                  <td>
                    <strong>{r.name || "-"}</strong>
                    <div className="admin-muted" style={{ marginTop: 3 }}>{r.title || "下载"}</div>
                  </td>
                  <td className="admin-nowrap">{r.entry_domain}</td>
                  <td className="admin-nowrap admin-break">
                    {r.real_target_type === "external" ? (
                      <>
                        <Badge variant="warning" label="外部网站" />
                        <div className="admin-muted" style={{ marginTop: 4 }}>{r.external_url || "-"}</div>
                      </>
                    ) : (
                      <>
                        <Badge variant="primary" label="内部出口" />
                        <div className="admin-muted" style={{ marginTop: 4 }}>{r.exit_domain || "-"}</div>
                      </>
                    )}
                  </td>
                  <td>{r.visits}</td>
                  <td>{r.downloads}</td>
                  <td>{r.image_path ? <img src={r.image_path} alt="" className="admin-thumb" /> : "-"}</td>
                  <td>{r.cloak_enabled ? <Badge variant="primary" label="开启" /> : <Badge variant="muted" label="关闭" />}</td>
                  <td>
                    <div className="admin-btn-row">
                      {link ? <button onClick={() => navigator.clipboard.writeText(link)} className="admin-btn">复制入口</button> : null}
                      <button onClick={() => openPromos(r)} className="admin-btn">推广码</button>
                    </div>
                  </td>
                  <td>
                    <div className="admin-btn-row">
                      <button onClick={() => openEdit(r)} className="admin-btn">编辑</button>
                      <button onClick={() => act("toggle", r.id)} className="admin-btn">{r.enabled ? "停用" : "启用"}</button>
                      <button onClick={() => act("delete", r.id)} className="admin-btn admin-btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="admin-empty">暂无线路</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="admin-modal-mask">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">{editingId ? "编辑线路" : "新增线路"}</h2>
              <button onClick={closeModal} className="admin-btn admin-btn-ghost">关闭</button>
            </div>

            <div className="admin-modal-body">
              <Section title="基础信息">
              <div className="admin-form-grid">
                <Field label="线路名称">
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} className="admin-input" placeholder="渠道 A" />
                </Field>
                <Field label="入口域名">
                  <input value={form.entry_domain} onChange={(e) => set("entry_domain", e.target.value)} className="admin-input" placeholder="go.example.com" />
                </Field>
                <Field label="线路状态">
                  <select value={form.enabled} onChange={(e) => set("enabled", Number(e.target.value))} className="admin-input">
                    <option value={1}>启用</option>
                    <option value={0}>停用</option>
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="真用户去向">
              <div className="admin-form-grid">
                <Field label="去向类型">
                  <select
                    value={form.real_target_type}
                    onChange={(e) => set("real_target_type", e.target.value as FormState["real_target_type"])}
                    className="admin-input"
                  >
                    <option value="internal">内部出口落地页</option>
                    <option value="external">外部网站</option>
                  </select>
                </Field>
                {form.real_target_type === "internal" ? (
                  <Field label="出口域名">
                    <input value={form.exit_domain || ""} onChange={(e) => set("exit_domain", e.target.value)} className="admin-input" placeholder="dl.example.com" />
                  </Field>
                ) : (
                  <Field label="外部网站 URL">
                    <input value={form.external_url} onChange={(e) => set("external_url", e.target.value)} className="admin-input" placeholder="https://example.com/path" />
                  </Field>
                )}
              </div>
            </Section>

            {form.real_target_type === "internal" && (
              <Section title="内部落地页">
                <div className="admin-form-grid">
                  <Field label="落地页标题">
                    <input value={form.title} onChange={(e) => set("title", e.target.value)} className="admin-input" />
                  </Field>
                  <Field label="APK 下载链接">
                    <input value={form.apk_url} onChange={(e) => set("apk_url", e.target.value)} className="admin-input" placeholder="https://.../app.apk" />
                  </Field>
                  <Field label="打开自动下载">
                    <select value={form.auto_download} onChange={(e) => set("auto_download", Number(e.target.value))} className="admin-input">
                      <option value={1}>开启</option>
                      <option value={0}>关闭</option>
                    </select>
                  </Field>
                </div>
                <ImageUpload label="落地页图片" value={form.image_path} onPick={(file) => upload(file, "image_path")} onClear={() => set("image_path", "")} />
              </Section>
            )}

            <Section title="分流设置">
              <div className="admin-form-grid">
                <Field label="启用分流">
                  <select value={form.cloak_enabled} onChange={(e) => set("cloak_enabled", Number(e.target.value))} className="admin-input">
                    <option value={0}>关闭</option>
                    <option value={1}>开启</option>
                  </select>
                </Field>
                <Field label="真人判定阈值">
                  <input type="number" min={1} max={30} value={form.cloak_threshold} onChange={(e) => set("cloak_threshold", Number(e.target.value))} className="admin-input" />
                </Field>
                <Field label="令牌有效期(小时)">
                  <input type="number" min={1} max={720} value={form.cloak_token_hours} onChange={(e) => set("cloak_token_hours", Number(e.target.value))} className="admin-input" />
                </Field>
                <Field label="假页面标题">
                  <input value={form.cloak_decoy_title} onChange={(e) => set("cloak_decoy_title", e.target.value)} className="admin-input" />
                </Field>
                <Field label="假 APK 链接">
                  <input value={form.cloak_decoy_apk_url} onChange={(e) => set("cloak_decoy_apk_url", e.target.value)} className="admin-input" placeholder="https://example.com/fake.apk" />
                </Field>
              </div>
              <ImageUpload label="假页面图片" value={form.cloak_decoy_image_path} onPick={(file) => upload(file, "cloak_decoy_image_path")} onClear={() => set("cloak_decoy_image_path", "")} />
            </Section>

              {error && <p className="admin-alert admin-alert-danger">{error}</p>}
            </div>
            <div className="admin-modal-footer">
              <button onClick={closeModal} className="admin-btn">取消</button>
              <button onClick={save} className="admin-btn admin-btn-primary">{editingId ? "保存修改" : "添加线路"}</button>
            </div>
          </div>
        </div>
      )}

      {promoRoute && (
        <div className="admin-modal-mask">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">推广码</h2>
                <p className="admin-page-desc">
                  {promoRoute.name || promoRoute.entry_domain} / {promoRoute.entry_domain}
                </p>
              </div>
              <button onClick={closePromos} className="admin-btn admin-btn-ghost">关闭</button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-panel admin-panel-padded">
                <div className="admin-form-grid">
                  <Field label="推广码">
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        className="admin-input"
                        placeholder="A1B2C3"
                      />
                      <button onClick={genPromoCode} className="admin-btn">随机</button>
                    </div>
                  </Field>
                  <Field label="渠道名称">
                    <input
                      value={promoName}
                      onChange={(e) => setPromoName(e.target.value)}
                      className="admin-input"
                      placeholder="渠道/分站名称"
                    />
                  </Field>
                  <Field label="专属 APK 链接(可选)">
                    <input
                      value={promoApkUrl}
                      onChange={(e) => setPromoApkUrl(e.target.value)}
                      className="admin-input"
                      placeholder={promoRoute.real_target_type === "internal" ? "留空则使用线路 APK" : "外部网站模式下不生效"}
                      disabled={promoRoute.real_target_type === "external"}
                    />
                  </Field>
                </div>
                <div className="admin-toolbar" style={{ marginTop: 16 }}>
                  <button
                    onClick={() =>
                      promoAct("add", {
                        route_id: promoRoute.id,
                        code: promoCode,
                        name: promoName,
                        apk_url: promoApkUrl,
                      })
                    }
                    className="admin-btn admin-btn-primary"
                  >
                    添加推广码
                  </button>
                  <span className="admin-muted" style={{ fontSize: 13 }}>
                    链接格式：https://{promoRoute.entry_domain}/?c=推广码
                    {promoRoute.real_target_type === "external" ? "，真用户会透传推广码到外部网站" : ""}
                  </span>
                </div>
                {promoError && <p className="admin-alert admin-alert-danger" style={{ marginTop: 12 }}>{promoError}</p>}
              </div>

              <div className="admin-panel admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      {["推广码", "名称", "访问", "下载", "状态", "推广链接", "APK 覆盖", "操作"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {promos.map((p) => {
                      const link = `https://${promoRoute.entry_domain}/?c=${p.code}`;
                      return (
                        <tr key={p.id}>
                          <td><span className="admin-code">{p.code}</span></td>
                          <td>{p.name || "-"}</td>
                          <td>{p.visits}</td>
                          <td>{p.downloads}</td>
                          <td>{p.enabled ? <Badge variant="success" label="启用" /> : <Badge variant="muted" label="停用" />}</td>
                          <td>
                            <button onClick={() => navigator.clipboard.writeText(link)} className="admin-btn" title={link}>
                              复制链接
                            </button>
                          </td>
                          <td className="admin-truncate admin-break" title={p.apk_url || ""}>{p.apk_url || "-"}</td>
                          <td>
                            <div className="admin-btn-row">
                              <button onClick={() => promoAct("toggle", { id: p.id })} className="admin-btn">
                                {p.enabled ? "停用" : "启用"}
                              </button>
                              <button onClick={() => promoAct("delete", { id: p.id })} className="admin-btn admin-btn-danger">
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {promos.length === 0 && (
                      <tr><td colSpan={8} className="admin-empty">暂无推广码</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-card admin-stat-card">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
    </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="admin-section">
      <h3 className="admin-section-title">{title}</h3>
      {children}
    </section>
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
      <div className="admin-label">{label}</div>
      <div className="admin-upload-row">
        {value ? <img src={value} alt={label} className="admin-preview" /> : null}
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
    </div>
  );
}
