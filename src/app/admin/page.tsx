import { getDb, getCurrentEntry, getCurrentExit, getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function Overview() {
  const db = getDb();
  const totalVisits = (db.prepare("SELECT COUNT(*) AS n FROM visits").get() as { n: number }).n;
  const totalDownloads = (db.prepare("SELECT COUNT(*) AS n FROM visits WHERE downloaded = 1").get() as { n: number }).n;
  const uniqueDevices = (db.prepare("SELECT COUNT(DISTINCT fingerprint) AS n FROM visits WHERE fingerprint != ''").get() as { n: number }).n;
  const today = (db.prepare("SELECT COUNT(*) AS n FROM visits WHERE date(created_at) = date('now','localtime')").get() as { n: number }).n;
  const routeCount = (db.prepare("SELECT COUNT(*) AS n FROM landing_routes").get() as { n: number }).n;

  const entry = getCurrentEntry();
  const exit = getCurrentExit();
  const apk = getSetting("apk_url");

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">数据总览</h1>
          <p className="admin-page-desc">查看访问、下载、设备和线路状态。</p>
        </div>
      </div>

      <div className="admin-stats-grid">
        <Card title="总访问" value={totalVisits} />
        <Card title="今日访问" value={today} />
        <Card title="触发下载" value={totalDownloads} />
        <Card title="独立设备" value={uniqueDevices} />
        <Card title="线路数量" value={routeCount} />
      </div>

      <div className="admin-panel admin-panel-padded">
        <h2 className="admin-section-title">兼容旧配置</h2>
        <p className="admin-page-desc" style={{ marginTop: 0 }}>
          若旧版本已设置入口/出口，系统会自动生成一条默认线路；后续请在线路管理里维护。
        </p>
        <Row label="当前入口域名" value={entry || "未设置"} ok={!!entry} />
        <Row label="当前出口域名" value={exit || "未设置"} ok={!!exit} />
        <Row label="APK 下载直链" value={apk || "未设置"} ok={!!apk} />
        {entry && (
          <p className="admin-page-desc" style={{ marginTop: 14 }}>
            推广链接格式：<code>https://{entry}/?c=推广码</code>
          </p>
        )}
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div className="admin-card admin-stat-card">
      <div className="admin-stat-label">{title}</div>
      <div className="admin-stat-value">{value}</div>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="admin-kv-row">
      <span className="admin-muted">{label}</span>
      <span className="admin-break" style={{ color: ok ? "var(--admin-text)" : "var(--admin-danger)" }}>
        {value}
      </span>
    </div>
  );
}
