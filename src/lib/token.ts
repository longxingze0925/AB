import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parseIp } from "./ip";

// 令牌格式：base64(clientKey:scope:expireTs:hmac)
// HttpOnly cookie，绑定稳定客户端 key 与线路 scope，避免 Cloudflare/IPv6 完整 IP 波动导致循环探针。

function getSecret(): string {
  return process.env.SESSION_SECRET || "dev_secret_change_me";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function getIpBucket(ip: string): string {
  const parsed = parseIp(ip);
  if (!parsed) return String(ip || "").trim().toLowerCase();
  if (parsed.version === 4) return `v4:${parsed.value >> 8n}`;
  return `v6:${parsed.value >> 64n}`;
}

export function getClientTokenKey(headers: Headers, ip: string): string {
  const ua = headers.get("user-agent") || "";
  const lang = headers.get("accept-language")?.split(",")[0] || "";
  const raw = [getIpBucket(ip), ua, lang].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function issueHumanToken(clientKey: string, ttlHours: number, scope = "global"): string {
  const exp = Date.now() + ttlHours * 3600 * 1000;
  const payload = `${clientKey}:${scope}:${exp}`;
  const mac = sign(payload);
  return Buffer.from(`${payload}:${mac}`).toString("base64url");
}

export function issueTransferToken(clientKey: string, ttlSeconds: number, scope: string): string {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = `${clientKey}:${scope}:${exp}`;
  const mac = sign(payload);
  return Buffer.from(`${payload}:${mac}`).toString("base64url");
}

export function verifyTransferToken(token: string, clientKey: string, scope: string): boolean {
  return verifyHumanToken(token, clientKey, scope);
}

export function verifyHumanToken(token: string, clientKey: string, scope = "global"): boolean {
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

    const parsed = parsePayload(payload, clientKey, scope);
    if (!parsed) return false;
    const { exp } = parsed;
    if (Date.now() > exp) return false;

    return true;
  } catch {
    return false;
  }
}

function parsePayload(
  payload: string,
  clientKey: string,
  scope: string
): { exp: number } | null {
  const parts = payload.split(":");
  if (parts.length < 2) return null;

  const exp = parseInt(parts[parts.length - 1], 10);
  if (!Number.isFinite(exp)) return null;

  const scopedByKnownClient =
    parts[0] === clientKey ? parts.slice(1, -1).join(":") : "";
  if (scopedByKnownClient === scope) return { exp };

  const legacyScope = parts.length >= 3 ? parts[parts.length - 2] : "global";
  const legacyClientKey =
    parts.length >= 3 ? parts.slice(0, -2).join(":") : parts.slice(0, -1).join(":");
  if (legacyClientKey === clientKey && legacyScope === scope) return { exp };

  return null;
}

export const HUMAN_COOKIE = "hv";
export const PROBED_COOKIE = "hpb";
