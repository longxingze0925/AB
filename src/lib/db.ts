import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { normalizeUploadImagePath } from "./uploads";

export interface LandingRoute {
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
  created_at: string;
  updated_at: string;
}

// 单例数据库连接,避免热重载时重复打开
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 旧库先补列，再执行 schema 中依赖新列的索引创建。
  migrateBeforeSchema(db);

  // 首次运行自动建表
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf8"));
  }

  migrateAfterSchema(db);
  ensureDefaults(db);
  ensureDefaultRouteFromLegacy(db);
  _db = db;
  return _db;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return !!row;
}

function migrateBeforeSchema(db: Database.Database) {
  if (hasTable(db, "visits") && !hasColumn(db, "visits", "route_id")) {
    db.exec("ALTER TABLE visits ADD COLUMN route_id INTEGER");
  }
  if (hasTable(db, "visits") && !hasColumn(db, "visits", "page_variant")) {
    db.exec("ALTER TABLE visits ADD COLUMN page_variant TEXT DEFAULT 'unknown'");
  }
  if (hasTable(db, "visits") && !hasColumn(db, "visits", "cloak_reason")) {
    db.exec("ALTER TABLE visits ADD COLUMN cloak_reason TEXT DEFAULT ''");
  }
  if (hasTable(db, "visits") && !hasColumn(db, "visits", "ip_source")) {
    db.exec("ALTER TABLE visits ADD COLUMN ip_source TEXT DEFAULT ''");
  }
  if (hasTable(db, "visits") && !hasColumn(db, "visits", "cf_ray")) {
    db.exec("ALTER TABLE visits ADD COLUMN cf_ray TEXT DEFAULT ''");
  }
  if (hasTable(db, "promo_codes") && !hasColumn(db, "promo_codes", "route_id")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN route_id INTEGER");
  }
}

function migrateAfterSchema(db: Database.Database) {
  if (!hasColumn(db, "visits", "route_id")) {
    db.exec("ALTER TABLE visits ADD COLUMN route_id INTEGER");
  }
  if (!hasColumn(db, "visits", "page_variant")) {
    db.exec("ALTER TABLE visits ADD COLUMN page_variant TEXT DEFAULT 'unknown'");
  }
  if (!hasColumn(db, "visits", "cloak_reason")) {
    db.exec("ALTER TABLE visits ADD COLUMN cloak_reason TEXT DEFAULT ''");
  }
  if (!hasColumn(db, "visits", "ip_source")) {
    db.exec("ALTER TABLE visits ADD COLUMN ip_source TEXT DEFAULT ''");
  }
  if (!hasColumn(db, "visits", "cf_ray")) {
    db.exec("ALTER TABLE visits ADD COLUMN cf_ray TEXT DEFAULT ''");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_visits_route ON visits(route_id)");
  if (!hasColumn(db, "promo_codes", "route_id")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN route_id INTEGER");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_promo_codes_route ON promo_codes(route_id)");
}

// 写入默认设置项(只在不存在时插入)
function ensureDefaults(db: Database.Database) {
  const defaults: Record<string, string> = {
    apk_url: "",
    title: "下载",
    image_url: "",
    auto_download: "1",
    fallback_redirect: "1",
    cloak_enabled: "0",
    cloak_threshold: "8",
    cloak_token_hours: "6",
    cloak_decoy_apk_url: "",
    cloak_decoy_image_url: "",
    cloak_decoy_title: "下载",
  };
  const get = db.prepare("SELECT value FROM settings WHERE key = ?");
  const set = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) {
      if (!get.get(k)) set.run(k, v);
    }
  });
  tx();
}

function ensureDefaultRouteFromLegacy(db: Database.Database) {
  const routeCount = (db.prepare("SELECT COUNT(*) AS n FROM landing_routes").get() as { n: number }).n;
  if (routeCount > 0) return;

  const entry = db
    .prepare("SELECT domain FROM entry_domains WHERE is_current = 1 ORDER BY id DESC LIMIT 1")
    .get() as { domain: string } | undefined;
  const exit = db
    .prepare("SELECT domain FROM exit_domains WHERE is_current = 1 ORDER BY id DESC LIMIT 1")
    .get() as { domain: string } | undefined;

  if (!entry?.domain || !exit?.domain) return;

  const setting = (key: string, fallback = "") => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value || fallback;
  };

  db.prepare(
    `
    INSERT OR IGNORE INTO landing_routes (
      name, entry_domain, exit_domain, title, image_path, apk_url, auto_download,
      cloak_enabled, cloak_threshold, cloak_token_hours,
      cloak_decoy_title, cloak_decoy_image_path, cloak_decoy_apk_url, enabled
    ) VALUES (
      @name, @entry_domain, @exit_domain, @title, @image_path, @apk_url, @auto_download,
      @cloak_enabled, @cloak_threshold, @cloak_token_hours,
      @cloak_decoy_title, @cloak_decoy_image_path, @cloak_decoy_apk_url, 1
    )
  `
  ).run({
    name: "默认线路",
    entry_domain: entry.domain,
    exit_domain: exit.domain,
    title: setting("title", "下载"),
    image_path: normalizeUploadImagePath(setting("image_url")),
    apk_url: setting("apk_url"),
    auto_download: Number(setting("auto_download", "1")),
    cloak_enabled: Number(setting("cloak_enabled", "0")),
    cloak_threshold: Number(setting("cloak_threshold", "8")),
    cloak_token_hours: Number(setting("cloak_token_hours", "6")),
    cloak_decoy_title: setting("cloak_decoy_title", "下载"),
    cloak_decoy_image_path: normalizeUploadImagePath(setting("cloak_decoy_image_url")),
    cloak_decoy_apk_url: setting("cloak_decoy_apk_url"),
  });
}

// ---- 设置读写 ----
export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

// ---- 当前入口/出口域名 ----
export function getCurrentEntry(): string | null {
  const row = getDb().prepare("SELECT domain FROM entry_domains WHERE is_current = 1 LIMIT 1").get() as
    | { domain: string }
    | undefined;
  return row ? row.domain : null;
}

export function getCurrentExit(): string | null {
  const row = getDb().prepare("SELECT domain FROM exit_domains WHERE is_current = 1 LIMIT 1").get() as
    | { domain: string }
    | undefined;
  return row ? row.domain : null;
}

// 判断某域名是否属于入口池
export function isEntryDomain(domain: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM entry_domains WHERE domain = ?").get(domain);
}

// 判断某域名是否属于出口池
export function isExitDomain(domain: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM exit_domains WHERE domain = ?").get(domain);
}

// ---- 线路配置 ----
export function getRouteByEntry(domain: string): LandingRoute | null {
  const row = getDb()
    .prepare("SELECT * FROM landing_routes WHERE entry_domain = ? AND enabled = 1 LIMIT 1")
    .get(domain) as LandingRoute | undefined;
  return row || null;
}

export function getRouteByExit(domain: string): LandingRoute | null {
  const row = getDb()
    .prepare("SELECT * FROM landing_routes WHERE exit_domain = ? AND enabled = 1 LIMIT 1")
    .get(domain) as LandingRoute | undefined;
  return row || null;
}

export function getRouteById(id: number): LandingRoute | null {
  const row = getDb()
    .prepare("SELECT * FROM landing_routes WHERE id = ? LIMIT 1")
    .get(id) as LandingRoute | undefined;
  return row || null;
}

export function isRouteDomain(domain: string): boolean {
  return !!getDb()
    .prepare(
      "SELECT 1 FROM landing_routes WHERE enabled = 1 AND (entry_domain = ? OR exit_domain = ?) LIMIT 1"
    )
    .get(domain, domain);
}

export interface PromoCode {
  id: number;
  route_id: number | null;
  code: string;
  name: string;
  apk_url: string;
  enabled: number;
  created_at: string;
}

export function getPromoForRoute(routeId: number, code: string): PromoCode | null {
  const promo = String(code || "").trim();
  if (!promo) return null;
  const row = getDb()
    .prepare("SELECT * FROM promo_codes WHERE route_id = ? AND code = ? AND enabled = 1 LIMIT 1")
    .get(routeId, promo) as PromoCode | undefined;
  return row || null;
}
