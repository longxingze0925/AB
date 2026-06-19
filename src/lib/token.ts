import { createHmac, timingSafeEqual } from "node:crypto";

// 令牌格式：base64(ip:expireTs:hmac)
// HttpOnly cookie，绑定 IP，防伪造

function getSecret(): string {
  return process.env.SESSION_SECRET || "dev_secret_change_me";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function issueHumanToken(ip: string, ttlHours: number): string {
  const exp = Date.now() + ttlHours * 3600 * 1000;
  const payload = `${ip}:${exp}`;
  const mac = sign(payload);
  return Buffer.from(`${payload}:${mac}`).toString("base64url");
}

export function verifyHumanToken(token: string, ip: string): boolean {
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
    const tokenIp = parts.slice(0, -1).join(":");
    const exp = parseInt(parts[parts.length - 1], 10);

    if (tokenIp !== ip) return false;
    if (Date.now() > exp) return false;

    return true;
  } catch {
    return false;
  }
}

export const HUMAN_COOKIE = "hv";
export const PROBED_COOKIE = "hpb";
