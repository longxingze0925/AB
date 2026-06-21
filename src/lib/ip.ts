import { isIP } from "node:net";

export interface ParsedIp {
  version: 4 | 6;
  value: bigint;
}

export interface ParsedCidr {
  version: 4 | 6;
  base: bigint;
  prefix: number;
}

export function parseIp(ip: string): ParsedIp | null {
  const value = String(ip || "").trim().toLowerCase();
  const version = isIP(value);
  if (version === 4) return parseIpv4(value);
  if (version === 6) return parseIpv6(value);
  return null;
}

export function parseCidr(input: string): ParsedCidr | null {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;
  const [ipPart, prefixPart] = raw.split("/");
  if (raw.split("/").length > 2) return null;
  const ip = parseIp(ipPart);
  if (!ip) return null;
  const maxPrefix = ip.version === 4 ? 32 : 128;
  const prefix = prefixPart === undefined ? maxPrefix : Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;
  return { version: ip.version, base: maskIp(ip.value, prefix, maxPrefix), prefix };
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const parsedIp = parseIp(ip);
  const parsedCidr = parseCidr(cidr);
  if (!parsedIp || !parsedCidr || parsedIp.version !== parsedCidr.version) return false;
  const maxPrefix = parsedIp.version === 4 ? 32 : 128;
  return maskIp(parsedIp.value, parsedCidr.prefix, maxPrefix) === parsedCidr.base;
}

export function compareIpValue(a: bigint, b: bigint): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function parseIpv4(ip: string): ParsedIp | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8n) + BigInt(n);
  }
  return { version: 4, value: out };
}

function parseIpv6(ip: string): ParsedIp | null {
  const zoneIndex = ip.indexOf("%");
  const clean = zoneIndex >= 0 ? ip.slice(0, zoneIndex) : ip;
  const expanded = expandIpv6(clean);
  if (!expanded) return null;
  let out = 0n;
  for (const part of expanded) {
    const n = parseInt(part, 16);
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
    out = (out << 16n) + BigInt(n);
  }
  return { version: 6, value: out };
}

function expandIpv6(ip: string): string[] | null {
  if (!ip.includes(":")) return null;
  const [headRaw, tailRaw, extra] = ip.split("::");
  if (extra !== undefined) return null;

  const head = splitIpv6Side(headRaw || "");
  const tail = splitIpv6Side(tailRaw || "");
  if (!head || !tail) return null;

  const mappedParts = head.length > 0 && head[head.length - 1].includes(".") ? head : tail;
  if (mappedParts.length > 0 && mappedParts[mappedParts.length - 1].includes(".")) {
    const mapped = parseIp(mappedParts[mappedParts.length - 1]);
    if (!mapped || mapped.version !== 4) return null;
    const high = Number((mapped.value >> 16n) & 0xffffn).toString(16);
    const low = Number(mapped.value & 0xffffn).toString(16);
    mappedParts.splice(mappedParts.length - 1, 1, high, low);
  }

  const missing = 8 - head.length - tail.length;
  if (ip.includes("::")) {
    if (missing < 0) return null;
    return [...head, ...Array(missing).fill("0"), ...tail];
  }
  if (missing !== 0) return null;
  return head;
}

function splitIpv6Side(side: string): string[] | null {
  if (!side) return [];
  const parts = side.split(":");
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part) && !part.includes(".")) return null;
  }
  return parts;
}

function maskIp(value: bigint, prefix: number, bits: number): bigint {
  if (prefix === 0) return 0n;
  const shift = BigInt(bits - prefix);
  return (value >> shift) << shift;
}
