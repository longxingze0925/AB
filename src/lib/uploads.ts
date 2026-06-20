import path from "node:path";

export const IMAGE_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function uploadDir(): string {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "uploads");
}

export function isUploadImagePath(value: string): boolean {
  return /^\/uploads\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp|gif)$/i.test(value);
}

export function normalizeUploadImagePath(value: unknown): string {
  const pathValue = String(value || "").trim();
  return pathValue && isUploadImagePath(pathValue) ? pathValue : "";
}
