import fs from "node:fs";
import path from "node:path";
import maxmind, { Reader, CityResponse } from "maxmind";

// 地理库目录:容器内挂载到 /data/geodata,本地为项目 geodata/
function geoDir(): string {
  return process.env.GEODATA_DIR || path.join(process.cwd(), "geodata");
}

// ---------- DB-IP / GeoLite2 City(.mmdb)→ 国家/省/市 ----------
let _cityReader: Reader<CityResponse> | null = null;
let _cityTried = false;

async function getCityReader(): Promise<Reader<CityResponse> | null> {
  if (_cityTried) return _cityReader;
  _cityTried = true;
  try {
    const dir = geoDir();
    // 自动找目录里第一个 .mmdb(dbip-city-lite-xxx.mmdb 或 GeoLite2-City.mmdb)
    const file = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".mmdb"));
    if (!file) return null;
    _cityReader = await maxmind.open<CityResponse>(path.join(dir, file));
  } catch {
    _cityReader = null;
  }
  return _cityReader;
}

// ---------- ip2asn-v4.tsv → 运营商(ASN 名)----------
// 加载到内存:三个并行数组(起始IP、结束IP、描述),二分查找
let _asnStart: Uint32Array | null = null;
let _asnEnd: Uint32Array | null = null;
let _asnDesc: string[] | null = null;
let _asnCountry: string[] | null = null;
let _asnTried = false;

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null; // 仅 IPv4
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function loadAsn() {
  if (_asnTried) return;
  _asnTried = true;
  try {
    const file = path.join(geoDir(), "ip2asn-v4.tsv");
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const starts: number[] = [];
    const ends: number[] = [];
    const descs: string[] = [];
    const countries: string[] = [];
    for (const line of lines) {
      if (!line) continue;
      const c = line.split("\t");
      if (c.length < 5) continue;
      const s = ipToInt(c[0]);
      const e = ipToInt(c[1]);
      if (s === null || e === null) continue;
      starts.push(s);
      ends.push(e);
      countries.push(c[3]); // 国家代码
      descs.push(c[4]); // 运营商描述
    }
    _asnStart = Uint32Array.from(starts);
    _asnEnd = Uint32Array.from(ends);
    _asnDesc = descs;
    _asnCountry = countries;
  } catch {
    _asnStart = null;
  }
}

// 二分查找 IP 所在区间,返回 [国家代码, 运营商描述]
function lookupAsn(ip: string): { country: string; desc: string } | null {
  loadAsn();
  if (!_asnStart || !_asnEnd || !_asnDesc || !_asnCountry) return null;
  const n = ipToInt(ip);
  if (n === null) return null;
  let lo = 0;
  let hi = _asnStart.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (n < _asnStart[mid]) hi = mid - 1;
    else if (n > _asnEnd[mid]) lo = mid + 1;
    else return { country: _asnCountry[mid], desc: _asnDesc[mid] };
  }
  return null;
}

// ASN 英文描述 → 中文运营商(国内三大 + 常见)
function normalizeIsp(desc: string): string {
  const u = desc.toUpperCase();
  if (u.includes("CHINANET") || u.includes("CHINA TELECOM")) return "中国电信";
  if (u.includes("CHINA169") || u.includes("CHINA UNICOM") || u.includes("UNICOM") || u.includes("CNCGROUP")) return "中国联通";
  if (u.includes("CHINA MOBILE") || u.includes("CMNET") || u.includes("CHINAMOBILE")) return "中国移动";
  if (u.includes("CERNET")) return "教育网";
  if (u.includes("CHINA BROADCASTING") || u.includes("CHINA CABLE")) return "中国广电";
  // 其它(国外或未识别)直接返回原始描述,截断过长
  return desc.length > 40 ? desc.slice(0, 40) : desc;
}

export interface GeoResult {
  country: string;
  province: string;
  city: string;
  isp: string;
}

// 主查询:国内外通用。city 库给国家/省/市,asn 库给运营商
export async function lookupGeo(ip: string): Promise<GeoResult> {
  const out: GeoResult = { country: "", province: "", city: "" , isp: "" };
  if (!ip) return out;

  // 运营商(同步,二分查找)
  const asn = lookupAsn(ip);
  if (asn) {
    out.isp = normalizeIsp(asn.desc);
    out.country = asn.country; // 先用 ASN 的国家代码兜底
  }

  // 国家/省/市(mmdb)
  try {
    const reader = await getCityReader();
    if (reader) {
      const r = reader.get(ip);
      if (r) {
        const names = (x: any) => (x?.names?.["zh-CN"] || x?.names?.en || "");
        if (r.country) out.country = names(r.country) || out.country;
        if (r.subdivisions && r.subdivisions[0]) out.province = names(r.subdivisions[0]);
        if (r.city) out.city = names(r.city);
      }
    }
  } catch {
    // mmdb 缺失或出错时,保留 ASN 国家
  }

  return out;
}
