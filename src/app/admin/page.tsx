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
      <h1 style={{ fontSize: 22, marginTop: 0 }}>数据总览</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16, marginBottom: 24 }}>
        <Card title="总访问" value={totalVisits} />
        <Card title="今日访问" value={today} />
        <Card title="触发下载" value={totalDownloads} />
        <Card title="独立设备" value={uniqueDevices} />
        <Card title="线路数量" value={routeCount} />
      </div>

      <div style={{ background: "#fff", padding: 20, borderRadius: 10, border: "1px solid #e5e7eb" }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>兼容旧配置</h2>
        <p style={{ color: "#6b7280", fontSize: 13, marginTop: 0 }}>
          若旧版本已设置入口/出口，系统会自动生成一条默认线路；后续请在线路管理里维护。
        </p>
        <Row label="当前入口域名" value={entry || "未设置"} ok={!!entry} />
        <Row label="当前出口域名" value={exit || "未设置"} ok={!!exit} />
        <Row label="APK 下载直链" value={apk || "未设置"} ok={!!apk} />
        {entry && (
          <p style={{ marginTop: 16, fontSize: 13, color: "#555" }}>
            推广链接格式:<code>https://{entry}/?c=推广码</code>
          </p>
        )}
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ background: "#fff", padding: 20, borderRadius: 10, border: "1px solid #e5e7eb" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: 14 }}>
      <span style={{ width: 140, color: "#6b7280" }}>{label}</span>
      <span style={{ color: ok ? "#111827" : "#dc2626", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}
