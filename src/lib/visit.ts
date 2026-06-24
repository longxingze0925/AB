import { UAParser } from "ua-parser-js";
import { getDb } from "./db";
import { lookupGeo } from "./geo";

export interface ClientIpInfo {
  ip: string;
  source: string;
}

// 从请求头尽力取真实 IP。Cloudflare 小黄云下优先读取 CF-Connecting-IP。
export function getClientIpInfo(headers: Headers): ClientIpInfo {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return { ip: cf.trim(), source: "cf-connecting-ip" };

  const trueClient = headers.get("true-client-ip");
  if (trueClient) return { ip: trueClient.trim(), source: "true-client-ip" };

  const xff = headers.get("x-forwarded-for");
  if (xff) return { ip: xff.split(",")[0].trim(), source: "x-forwarded-for" };

  const real = headers.get("x-real-ip");
  if (real) return { ip: real.trim(), source: "x-real-ip" };

  return { ip: "", source: "" };
}

export function getClientIp(headers: Headers): string {
  return getClientIpInfo(headers).ip;
}

// 解析 UA → 操作系统/设备/浏览器(含微信、QQ、抖音等容器识别)
export function parseUa(ua: string) {
  const p = new UAParser(ua);
  const os = p.getOS();
  const device = p.getDevice();
  let browser = p.getBrowser().name || "";

  // 补充常见国内 App 内置浏览器识别
  const u = ua.toLowerCase();
  if (u.includes("micromessenger")) browser = "微信";
  else if (u.includes("qq/")) browser = "QQ";
  else if (u.includes("weibo")) browser = "微博";
  else if (u.includes("aweme") || u.includes("bytedance")) browser = "抖音/字节";
  else if (u.includes("ucbrowser")) browser = "UC浏览器";
  else if (u.includes("quark")) browser = "夸克";

  const isMobile = device.type === "mobile" || device.type === "tablet";

  return {
    os: os.name || "",
    os_version: os.version || "",
    device: [device.vendor, device.model].filter(Boolean).join(" "),
    browser,
    is_mobile: isMobile ? 1 : 0,
  };
}

// IP 归属地:优先用本地库(geo.ts)精确到省市+运营商;
// 库缺失时回退到 CDN 头(Cloudflare 提供 cf-ipcountry)
export async function getGeo(ip: string, headers: Headers) {
  const r = await lookupGeo(ip);
  return {
    country: r.country || headers.get("cf-ipcountry") || "",
    province: r.province || "",
    city: r.city || "",
    isp: r.isp || "",
  };
}

type GeoInfo = Awaited<ReturnType<typeof getGeo>>;

function fallbackGeo(headers: Headers): GeoInfo {
  return {
    country: headers.get("cf-ipcountry") || "",
    province: "",
    city: "",
    isp: "",
  };
}

async function lookupGeoWithFallback(ip: string, fallbackCountry: string): Promise<GeoInfo> {
  const r = await lookupGeo(ip);
  return {
    country: r.country || fallbackCountry || "",
    province: r.province || "",
    city: r.city || "",
    isp: r.isp || "",
  };
}

export interface VisitInput {
  route_id?: number;
  promo_code: string;
  page_variant?: "real" | "fake" | "probe" | "unknown";
  cloak_reason?: string;
  entry_domain: string;
  exit_domain: string;
  headers: Headers;
}

export interface PreparedVisit {
  ipInfo: ClientIpInfo;
  ua: string;
  uaInfo: ReturnType<typeof parseUa>;
  geo: GeoInfo;
  language: string;
  referer: string;
  cfRay: string;
}

// 快速准备访问记录字段。Geo 精细字段后台回填，不阻塞入口/verify 响应。
export function prepareVisitFast(input: Pick<VisitInput, "headers">): PreparedVisit {
  const { headers } = input;
  const ua = headers.get("user-agent") || "";
  const ipInfo = getClientIpInfo(headers);
  const uaInfo = parseUa(ua);

  return {
    ipInfo,
    ua,
    uaInfo,
    geo: fallbackGeo(headers),
    language: headers.get("accept-language")?.split(",")[0] || "",
    referer: headers.get("referer") || "",
    cfRay: headers.get("cf-ray") || "",
  };
}

// 提前准备访问记录里的派生字段。页面类型和分流原因出来后再写入,字段不减少。
export async function prepareVisit(input: Pick<VisitInput, "headers">): Promise<PreparedVisit> {
  const prepared = prepareVisitFast(input);
  prepared.geo = await getGeo(prepared.ipInfo.ip, input.headers);
  return prepared;
}

// 服务端首次记录访问,返回 visitId(供客户端后续回填屏幕/指纹等)
export async function recordVisit(input: VisitInput): Promise<number> {
  return recordVisitFast(input);
}

export function recordVisitFast(input: VisitInput): number {
  const prepared = prepareVisitFast(input);
  const id = recordPreparedVisit(input, prepared);
  enrichVisitGeo(id, prepared.ipInfo.ip, prepared.geo.country);
  return id;
}

export function recordPreparedVisit(input: VisitInput, prepared: PreparedVisit): number {
  const { route_id, promo_code, page_variant, cloak_reason, entry_domain, exit_domain } = input;
  const stmt = getDb().prepare(`
    INSERT INTO visits (
      route_id, promo_code, page_variant, cloak_reason, entry_domain, exit_domain, ip, ip_source, cf_ray,
      country, province, city, isp,
      os, os_version, device, browser, language, referer,
      is_mobile, user_agent
    ) VALUES (
      @route_id, @promo_code, @page_variant, @cloak_reason, @entry_domain, @exit_domain, @ip, @ip_source, @cf_ray,
      @country, @province, @city, @isp,
      @os, @os_version, @device, @browser, @language, @referer,
      @is_mobile, @user_agent
    )
  `);

  const info = stmt.run({
    route_id: route_id || null,
    promo_code,
    page_variant: page_variant || "unknown",
    cloak_reason: cloak_reason || "",
    entry_domain,
    exit_domain,
    ip: prepared.ipInfo.ip,
    ip_source: prepared.ipInfo.source,
    cf_ray: prepared.cfRay,
    ...prepared.geo,
    os: prepared.uaInfo.os,
    os_version: prepared.uaInfo.os_version,
    device: prepared.uaInfo.device,
    browser: prepared.uaInfo.browser,
    language: prepared.language,
    referer: prepared.referer,
    is_mobile: prepared.uaInfo.is_mobile,
    user_agent: prepared.ua,
  });

  return Number(info.lastInsertRowid);
}

export function enrichVisitGeo(id: number, ip: string, fallbackCountry = "") {
  if (!id || !ip) return;
  void lookupGeoWithFallback(ip, fallbackCountry)
    .then((geo) => {
      getDb()
        .prepare(
          "UPDATE visits SET country=@country, province=@province, city=@city, isp=@isp WHERE id=@id"
        )
        .run({ id, ...geo });
    })
    .catch(() => {
      // Geo 回填失败不影响分流和访问记录。
    });
}

// 客户端回填:屏幕/时区/网络/指纹
export function updateVisitClient(
  id: number,
  data: { screen?: string; timezone?: string; network?: string; fingerprint?: string }
) {
  getDb()
    .prepare(
      `UPDATE visits SET screen=@screen, timezone=@timezone, network=@network, fingerprint=@fingerprint WHERE id=@id`
    )
    .run({
      id,
      screen: data.screen || "",
      timezone: data.timezone || "",
      network: data.network || "",
      fingerprint: data.fingerprint || "",
    });
}

// 标记已触发下载
export function markDownloaded(id: number) {
  getDb().prepare("UPDATE visits SET downloaded = 1 WHERE id = ?").run(id);
}
