import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { getDb } from "./db";

export interface LandingTemplate {
  id: number;
  name: string;
  storage_key: string;
  entry_file: string;
  file_count: number;
  size_bytes: number;
  created_at: string;
}

const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 120;
const ALLOWED_EXT = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

export const TEMPLATE_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

export function landingTemplatesDir(): string {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "landing-templates");
}

export function listLandingTemplates(): LandingTemplate[] {
  return getDb()
    .prepare("SELECT * FROM landing_templates ORDER BY id DESC")
    .all() as LandingTemplate[];
}

export function getLandingTemplateById(id: number): LandingTemplate | null {
  if (!id) return null;
  const row = getDb()
    .prepare("SELECT * FROM landing_templates WHERE id = ? LIMIT 1")
    .get(id) as LandingTemplate | undefined;
  return row || null;
}

export function createLandingTemplateRecord(input: {
  name: string;
  storageKey: string;
  fileCount: number;
  sizeBytes: number;
}): LandingTemplate {
  const info = getDb()
    .prepare(
      `INSERT INTO landing_templates (name, storage_key, entry_file, file_count, size_bytes)
       VALUES (@name, @storage_key, 'index.html', @file_count, @size_bytes)`
    )
    .run({
      name: input.name,
      storage_key: input.storageKey,
      file_count: input.fileCount,
      size_bytes: input.sizeBytes,
    });
  return getLandingTemplateById(Number(info.lastInsertRowid))!;
}

export async function deleteLandingTemplate(id: number) {
  const tpl = getLandingTemplateById(id);
  if (!tpl) return;

  getDb().transaction(() => {
    getDb()
      .prepare(
        "UPDATE landing_routes SET landing_mode='default', landing_template_id=NULL WHERE landing_template_id = ?"
      )
      .run(id);
    getDb().prepare("DELETE FROM landing_templates WHERE id = ?").run(id);
  })();

  const root = path.resolve(landingTemplatesDir());
  const target = path.resolve(root, tpl.storage_key);
  if (target.startsWith(root + path.sep)) {
    await fsp.rm(target, { recursive: true, force: true });
  }
}

export async function saveTemplateZip(file: File, name: string): Promise<LandingTemplate> {
  if (file.size > MAX_TEMPLATE_BYTES) {
    throw new Error("模板包不能超过 10MB");
  }
  if (!/\.zip$/i.test(file.name)) {
    throw new Error("请上传 .zip 模板包");
  }

  const storageKey = `${Date.now()}-${randomUUID()}`;
  const dest = path.join(landingTemplatesDir(), storageKey);
  await fsp.mkdir(dest, { recursive: true });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await extractStaticZip(bytes, dest);
    return createLandingTemplateRecord({
      name: name || file.name.replace(/\.zip$/i, ""),
      storageKey,
      fileCount: result.fileCount,
      sizeBytes: result.sizeBytes,
    });
  } catch (err) {
    await fsp.rm(dest, { recursive: true, force: true });
    throw err;
  }
}

export function resolveTemplateFile(template: LandingTemplate, parts: string[]): string | null {
  const relativePath = normalizeTemplatePath(parts.join("/"));
  if (!relativePath) return null;
  const root = path.resolve(landingTemplatesDir(), template.storage_key);
  const filePath = path.resolve(root, ...relativePath.split("/"));
  return filePath.startsWith(root + path.sep) ? filePath : null;
}

async function extractStaticZip(buffer: Buffer, dest: string): Promise<{ fileCount: number; sizeBytes: number }> {
  const entries = readCentralDirectory(buffer);
  let fileCount = 0;
  let sizeBytes = 0;
  let hasIndex = false;
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    if (entry.name.startsWith("__MACOSX/") || entry.name.endsWith("/.DS_Store")) continue;

    const safeName = normalizeTemplatePath(entry.name);
    if (!safeName) throw new Error(`模板包包含非法路径：${entry.name}`);
    if (seen.has(safeName)) throw new Error(`模板包包含重复文件：${safeName}`);
    seen.add(safeName);

    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new Error(`不支持的模板文件类型：${safeName}`);
    }
    if (entry.method !== 0 && entry.method !== 8) {
      throw new Error(`不支持的 ZIP 压缩方式：${safeName}`);
    }
    if (entry.uncompressedSize > MAX_TEMPLATE_BYTES) {
      throw new Error(`模板单文件不能超过 10MB：${safeName}`);
    }

    fileCount += 1;
    sizeBytes += entry.uncompressedSize;
    if (fileCount > MAX_FILE_COUNT) throw new Error(`模板文件不能超过 ${MAX_FILE_COUNT} 个`);
    if (sizeBytes > MAX_TEMPLATE_BYTES) throw new Error("模板解压后不能超过 10MB");
    if (safeName === "index.html") hasIndex = true;

    const data = inflateEntry(buffer, entry);
    if (data.length !== entry.uncompressedSize) {
      throw new Error(`模板文件大小异常：${safeName}`);
    }

    const target = path.resolve(dest, ...safeName.split("/"));
    const root = path.resolve(dest);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`模板包包含非法路径：${safeName}`);
    }

    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, data);
  }

  if (!hasIndex) throw new Error("模板包必须包含 index.html");
  return { fileCount, sizeBytes };
}

function readCentralDirectory(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error("ZIP 文件格式不正确");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("暂不支持 ZIP64 模板包");
  }
  if (cdOffset + cdSize > buffer.length) throw new Error("ZIP 文件目录损坏");

  const entries: ZipEntry[] = [];
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error("ZIP 文件目录损坏");
    const flags = buffer.readUInt16LE(pos + 8);
    if ((flags & 1) === 1) throw new Error("不支持加密 ZIP 模板包");

    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString("utf8").replace(/\\/g, "/");

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inflateEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const pos = entry.localOffset;
  if (buffer.readUInt32LE(pos) !== 0x04034b50) throw new Error(`ZIP 文件内容损坏：${entry.name}`);
  const nameLen = buffer.readUInt16LE(pos + 26);
  const extraLen = buffer.readUInt16LE(pos + 28);
  const start = pos + 30 + nameLen + extraLen;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  return entry.method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function normalizeTemplatePath(value: string): string {
  const input = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!input || input.includes("\0")) return "";
  if (input.startsWith("/") || /^[a-zA-Z]:/.test(input)) return "";
  const parts = input.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return parts.join("/");
}
