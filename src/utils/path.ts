import { IMAGE_EXTENSIONS } from "../constants";

export function normalizeVaultPath(path: string): string {
  return path
    .trim()
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

export function fileExtension(path: string): string {
  const clean = path.split(/[?#]/, 1)[0] ?? path;
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(path));
}

export function baseName(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function dirName(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

/** Generate an ASCII-safe slug. Returns an empty string for CJK-only titles. */
export function slugify(value: string, maxLength = 80): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug.slice(0, maxLength).replace(/-+$/, "");
}

/**
 * WordPress accepts a Content-Disposition filename. Keep an ASCII fallback for
 * older servers while sending the UTF-8 original as RFC 5987 metadata.
 */
export function uploadFilename(path: string): string {
  const name = baseName(path);
  const extension = fileExtension(name);
  const stem = extension ? name.slice(0, -(extension.length + 1)) : name;
  const asciiStem =
    slugify(stem, 60) || `image-${Date.now().toString(36)}`;
  const ascii = extension ? `${asciiStem}.${extension}` : asciiStem;
  return ascii;
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
