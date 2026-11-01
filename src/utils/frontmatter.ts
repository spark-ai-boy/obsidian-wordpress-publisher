import type { NotePublishMeta, PostFormat, PostStatus } from "../types";
import { FRONTMATTER_KEYS, POST_FORMATS, POST_STATUSES } from "../constants";
import { parseIdList, parseTagList } from "./markdown";

type Frontmatter = Record<string, unknown> | undefined;

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return parseTagList(value);
  }
  return [];
}

export function readNoteMeta(frontmatter: Frontmatter): NotePublishMeta {
  if (!frontmatter) {
    return {};
  }

  const status = asString(frontmatter[FRONTMATTER_KEYS.status]) as
    | PostStatus
    | undefined;
  const format = asString(frontmatter[FRONTMATTER_KEYS.format]) as
    | PostFormat
    | undefined;

  return {
    postId: asNumber(frontmatter[FRONTMATTER_KEYS.postId]),
    postUrl: asString(frontmatter[FRONTMATTER_KEYS.postUrl]),
    siteUrl: asString(frontmatter[FRONTMATTER_KEYS.siteUrl]),
    status: status && POST_STATUSES.includes(status) ? status : undefined,
    lastSync: asString(frontmatter[FRONTMATTER_KEYS.lastSync]),
    remoteModified: asString(frontmatter[FRONTMATTER_KEYS.remoteModified]),
    categories: parseIdList(frontmatter[FRONTMATTER_KEYS.categories]),
    tags: asStringArray(frontmatter[FRONTMATTER_KEYS.tags]),
    featuredMedia: asNumber(frontmatter[FRONTMATTER_KEYS.featuredMedia]),
    featuredImage: asString(frontmatter[FRONTMATTER_KEYS.featuredImage]),
    slug: asString(frontmatter[FRONTMATTER_KEYS.slug]),
    format: format && POST_FORMATS.includes(format) ? format : undefined
  };
}

function cleanImageReference(value: string): string {
  let clean = value.trim();
  const wiki = clean.match(/^!?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
  if (wiki) {
    clean = (wiki[1] ?? "").trim();
  }
  const markdown = clean.match(/^!?\[[^\]]*\]\(([^)]+)\)$/);
  if (markdown) {
    clean = (markdown[1] ?? "").trim().replace(/^<|>$/g, "");
  }
  return clean.replace(/^["']|["']$/g, "").trim();
}

export function getFrontmatterString(
  frontmatter: Frontmatter,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value: unknown = frontmatter?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const first: unknown = value.find(
        (item) => typeof item === "string" && item.trim()
      );
      if (typeof first === "string") {
        return first.trim();
      }
    }
  }
  return undefined;
}

export function getNoteTitleFromFrontmatter(
  frontmatter: Frontmatter
): string | undefined {
  return getFrontmatterString(frontmatter, ["wordpress_title", "title"]);
}

export function getNoteSlug(frontmatter: Frontmatter): string | undefined {
  return getFrontmatterString(frontmatter, [
    FRONTMATTER_KEYS.slug,
    "slug"
  ]);
}

export function getNoteExcerpt(frontmatter: Frontmatter): string | undefined {
  return getFrontmatterString(frontmatter, [
    "wordpress_excerpt",
    "excerpt",
    "description"
  ]);
}

export function getNoteFeaturedImage(
  frontmatter: Frontmatter
): string | undefined {
  const value = getFrontmatterString(frontmatter, [
    FRONTMATTER_KEYS.featuredImage,
    "featured_image",
    "cover",
    "image",
    "featured"
  ]);
  return value ? cleanImageReference(value) : undefined;
}

/** Collect YAML tags, supporting both `tags` and the singular `tag` key. */
export function getNoteTags(frontmatter: Frontmatter): string[] {
  if (!frontmatter) {
    return [];
  }
  const values = [
    ...asStringArray(frontmatter.tags),
    ...asStringArray(frontmatter.tag)
  ];
  return parseTagList(values.join(","));
}
