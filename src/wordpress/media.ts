import type { App, TFile } from "obsidian";
import { TFile as TFileClass } from "obsidian";
import type { MediaCacheEntry, SiteProfile } from "../types";
import { MAX_MEDIA_CACHE_ENTRIES } from "../constants";
import { t } from "../i18n";
import { WordPressError } from "../utils/errors";
import {
  baseName,
  fileExtension,
  isImagePath,
  normalizeVaultPath,
  uploadFilename
} from "../utils/path";
import { isHttpUrl, normalizeSiteUrl } from "../utils/url";
import { WordPressClient } from "./client";
import { maskProtectedContent } from "../utils/markdown";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml"
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg"
};

export interface UploadedImage {
  id: number;
  url: string;
  alt: string;
  source: string;
}

export interface PreparedContent {
  markdown: string;
  uploadedImages: UploadedImage[];
  localImageCount: number;
  warnings: string[];
}

export interface MediaOptions {
  uploadContentImages: boolean;
  uploadRemoteImages: boolean;
  onProgress?: (message: string) => void;
}

interface ParsedDestination {
  url: string;
  title?: string;
}

function mimeForPath(path: string): string {
  return MIME_BY_EXTENSION[fileExtension(path)] ?? "application/octet-stream";
}

function stripContentType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseMarkdownDestination(raw: string): ParsedDestination {
  let value = raw.trim();
  if (value.startsWith("<")) {
    const close = value.indexOf(">");
    if (close > 0) {
      return { url: value.slice(1, close).trim() };
    }
  }
  const quoted = value.match(/^(\S+?)(?:\s+["']([\s\S]*)["'])?$/);
  return quoted
    ? { url: quoted[1] ?? value, title: quoted[2] }
    : { url: value };
}

function markdownUrl(url: string): string {
  return /\s/.test(url) ? `<${url}>` : url;
}

function markdownAlt(alt: string): string {
  return alt.replace(/[\\[\]]/g, "\\$&");
}

function isRemoteImageSkippable(contentType: string, filename: string): boolean {
  const type = stripContentType(contentType);
  return !type.startsWith("image/") && !isImagePath(filename);
}

function wikiAlt(alias: string, target: string): string {
  const value = alias.trim();
  if (value && !/^\d+(?:x\d+)?$/.test(value)) {
    return value;
  }
  return baseName(target);
}

export class MediaService {
  private readonly app: App;
  private readonly client: WordPressClient;
  private readonly cache: Record<string, MediaCacheEntry>;
  private readonly persist: () => Promise<void>;
  private readonly siteKey: string;

  constructor(
    app: App,
    client: WordPressClient,
    site: SiteProfile,
    cache: Record<string, MediaCacheEntry>,
    persist: () => Promise<void>
  ) {
    this.app = app;
    this.client = client;
    this.cache = cache;
    this.persist = persist;
    this.siteKey = normalizeSiteUrl(site.url);
  }

  /**
   * Upload local and (optionally) remote images, returning Markdown whose image
   * links point at WordPress media URLs.
   */
  async prepareMarkdown(
    markdown: string,
    sourceFile: TFile,
    options: MediaOptions
  ): Promise<PreparedContent> {
    const masked = maskProtectedContent(markdown);
    const pattern =
      /!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\n]+?)\s*\)/g;
    const uploadedImages: UploadedImage[] = [];
    const warnings: string[] = [];
    let localImageCount = 0;
    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(masked.text)) !== null) {
      const start = match.index;
      result += masked.text.slice(lastIndex, start);
      lastIndex = start + match[0].length;

      const wiki = match[1];
      const markdownAltText = match[2] ?? "";
      const destination = match[3];

      if (wiki !== undefined) {
        const pipe = wiki.indexOf("|");
        const rawTarget = (pipe >= 0 ? wiki.slice(0, pipe) : wiki).trim();
        const alias = (pipe >= 0 ? wiki.slice(pipe + 1) : "").trim();
        const target = rawTarget.split("#", 1)[0] ?? rawTarget;
        const alt = wikiAlt(alias, target);

        if (isHttpUrl(target)) {
          if (!options.uploadRemoteImages) {
            result += `![${markdownAlt(alt)}](${markdownUrl(target)})`;
            continue;
          }
          options.onProgress?.(
            t("notice.uploadingImage", { name: baseName(target) })
          );
          const uploaded = await this.tryUploadRemote(
            target,
            alt,
            warnings
          );
          if (uploaded) {
            uploadedImages.push(uploaded);
            result += `![${markdownAlt(alt)}](${uploaded.url})`;
          } else {
            result += `![${markdownAlt(alt)}](${markdownUrl(target)})`;
          }
          continue;
        }

        const file = this.resolveVaultFile(target, sourceFile);
        if (!file) {
          if (isImagePath(target)) {
            warnings.push(t("notice.missingImage", { path: target }));
            result += alt ? alt : "";
          } else {
            // Could be an embedded note; the link transformer handles it.
            result += match[0];
          }
          continue;
        }

        if (!isImagePath(file.path)) {
          result += match[0];
          continue;
        }

        localImageCount += 1;
        if (!options.uploadContentImages) {
          result += match[0];
          continue;
        }

        options.onProgress?.(t("notice.uploadingImage", { name: file.name }));
        const uploaded = await this.uploadLocal(file, alt);
        uploadedImages.push(uploaded);
        result += `![${markdownAlt(alt)}](${uploaded.url})`;
        continue;
      }

      if (destination === undefined) {
        result += match[0];
        continue;
      }

      const parsed = parseMarkdownDestination(destination);
      const alt = markdownAltText || baseName(parsed.url);
      if (isHttpUrl(parsed.url)) {
        if (!options.uploadRemoteImages) {
          result += `![${markdownAlt(alt)}](${markdownUrl(parsed.url)})`;
          continue;
        }
        options.onProgress?.(
          t("notice.uploadingImage", { name: baseName(parsed.url) })
        );
        const uploaded = await this.tryUploadRemote(
          parsed.url,
          alt,
          warnings
        );
        if (uploaded) {
          uploadedImages.push(uploaded);
          result += `![${markdownAlt(alt)}](${uploaded.url})`;
        } else {
          result += `![${markdownAlt(alt)}](${markdownUrl(parsed.url)})`;
        }
        continue;
      }

      const path = decodeSafely(parsed.url);
      const file = this.resolveVaultFile(path, sourceFile);
      if (!file) {
        if (isImagePath(path)) {
          warnings.push(t("notice.missingImage", { path }));
          result += alt ? alt : "";
        } else {
          result += match[0];
        }
        continue;
      }
      if (!isImagePath(file.path)) {
        result += match[0];
        continue;
      }

      localImageCount += 1;
      if (!options.uploadContentImages) {
        result += match[0];
        continue;
      }

      options.onProgress?.(t("notice.uploadingImage", { name: file.name }));
      const uploaded = await this.uploadLocal(file, alt);
      uploadedImages.push(uploaded);
      result += `![${markdownAlt(alt)}](${uploaded.url})`;
    }

    result += masked.text.slice(lastIndex);
    return {
      markdown: masked.restore(result),
      uploadedImages,
      localImageCount,
      warnings
    };
  }

  /** Resolve an explicitly selected featured image to a media library item. */
  async uploadFeatured(
    source: string,
    sourceFile: TFile,
    alt = "",
    onProgress?: (message: string) => void
  ): Promise<UploadedImage> {
    const clean = source.trim();
    if (!clean) {
      throw new WordPressError(t("notice.missingImage", { path: source }));
    }

    if (isHttpUrl(clean)) {
      onProgress?.(t("notice.uploadingImage", { name: baseName(clean) }));
      const uploaded = await this.uploadRemote(clean, alt, true);
      if (!uploaded) {
        throw new WordPressError(t("notice.remoteImageSkipped", { url: clean }));
      }
      return uploaded;
    }

    const file = this.resolveVaultFile(decodeSafely(clean), sourceFile);
    if (!file || !isImagePath(file.path)) {
      throw new WordPressError(t("notice.missingImage", { path: clean }));
    }
    onProgress?.(t("notice.uploadingImage", { name: file.name }));
    return this.uploadLocal(file, alt || file.basename);
  }

  private resolveVaultFile(source: string, sourceFile: TFile): TFile | null {
    let path = decodeSafely(source.trim())
      .replace(/^<|>$/g, "")
      .replace(/^app:\/\/[^/]+\//, "");
    path = path.split("#", 1)[0] ?? path;
    path = path.split("?", 1)[0] ?? path;
    if (!path) {
      return null;
    }

    const direct = this.app.vault.getAbstractFileByPath(
      normalizeVaultPath(path)
    );
    if (direct instanceof TFileClass) {
      return direct;
    }

    const resolved = this.app.metadataCache.getFirstLinkpathDest(
      decodeSafely(path),
      sourceFile.path
    );
    if (resolved instanceof TFileClass) {
      return resolved;
    }

    return null;
  }

  private cacheKey(kind: "local" | "remote", value: string): string {
    return `${this.siteKey}:${kind}:${value}`;
  }

  private async uploadLocal(file: TFile, alt: string): Promise<UploadedImage> {
    const key = this.cacheKey("local", file.path);
    const mtime = file.stat.mtime;
    const size = file.stat.size;
    const cached = this.cache[key];
    if (cached && cached.mtime === mtime && cached.size === size) {
      return { id: cached.id, url: cached.url, alt, source: file.path };
    }

    if (!isImagePath(file.path)) {
      throw new WordPressError(t("notice.imageUploadFailed", {
        name: file.path,
        error: t("notice.unsupportedImageType")
      }));
    }

    const data = await this.app.vault.readBinary(file);
    const media = await this.client.uploadMedia(
      uploadFilename(file.path),
      data,
      mimeForPath(file.path),
      alt
    );
    if (!media.source_url) {
      throw new WordPressError(t("connection.badJson"), {
        code: "media_missing_url"
      });
    }

    this.cache[key] = {
      id: media.id,
      url: media.source_url,
      mtime,
      size,
      alt,
      updatedAt: Date.now()
    };
    await this.trimCache();
    return { id: media.id, url: media.source_url, alt, source: file.path };
  }

  private async uploadRemote(
    url: string,
    alt: string,
    throwOnFailure: boolean
  ): Promise<UploadedImage | null> {
    const key = this.cacheKey("remote", url);
    const cached = this.cache[key];
    if (cached) {
      return { id: cached.id, url: cached.url, alt, source: url };
    }

    try {
      const downloaded = await this.client.downloadRemoteFile(url);
      const contentType = stripContentType(downloaded.contentType);
      if (isRemoteImageSkippable(contentType, url)) {
        if (throwOnFailure) {
          throw new WordPressError(
            t("notice.remoteImageSkipped", { url })
          );
        }
        return null;
      }

      const filename = this.remoteFilename(url, contentType);
      const media = await this.client.uploadMedia(
        filename,
        downloaded.data,
        contentType.startsWith("image/") ? contentType : mimeForPath(filename),
        alt
      );
      if (!media.source_url) {
        throw new WordPressError(t("connection.badJson"), {
          code: "media_missing_url"
        });
      }

      this.cache[key] = {
        id: media.id,
        url: media.source_url,
        mtime: 0,
        size: 0,
        alt,
        updatedAt: Date.now()
      };
      await this.trimCache();
      return { id: media.id, url: media.source_url, alt, source: url };
    } catch (error) {
      if (throwOnFailure) {
        throw error;
      }
      return null;
    }
  }

  private async tryUploadRemote(
    url: string,
    alt: string,
    warnings: string[]
  ): Promise<UploadedImage | null> {
    try {
      const uploaded = await this.uploadRemote(url, alt, false);
      if (!uploaded) {
        warnings.push(t("notice.remoteImageSkipped", { url }));
      }
      return uploaded;
    } catch {
      warnings.push(t("notice.remoteImageSkipped", { url }));
      return null;
    }
  }

  private remoteFilename(url: string, contentType: string): string {
    let name = "";
    try {
      name = baseName(decodeSafely(new URL(url).pathname));
    } catch {
      name = "remote-image";
    }
    name = name.replace(/[^\w.\-]+/g, "-");
    if (!fileExtension(name)) {
      const extension = EXTENSION_BY_MIME[contentType] ?? "jpg";
      name = `${name || "remote-image"}.${extension}`;
    }
    return name;
  }

  private async trimCache(): Promise<void> {
    const entries = Object.entries(this.cache);
    if (entries.length <= MAX_MEDIA_CACHE_ENTRIES) {
      await this.persistSafely();
      return;
    }
    entries
      .sort(
        ([, left], [, right]) =>
          (left.updatedAt ?? 0) - (right.updatedAt ?? 0)
      )
      .slice(0, entries.length - MAX_MEDIA_CACHE_ENTRIES)
      .forEach(([key]) => {
        delete this.cache[key];
      });
    await this.persistSafely();
  }

  private async persistSafely(): Promise<void> {
    try {
      await this.persist();
    } catch {
      // A failed cache write must not abort a successful publish.
    }
  }
}
