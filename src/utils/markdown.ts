/** Pure Markdown helpers used by the publishing pipeline and tests. */

export interface LeadingHeading {
  title: string;
  body: string;
}

/**
 * Remove a leading YAML frontmatter block. The regex intentionally anchors to
 * the start of the file so horizontal rules later in the document are kept.
 */
export function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "");
  const match = normalized.match(
    /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/
  );
  return match ? normalized.slice(match[0].length) : normalized;
}

/** Find and remove the first ATX H1 if it is the first non-empty line. */
export function extractLeadingH1(markdown: string): LeadingHeading | null {
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && (lines[index] ?? "").trim() === "") {
    index += 1;
  }

  const line = (lines[index] ?? "").trim();
  const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
  if (!match) {
    return null;
  }

  const title = (match[1] ?? "").trim();
  if (!title) {
    return null;
  }

  const remaining = [...lines.slice(0, index), ...lines.slice(index + 1)];
  return {
    title,
    body: remaining.join("\n").replace(/^\s*\n/, "")
  };
}

/** Remove the leading H1 only when it is the source of the post title. */
export function stripMatchingH1(markdown: string, title: string): string {
  const leading = extractLeadingH1(markdown);
  if (!leading) {
    return markdown;
  }
  const normalize = (value: string) =>
    plainText(value).replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(leading.title) === normalize(title)
    ? leading.body
    : markdown;
}

/** Remove Obsidian comments (%% ... %%), including multiline comments. */
export function stripObsidianComments(markdown: string): string {
  return markdown.replace(/%%[\s\S]*?%%/g, "");
}

/** Convert an inline Markdown string to readable plain text. */
export function plainText(markdown: string): string {
  return markdown
    .replace(
      /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match, _target: string, alias?: string) => alias ?? ""
    )
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match, target: string, alias?: string) => alias ?? target
    )
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptFromMarkdown(markdown: string, maxLength = 180): string {
  const text = plainText(stripFrontmatter(stripObsidianComments(markdown)));
  if (text.length <= maxLength) {
    return text;
  }
  const shortened = text.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? shortened.slice(0, lastSpace) : shortened).trim()}…`;
}

export function parseTagList(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(/[,，;；\n]+/)) {
    const tag = raw.trim().replace(/^#+/, "").trim();
    if (!tag) {
      continue;
    }
    const key = tag.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

export function parseIdList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return [value];
    }
    if (typeof value === "string") {
      return value
        .split(/[,，\s]+/)
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);
    }
    return [];
  }
  const ids: number[] = [];
  for (const item of value) {
    const id = typeof item === "number" ? item : Number(String(item).trim());
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

interface MaskedContent {
  text: string;
  restore: (value: string) => string;
}

/**
 * Protect code and math from link/image rewriting. Placeholders use a private
 * use area code point that will not occur in normal notes.
 */
export function maskProtectedContent(markdown: string): MaskedContent {
  const store: string[] = [];
  const pattern =
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|<code\b[\s\S]*?<\/code>|<pre\b[\s\S]*?<\/pre>|\$\$[\s\S]*?\$\$|\$[^$\n]*\[\[[^$\n]*\$|\\\[[\s\S]*?\\\]/gi;

  const text = markdown.replace(pattern, (match) => {
    const token = `\uE000WPC${store.length}\uE000`;
    store.push(match);
    return token;
  });

  return {
    text,
    restore: (value: string) =>
      value.replace(/\uE000WPC(\d+)\uE000/g, (_match, index: string) => {
        return store[Number(index)] ?? "";
      })
  };
}
