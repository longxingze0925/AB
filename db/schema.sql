-- ============================================================
-- APK 落地分发系统 数据库结构 (SQLite)
-- ============================================================

-- 全局设置(键值对):当前入口域名、当前出口域名、APK直链、展示图片等
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 入口域名池:用户点击的域名,可随时增删、切换"当前入口"
CREATE TABLE IF NOT EXISTS entry_domains (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  domain     TEXT NOT NULL UNIQUE,     -- 如 go.aaa.com
  is_current INTEGER NOT NULL DEFAULT 0, -- 1=当前启用的入口
  note       TEXT,                      -- 备注
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 出口域名池:实际触发 APK 下载的域名,可随时增删、切换"当前出口"
CREATE TABLE IF NOT EXISTS exit_domains (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  domain     TEXT NOT NULL UNIQUE,     -- 如 dl.bbb.com
  is_current INTEGER NOT NULL DEFAULT 0, -- 1=当前启用的出口
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 推广码 / 推广位:区分流量来源(分站、渠道)
CREATE TABLE IF NOT EXISTS promo_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id   INTEGER,                    -- 归属线路；空表示旧全局推广码
  code       TEXT NOT NULL UNIQUE,     -- 如 A1B2
  name       TEXT,                      -- 渠道/分站名称
  apk_url    TEXT,                      -- 可选:该推广码专属 APK 直链(空则用全局)
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 访问记录:每个打开链接的人一行
CREATE TABLE IF NOT EXISTS visits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id      INTEGER,                -- 命中的线路 ID
  promo_code    TEXT,                   -- 推广码
  page_variant  TEXT DEFAULT 'unknown', -- real/fake/probe/unknown
  cloak_reason  TEXT DEFAULT '',        -- 分流原因
  entry_domain  TEXT,                   -- 命中的入口域名
  exit_domain   TEXT,                   -- 跳转到的出口域名
  ip            TEXT,
  ip_source     TEXT DEFAULT '',        -- cf-connecting-ip/x-forwarded-for/x-real-ip
  cf_ray        TEXT DEFAULT '',        -- Cloudflare Ray ID
  country       TEXT,
  province      TEXT,
  city          TEXT,
  isp           TEXT,                   -- 运营商
  os            TEXT,                   -- 操作系统
  os_version    TEXT,
  device        TEXT,                   -- 设备型号
  browser       TEXT,                   -- 浏览器/容器(微信/QQ等)
  language      TEXT,
  referer       TEXT,
  screen        TEXT,                   -- 屏幕分辨率(客户端回填)
  timezone      TEXT,                   -- 时区(客户端回填)
  network       TEXT,                   -- 网络类型(客户端回填)
  fingerprint   TEXT,                   -- 设备指纹(客户端回填)
  is_mobile     INTEGER,                -- 是否移动端
  downloaded    INTEGER DEFAULT 0,      -- 是否成功触发下载
  user_agent    TEXT,                   -- 原始 UA
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_visits_promo   ON visits(promo_code);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);
CREATE INDEX IF NOT EXISTS idx_visits_fp      ON visits(fingerprint);
CREATE INDEX IF NOT EXISTS idx_visits_route   ON visits(route_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_route ON promo_codes(route_id);

-- 落地页模板：上传的静态模板包
CREATE TABLE IF NOT EXISTS landing_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  entry_file  TEXT NOT NULL DEFAULT 'index.html',
  file_count  INTEGER NOT NULL DEFAULT 0,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 线路配置：一条线路 = 入口域名 + 真用户去向(内部出口/外部网站) + 假页面 + 分流设置
CREATE TABLE IF NOT EXISTS landing_routes (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  name                   TEXT NOT NULL DEFAULT '',
  entry_domain           TEXT NOT NULL UNIQUE,
  exit_domain            TEXT UNIQUE DEFAULT NULL,
  real_target_type       TEXT NOT NULL DEFAULT 'internal', -- internal=内部出口落地页, external=外部网站
  external_url           TEXT NOT NULL DEFAULT '',
  landing_mode           TEXT NOT NULL DEFAULT 'default',  -- default=默认页面, template=自定义模板
  landing_template_id    INTEGER DEFAULT NULL,
  title                  TEXT NOT NULL DEFAULT '下载',
  image_path             TEXT NOT NULL DEFAULT '', -- 仅支持本地上传路径，如 /uploads/xxx.webp
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
CREATE INDEX IF NOT EXISTS idx_landing_routes_entry ON landing_routes(entry_domain);
CREATE INDEX IF NOT EXISTS idx_landing_routes_exit  ON landing_routes(exit_domain);
CREATE INDEX IF NOT EXISTS idx_landing_routes_template ON landing_routes(landing_template_id);

-- 分流(cloak)配置：假页面内容 + 判定参数存入 settings 表，键名以 cloak_ 开头
-- cloak_enabled        : "1"=开启分流, "0"=关闭(所有流量走真实页面)
-- cloak_threshold      : 总分(请求头分+JS探针分)阈值，达到判真人，默认 8
-- cloak_token_hours    : 真人令牌有效期(小时)，默认 6
-- cloak_decoy_apk_url  : 假 APK 链接
-- cloak_decoy_image_url: 假图片
-- cloak_decoy_title    : 假页面标题

-- PTR 反查缓存（内存已够用，此表供跨进程/重启复用）
CREATE TABLE IF NOT EXISTS ptr_cache (
  ip         TEXT PRIMARY KEY,
  is_dc      INTEGER NOT NULL DEFAULT 0,
  is_bot     INTEGER NOT NULL DEFAULT 0,
  host       TEXT NOT NULL DEFAULT '',
  cached_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 手动 IP 黑名单：支持 IPv4 / IPv6 / CIDR（如 1.2.3.0/24、2605:52c0::/32）
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cidr       TEXT NOT NULL UNIQUE,        -- 单 IP 或 CIDR，如 1.2.3.4、1.2.3.0/24、2605:52c0::/32
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_cidr ON ip_blacklist(cidr);
