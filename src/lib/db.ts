import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// 单例数据库连接,避免热重载时重复打开
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 首次运行自动建表
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf8"));
  }

  ensureDefaults(db);
  _db = db;
  return _db;
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
