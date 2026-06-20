import { createHmac, timingSafeEqual } from "node:crypto";

// 令牌格式：base64(ip:scope:expireTs:hmac)
// HttpOnly cookie，绑定 IP 与线路 scope，防伪造/串线

function getSecret(): string {
  return process.env.SESSION_SECRET || "dev_secret_change_me";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function issueHumanToken(ip: string, ttlHours: number, scope = "global"): string {
  const exp = Date.now() + ttlHours * 3600 * 1000;
  const payload = `${ip}:${scope}:${exp}`;
  const mac = sign(payload);
  return Buffer.from(`${payload}:${mac}`).toString("base64url");
}

export function verifyHumanToken(token: string, ip: string, scope = "global"): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) return false;
    const payload = decoded.slice(0, lastColon);
    const mac = decoded.slice(lastColon + 1);

    // 时序安全比对
    const expected = sign(payload);
    if (expected.length !== mac.length) return false;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return false;

    const parts = payload.split(":");
    if (parts.length < 2) return false;
    const exp = parseInt(parts[parts.length - 1], 10);
    const tokenScope = parts.length >= 3 ? parts[parts.length - 2] : "global";
    const tokenIp = parts.length >= 3 ? parts.slice(0, -2).join(":") : parts.slice(0, -1).join(":");

    if (tokenIp !== ip) return false;
    if (tokenScope !== scope) return false;
    if (Date.now() > exp) return false;

    return true;
  } catch {
    return false;
  }
}

export const HUMAN_COOKIE = "hv";
export const PROBED_COOKIE = "hpb";
