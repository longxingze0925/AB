import { UAParser } from "ua-parser-js";
import { getDb } from "./db";
import { lookupGeo } from "./geo";

// 从请求头尽力取真实 IP(Caddy/CDN 会带 X-Forwarded-For)
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") || "";
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

export interface VisitInput {
  route_id?: number;
  promo_code: string;
  entry_domain: string;
  exit_domain: string;
  headers: Headers;
}

// 服务端首次记录访问,返回 visitId(供客户端后续回填屏幕/指纹等)
export async function recordVisit(input: VisitInput): Promise<number> {
  const { route_id, promo_code, entry_domain, exit_domain, headers } = input;
  const ua = headers.get("user-agent") || "";
  const ipInfo = getClientIp(headers);
  const uaInfo = parseUa(ua);
  const geo = await getGeo(ipInfo, headers);

  const stmt = getDb().prepare(`
    INSERT INTO visits (
      route_id, promo_code, entry_domain, exit_domain, ip,
      country, province, city, isp,
      os, os_version, device, browser, language, referer,
      is_mobile, user_agent
    ) VALUES (
      @route_id, @promo_code, @entry_domain, @exit_domain, @ip,
      @country, @province, @city, @isp,
      @os, @os_version, @device, @browser, @language, @referer,
      @is_mobile, @user_agent
    )
  `);

  const info = stmt.run({
    route_id: route_id || null,
    promo_code,
    entry_domain,
    exit_domain,
    ip: ipInfo,
    ...geo,
    os: uaInfo.os,
    os_version: uaInfo.os_version,
    device: uaInfo.device,
    browser: uaInfo.browser,
    language: headers.get("accept-language")?.split(",")[0] || "",
    referer: headers.get("referer") || "",
    is_mobile: uaInfo.is_mobile,
    user_agent: ua,
  });

  return Number(info.lastInsertRowid);
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
