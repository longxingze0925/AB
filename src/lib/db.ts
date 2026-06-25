import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { normalizeUploadImagePath } from "./uploads";

export interface LandingRoute {
  id: number;
  name: string;
  entry_domain: string;
  exit_domain: string | null;
  real_target_type: "internal" | "external";
  external_url: string;
  landing_mode: "default" | "template";
  landing_template_id: number | null;
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
  meta_enabled: number;
  meta_pixel_id: string;
  meta_capi_token: string;
  meta_test_event_code: string;
  meta_currency: string;
  meta_value: number;
  meta_page_view_enabled: number;
  meta_view_content_enabled: number;
  meta_lead_enabled: number;
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
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 3000");
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

function columnIsNotNull(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[];
  const row = rows.find((r) => r.name === column);
  return !!row?.notnull;
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
  if (hasTable(db, "landing_templates")) {
    if (!hasColumn(db, "landing_templates", "entry_file")) {
      db.exec("ALTER TABLE landing_templates ADD COLUMN entry_file TEXT NOT NULL DEFAULT 'index.html'");
    }
    if (!hasColumn(db, "landing_templates", "file_count")) {
      db.exec("ALTER TABLE landing_templates ADD COLUMN file_count INTEGER NOT NULL DEFAULT 0");
    }
    if (!hasColumn(db, "landing_templates", "size_bytes")) {
      db.exec("ALTER TABLE landing_templates ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0");
    }
  }
  if (hasTable(db, "landing_routes")) {
    if (!hasColumn(db, "landing_routes", "real_target_type")) {
      db.exec("ALTER TABLE landing_routes ADD COLUMN real_target_type TEXT DEFAULT 'internal'");
    }
    if (!hasColumn(db, "landing_routes", "external_url")) {
      db.exec("ALTER TABLE landing_routes ADD COLUMN external_url TEXT DEFAULT ''");
    }
    if (!hasColumn(db, "landing_routes", "landing_mode")) {
      db.exec("ALTER TABLE landing_routes ADD COLUMN landing_mode TEXT NOT NULL DEFAULT 'default'");
    }
    if (!hasColumn(db, "landing_routes", "landing_template_id")) {
      db.exec("ALTER TABLE landing_routes ADD COLUMN landing_template_id INTEGER");
    }
    ensureLandingRouteMetaColumns(db);
    if (columnIsNotNull(db, "landing_routes", "exit_domain")) {
      rebuildLandingRoutesForExternalTargets(db);
    }
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
  if (!hasColumn(db, "landing_templates", "entry_file")) {
    db.exec("ALTER TABLE landing_templates ADD COLUMN entry_file TEXT NOT NULL DEFAULT 'index.html'");
  }
  if (!hasColumn(db, "landing_templates", "file_count")) {
    db.exec("ALTER TABLE landing_templates ADD COLUMN file_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn(db, "landing_templates", "size_bytes")) {
    db.exec("ALTER TABLE landing_templates ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn(db, "landing_routes", "real_target_type")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN real_target_type TEXT DEFAULT 'internal'");
  }
  if (!hasColumn(db, "landing_routes", "external_url")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN external_url TEXT DEFAULT ''");
  }
  if (!hasColumn(db, "landing_routes", "landing_mode")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN landing_mode TEXT NOT NULL DEFAULT 'default'");
  }
  if (!hasColumn(db, "landing_routes", "landing_template_id")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN landing_template_id INTEGER");
  }
  ensureLandingRouteMetaColumns(db);
  if (columnIsNotNull(db, "landing_routes", "exit_domain")) {
    rebuildLandingRoutesForExternalTargets(db);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_landing_routes_entry ON landing_routes(entry_domain)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_landing_routes_exit ON landing_routes(exit_domain)");
}

function ensureLandingRouteMetaColumns(db: Database.Database) {
  if (!hasColumn(db, "landing_routes", "meta_enabled")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_enabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn(db, "landing_routes", "meta_pixel_id")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_pixel_id TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, "landing_routes", "meta_capi_token")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_capi_token TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, "landing_routes", "meta_test_event_code")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_test_event_code TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, "landing_routes", "meta_currency")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_currency TEXT NOT NULL DEFAULT 'USD'");
  }
  if (!hasColumn(db, "landing_routes", "meta_value")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_value REAL NOT NULL DEFAULT 0");
  }
  if (!hasColumn(db, "landing_routes", "meta_page_view_enabled")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_page_view_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!hasColumn(db, "landing_routes", "meta_view_content_enabled")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_view_content_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!hasColumn(db, "landing_routes", "meta_lead_enabled")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN meta_lead_enabled INTEGER NOT NULL DEFAULT 1");
  }
}

function rebuildLandingRoutesForExternalTargets(db: Database.Database) {
  if (!hasColumn(db, "landing_routes", "real_target_type")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN real_target_type TEXT DEFAULT 'internal'");
  }
  if (!hasColumn(db, "landing_routes", "external_url")) {
    db.exec("ALTER TABLE landing_routes ADD COLUMN external_url TEXT DEFAULT ''");
  }
  ensureLandingRouteMetaColumns(db);
  db.exec(`
    DROP INDEX IF EXISTS idx_landing_routes_entry;
    DROP INDEX IF EXISTS idx_landing_routes_exit;
    ALTER TABLE landing_routes RENAME TO landing_routes_old_target_migration;

    CREATE TABLE landing_routes (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      name                   TEXT NOT NULL DEFAULT '',
      entry_domain           TEXT NOT NULL UNIQUE,
      exit_domain            TEXT UNIQUE DEFAULT NULL,
      real_target_type       TEXT NOT NULL DEFAULT 'internal',
      external_url           TEXT NOT NULL DEFAULT '',
      title                  TEXT NOT NULL DEFAULT '下载',
      image_path             TEXT NOT NULL DEFAULT '',
      apk_url                TEXT NOT NULL DEFAULT '',
      auto_download          INTEGER NOT NULL DEFAULT 1,
      cloak_enabled          INTEGER NOT NULL DEFAULT 0,
      cloak_threshold        INTEGER NOT NULL DEFAULT 8,
      cloak_token_hours      INTEGER NOT NULL DEFAULT 6,
      cloak_decoy_title      TEXT NOT NULL DEFAULT '下载',
      cloak_decoy_image_path TEXT NOT NULL DEFAULT '',
      cloak_decoy_apk_url    TEXT NOT NULL DEFAULT '',
      meta_enabled           INTEGER NOT NULL DEFAULT 0,
      meta_pixel_id          TEXT NOT NULL DEFAULT '',
      meta_capi_token        TEXT NOT NULL DEFAULT '',
      meta_test_event_code   TEXT NOT NULL DEFAULT '',
      meta_currency          TEXT NOT NULL DEFAULT 'USD',
      meta_value             REAL NOT NULL DEFAULT 0,
      meta_page_view_enabled INTEGER NOT NULL DEFAULT 1,
      meta_view_content_enabled INTEGER NOT NULL DEFAULT 1,
      meta_lead_enabled      INTEGER NOT NULL DEFAULT 1,
      enabled                INTEGER NOT NULL DEFAULT 1,
      created_at             TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    INSERT INTO landing_routes (
      id, name, entry_domain, exit_domain, real_target_type, external_url,
      title, image_path, apk_url, auto_download, cloak_enabled, cloak_threshold,
      cloak_token_hours, cloak_decoy_title, cloak_decoy_image_path,
      cloak_decoy_apk_url, meta_enabled, meta_pixel_id, meta_capi_token,
      meta_test_event_code, meta_currency, meta_value, meta_page_view_enabled,
      meta_view_content_enabled, meta_lead_enabled, enabled, created_at, updated_at
    )
    SELECT
      id, name, entry_domain, NULLIF(exit_domain, ''),
      CASE WHEN real_target_type = 'external' THEN 'external' ELSE 'internal' END,
      COALESCE(external_url, ''),
      title, image_path, apk_url, auto_download, cloak_enabled, cloak_threshold,
      cloak_token_hours, cloak_decoy_title, cloak_decoy_image_path,
      cloak_decoy_apk_url,
      COALESCE(meta_enabled, 0),
      COALESCE(meta_pixel_id, ''),
      COALESCE(meta_capi_token, ''),
      COALESCE(meta_test_event_code, ''),
      COALESCE(meta_currency, 'USD'),
      COALESCE(meta_value, 0),
      COALESCE(meta_page_view_enabled, 1),
      COALESCE(meta_view_content_enabled, 1),
      COALESCE(meta_lead_enabled, 1),
      enabled, created_at, updated_at
    FROM landing_routes_old_target_migration;

    DROP TABLE landing_routes_old_target_migration;
    CREATE INDEX IF NOT EXISTS idx_landing_routes_entry ON landing_routes(entry_domain);
    CREATE INDEX IF NOT EXISTS idx_landing_routes_exit ON landing_routes(exit_domain);
  `);
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
  const flag = db.prepare("SELECT value FROM settings WHERE key = ?").get("legacy_routes_migrated") as
    | { value: string }
    | undefined;
  if (flag?.value === "1") return;

  const markMigrated = () => {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run("legacy_routes_migrated", "1");
  };

  const routeCount = (db.prepare("SELECT COUNT(*) AS n FROM landing_routes").get() as { n: number }).n;
  if (routeCount > 0) {
    markMigrated();
    return;
  }

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

  const result = db.prepare(
    `
    INSERT OR IGNORE INTO landing_routes (
      name, entry_domain, exit_domain, real_target_type, external_url, landing_mode, landing_template_id, title, image_path, apk_url, auto_download,
      cloak_enabled, cloak_threshold, cloak_token_hours,
      cloak_decoy_title, cloak_decoy_image_path, cloak_decoy_apk_url, enabled
    ) VALUES (
      @name, @entry_domain, @exit_domain, 'internal', '', 'default', NULL, @title, @image_path, @apk_url, @auto_download,
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
  if (result.changes > 0) markMigrated();
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
    .prepare(
      "SELECT * FROM landing_routes WHERE exit_domain = ? AND real_target_type = 'internal' AND enabled = 1 LIMIT 1"
    )
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
      `SELECT 1 FROM landing_routes
       WHERE enabled = 1
         AND (entry_domain = ? OR (real_target_type = 'internal' AND exit_domain = ?))
       LIMIT 1`
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
